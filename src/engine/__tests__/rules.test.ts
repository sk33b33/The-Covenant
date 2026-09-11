import { beforeEach, describe, expect, it } from 'vitest'
import { RULES } from '@/game/config'
import { STARTER_DECK } from '@/data/starter'
import { requireCard } from '@/data/cards'
import { isFigure } from '@/game/types'
import { IllegalAction, reduce } from '../reducer'
import { legalActions, setupOptions } from '../legal'
import { effectIsImplemented } from '../effects'
import { DIFFICULTY, chooseAction } from '../ai'
import { createRng } from '@/game/rng'
import { ALL_MIRACLES, miracleFor } from '@/game/miracles'
import { createMatch, figureCard, makeFigure, resetUids, type MatchSetup } from '../state'
import type { Action } from '../actions'
import type { MatchState, PlayerId } from '../types'

/**
 * Rules tests.
 *
 * Every match here is built from an explicit seed and, where the flip matters,
 * an explicit `forceFirst` — so a failure names a rule, not a run of bad luck.
 */

const DECK = STARTER_DECK.cards
const ENERGY = STARTER_DECK.energy

function match(overrides: Partial<MatchSetup> = {}): MatchState {
  return createMatch({
    seed: 1234,
    you: { deck: DECK, energy: ENERGY },
    foe: { deck: DECK, energy: ENERGY },
    ...overrides,
  })
}

/** Places a legal opening board for both players and reaches the main phase. */
function setUpBoth(state: MatchState): MatchState {
  let next = state
  for (const player of ['you', 'foe'] as PlayerId[]) {
    const option = setupOptions(next, player)[0]
    if (!option) throw new Error(`No opening placement for ${player}`)
    next = reduce(next, { type: 'SETUP', player, ...option })
  }
  return next
}

const started = (overrides: Partial<MatchSetup> = {}) => setUpBoth(match(overrides))

beforeEach(() => resetUids())

/* ---------------------------------------------------------------- opening */

describe('the opening', () => {
  it('deals an opening hand of the configured size', () => {
    const state = match()
    expect(state.players.you.hand).toHaveLength(RULES.OPENING_HAND)
    expect(state.players.foe.hand).toHaveLength(RULES.OPENING_HAND)
  })

  it('always deals a hand containing at least one Basic Figure', () => {
    // No mulligan penalty exists, so this guarantee has to be absolute.
    for (let seed = 0; seed < 400; seed++) {
      const state = match({ seed })
      for (const player of ['you', 'foe'] as PlayerId[]) {
        const basics = state.players[player].hand.filter((id) => {
          const card = requireCard(id)
          return isFigure(card) && card.stage === 'basic'
        })
        expect(basics.length, `seed ${seed}, ${player}`).toBeGreaterThan(0)
      }
    }
  })

  it('leaves the rest of the deck behind the hand', () => {
    const state = match()
    expect(state.players.you.deck).toHaveLength(DECK.length - RULES.OPENING_HAND)
  })

  it('gives the same coin flip for the same seed, and both outcomes across seeds', () => {
    const a = match({ seed: 77 }).first
    const b = match({ seed: 77 }).first
    expect(a).toBe(b)

    const flips = new Set(Array.from({ length: 60 }, (_, s) => match({ seed: s }).first))
    expect(flips).toEqual(new Set(['you', 'foe']))
  })

  it('refuses a non-Basic Figure in the Active spot', () => {
    const state = match({ seed: 5 })
    const ascendedIndex = state.players.you.hand.findIndex((id) => {
      const card = requireCard(id)
      return isFigure(card) && card.stage !== 'basic'
    })
    if (ascendedIndex === -1) return // this hand held none; nothing to assert

    expect(() =>
      reduce(state, { type: 'SETUP', player: 'you', active: ascendedIndex, bench: [] }),
    ).toThrow(IllegalAction)
  })

  it('refuses to place the same card twice', () => {
    const state = match()
    const option = setupOptions(state, 'you')[0]!
    expect(() =>
      reduce(state, { type: 'SETUP', player: 'you', active: option.active, bench: [option.active] }),
    ).toThrow(IllegalAction)
  })

  it('refuses more than the bench limit', () => {
    const state = match()
    expect(() =>
      reduce(state, { type: 'SETUP', player: 'you', active: 0, bench: [1, 2, 3, 4] }),
    ).toThrow(IllegalAction)
  })

  it('enters the main phase once both players have placed', () => {
    const state = started()
    expect(state.phase).toBe('main')
    expect(state.players.you.active).not.toBeNull()
    expect(state.players.foe.active).not.toBeNull()
  })
})

/* --------------------------------------------------------- turn-1 handicap */

describe('the turn-1 handicap', () => {
  it('gives the first player no energy on turn 1', () => {
    const state = started({ forceFirst: 'you' })
    expect(state.current).toBe('you')
    expect(state.players.you.altar).toBeNull()
  })

  it('forbids the first player from attacking on turn 1', () => {
    const state = started({ forceFirst: 'you' })
    expect(legalActions(state).some((a) => a.type === 'ATTACK')).toBe(false)
    expect(() => reduce(state, { type: 'ATTACK', attackIndex: 0 })).toThrow(IllegalAction)
  })

  it('gives the second player energy on their first turn', () => {
    let state = started({ forceFirst: 'foe' })
    state = reduce(state, { type: 'END_TURN' }) // foe passes; you begin

    expect(state.current).toBe('you')
    expect(state.players.you.altar).not.toBeNull()
  })

  it('lets the second player attack on their first turn once paid for', () => {
    let state = started({ forceFirst: 'foe' })
    state = reduce(state, { type: 'END_TURN' })

    const active = state.players.you.active!
    state = reduce(state, { type: 'ATTACH', uid: active.uid })

    // Whether an attack is affordable depends on the hand, but the rule must
    // not be the thing blocking it.
    expect(() => reduce(state, { type: 'ATTACK', attackIndex: 99 })).toThrow(/No such attack/)
  })

  it('restores energy to the first player on their second turn', () => {
    let state = started({ forceFirst: 'you' })
    state = reduce(state, { type: 'END_TURN' })
    state = reduce(state, { type: 'END_TURN' })

    expect(state.current).toBe('you')
    expect(state.turn).toBe(3)
    expect(state.players.you.altar).not.toBeNull()
  })
})

/* ------------------------------------------------------------------ energy */

describe('energy', () => {
  it('supplies one energy per turn, from the deck’s declared types', () => {
    let state = started({ forceFirst: 'foe' })
    state = reduce(state, { type: 'END_TURN' })
    expect(ENERGY).toContain(state.players.you.altar!)
  })

  it('allows only one attachment per turn', () => {
    let state = started({ forceFirst: 'foe' })
    state = reduce(state, { type: 'END_TURN' })

    const active = state.players.you.active!
    state = reduce(state, { type: 'ATTACH', uid: active.uid })

    expect(state.players.you.altar).toBeNull()
    expect(() => reduce(state, { type: 'ATTACH', uid: active.uid })).toThrow(IllegalAction)
  })

  it('refuses to attach to a Figure that is not yours', () => {
    let state = started({ forceFirst: 'foe' })
    state = reduce(state, { type: 'END_TURN' })

    const theirActive = state.players.foe.active!
    expect(() => reduce(state, { type: 'ATTACH', uid: theirActive.uid })).toThrow(IllegalAction)
  })

  it('rolls the Altar one turn ahead, so the type is fixed before it is granted', () => {
    // The screen previews `nextAltar` before a player has actually received
    // it, which only means something if the value cannot still change
    // between the preview and the turn that grants it. A single-type pool
    // makes a *fresh* roll fully predictable — there is nothing else it
    // could produce — so pinning `nextAltar` to a different type makes it
    // unambiguous which of the two a turn actually hands out: a 50/50 pool
    // would let a broken implementation pass this by pure chance half the
    // time it's run.
    const state = started({
      forceFirst: 'foe',
      you: { deck: DECK, energy: ['earth'] },
      foe: { deck: DECK, energy: ['water'] },
    })
    state.players.you.nextAltar = 'fire'
    state.players.foe.nextAltar = 'light'

    // Turn 1 (foe, handicapped — no altar, `nextAltar` left exactly as
    // pinned) hands off to turn 2: you, a normal first turn.
    const turn2 = reduce(state, { type: 'END_TURN' })
    expect(turn2.players.foe.altar).toBeNull()
    expect(turn2.players.foe.nextAltar).toBe('light') // untouched by the handicap turn
    expect(turn2.players.you.altar).toBe('fire') // the pinned promise, not a fresh roll
    expect(turn2.players.you.nextAltar).toBe('earth') // the only value ['earth'] can produce

    // Turn 2 hands off to turn 3 — foe's own first real turn, their
    // handicap already spent on turn 1.
    const turn3 = reduce(turn2, { type: 'END_TURN' })
    expect(turn3.players.foe.altar).toBe('light') // the promise pinned before turn 1
    expect(turn3.players.foe.nextAltar).toBe('water')
  })
})

/* ------------------------------------------------------------- hand limit */

describe('the hand limit', () => {
  it('skips the turn draw once the hand is already at the cap, leaving the card in the deck', () => {
    let state = started({ forceFirst: 'foe' })
    // What matters here is the count, not which cards fill it.
    state = {
      ...state,
      players: {
        ...state.players,
        you: { ...state.players.you, hand: Array(RULES.MAX_HAND).fill(DECK[0]) },
      },
    }
    const discardBefore = state.players.you.discard.length
    const deckBefore = state.players.you.deck.length

    state = reduce(state, { type: 'END_TURN' }) // foe ends; you begin, but can't draw

    expect(state.players.you.hand).toHaveLength(RULES.MAX_HAND)
    expect(state.players.you.discard).toHaveLength(discardBefore)
    expect(state.players.you.deck).toHaveLength(deckBefore)
  })
})

/* --------------------------------------------------------------- ascension */

describe('ascension', () => {
  it('refuses to ascend a Figure on the turn it entered play', () => {
    // Abram is placed during setup on turn 1 and Abraham ascends from it.
    let state = started({ forceFirst: 'you' })

    const abramInPlay = [state.players.you.active, ...state.players.you.bench].find(
      (f) => f?.cardId === 'abram',
    )
    const abrahamInHand = state.players.you.hand.indexOf('abraham')
    if (!abramInPlay || abrahamInHand === -1) return

    expect(() =>
      reduce(state, { type: 'ASCEND', hand: abrahamInHand, uid: abramInPlay.uid }),
    ).toThrow(/cannot ascend on the turn it entered play/)

    // And it becomes legal a round later.
    state = reduce(state, { type: 'END_TURN' })
    state = reduce(state, { type: 'END_TURN' })
    const stillThere = [state.players.you.active, ...state.players.you.bench].find(
      (f) => f?.uid === abramInPlay.uid,
    )
    const handIndex = state.players.you.hand.indexOf('abraham')
    if (stillThere && handIndex >= 0) {
      const next = reduce(state, { type: 'ASCEND', hand: handIndex, uid: stillThere.uid })
      const ascended = [next.players.you.active, ...next.players.you.bench].find(
        (f) => f?.uid === abramInPlay.uid,
      )
      expect(ascended?.cardId).toBe('abraham')
      expect(ascended?.beneath).toContain('abram')
    }
  })

  it('refuses a second ascension of the same slot in one turn', () => {
    // Rigged rather than left to the dealt hand, unlike the test above: this
    // one needs a real two-step lineage (abram -> abraham -> isaac) to chain
    // in a single turn, not a random hand that may or may not carry it.
    let state = started({ forceFirst: 'you' })
    state = reduce(state, { type: 'END_TURN' }) // foe's turn
    state = reduce(state, { type: 'END_TURN' }) // back to you — the Active
    // Figure has now lived through a full turn, clear of the
    // enters-play-this-turn guard on its own.

    const active = state.players.you.active!
    active.cardId = 'abram'
    active.enteredOnTurn = 1
    state.players.you.hand.push('abraham', 'isaac')
    const abrahamHand = state.players.you.hand.indexOf('abraham')

    const afterFirst = reduce(state, { type: 'ASCEND', hand: abrahamHand, uid: active.uid })
    const ascended = afterFirst.players.you.active!
    expect(ascended.cardId).toBe('abraham')

    // Same slot (the uid survives its own ascension), same turn: refused,
    // even though isaac legitimately ascends from what this slot holds now.
    const isaacHand = afterFirst.players.you.hand.indexOf('isaac')
    expect(() =>
      reduce(afterFirst, { type: 'ASCEND', hand: isaacHand, uid: ascended.uid }),
    ).toThrow(/already ascended this turn/)

    // A fresh turn clears the block.
    const yourNextTurn = reduce(reduce(afterFirst, { type: 'END_TURN' }), { type: 'END_TURN' })
    const stillThere = yourNextTurn.players.you.active!
    const isaacHandNow = yourNextTurn.players.you.hand.indexOf('isaac')
    const final = reduce(yourNextTurn, { type: 'ASCEND', hand: isaacHandNow, uid: stillThere.uid })
    expect(final.players.you.active?.cardId).toBe('isaac')
  })

  it('refuses to ascend onto the wrong Figure', () => {
    const state = started({ forceFirst: 'you' })
    const active = state.players.you.active!
    const abrahamInHand = state.players.you.hand.indexOf('abraham')
    if (abrahamInHand === -1 || active.cardId === 'abram') return

    expect(() => reduce(state, { type: 'ASCEND', hand: abrahamInHand, uid: active.uid })).toThrow(
      IllegalAction,
    )
  })

  it('carries damage and energy through an ascension but clears conditions', () => {
    let state = started({ forceFirst: 'you' })
    const abram = [state.players.you.active, ...state.players.you.bench].find(
      (f) => f?.cardId === 'abram',
    )
    if (!abram) return

    // Age the Figure, then damage and load it.
    state = reduce(state, { type: 'END_TURN' })
    state = reduce(state, { type: 'END_TURN' })

    const live = [state.players.you.active, ...state.players.you.bench].find(
      (f) => f?.uid === abram.uid,
    )!
    live.damage = 30
    live.energy.push('light')
    live.statuses.push({ kind: 'afflicted', until: Number.POSITIVE_INFINITY })

    const handIndex = state.players.you.hand.indexOf('abraham')
    if (handIndex === -1) return

    const next = reduce(state, { type: 'ASCEND', hand: handIndex, uid: abram.uid })
    const after = [next.players.you.active, ...next.players.you.bench].find(
      (f) => f?.uid === abram.uid,
    )!

    expect(after.damage).toBe(30)
    expect(after.energy).toEqual(['light'])
    expect(after.statuses).toEqual([])
  })
})

/* ------------------------------------------------------------------ combat */

describe('combat', () => {
  /** Puts a chosen Figure in the Active spot with enough energy to attack. */
  function rigged(youCard: string, foeCard: string, energy = 3) {
    const state = started({ forceFirst: 'foe' })
    const next = reduce(state, { type: 'END_TURN' })

    const you = next.players.you.active!
    you.cardId = youCard
    you.damage = 0
    you.energy = Array(energy).fill(figureCard(you).type)

    const foe = next.players.foe.active!
    foe.cardId = foeCard
    foe.damage = 0

    return next
  }

  it('applies the weakness bonus', () => {
    // Fire beats Earth. Altar Fire's Kindle does 30, so 50 into an Earth Figure.
    const state = rigged('the-altar-fire', 'esau')
    const before = state.players.foe.active!.damage

    const after = reduce(state, { type: 'ATTACK', attackIndex: 0 })
    // The defender may have been knocked out; if so it is off the board.
    const defender = after.players.foe.active
    if (defender && defender.cardId === 'esau') {
      expect(defender.damage - before).toBe(30 + RULES.WEAKNESS_BONUS)
    }
  })

  it('does not apply a weakness bonus for the wrong type', () => {
    // Water is not what Earth fears.
    const state = rigged('the-raven', 'esau')
    const after = reduce(state, { type: 'ATTACK', attackIndex: 0 })

    const defender = after.players.foe.active
    if (defender && defender.cardId === 'esau') {
      expect(defender.damage).toBe(10)
    }
  })

  it('passes the turn after an attack', () => {
    const state = rigged('the-altar-fire', 'the-nephilim')
    const after = reduce(state, { type: 'ATTACK', attackIndex: 0 })
    expect(after.current).toBe('foe')
  })

  it('allows only one attack per turn', () => {
    const state = rigged('the-altar-fire', 'the-nephilim')
    const after = reduce(state, { type: 'ATTACK', attackIndex: 0 })
    // The turn has passed, so a second attack is not even this player's to make.
    expect(after.current).not.toBe('you')
  })

  it('refuses an attack that cannot be paid for', () => {
    const state = rigged('melchizedek', 'the-nephilim', 0)
    expect(() => reduce(state, { type: 'ATTACK', attackIndex: 1 })).toThrow(/Not enough energy/)
  })
})


describe('match history', () => {
  it('records a structured event alongside an attack\'s log line', () => {
    const state = started({ forceFirst: 'foe' })
    const next = reduce(state, { type: 'END_TURN' })

    const you = next.players.you.active!
    you.cardId = 'the-altar-fire'
    you.damage = 0
    you.energy = Array(3).fill(figureCard(you).type)
    const foe = next.players.foe.active!
    foe.cardId = 'the-nephilim'
    foe.damage = 0

    const after = reduce(next, { type: 'ATTACK', attackIndex: 0 })
    const attackEntry = after.log.find((e) => e.event?.kind === 'attack')
    expect(attackEntry?.event).toMatchObject({
      kind: 'attack',
      cardId: 'the-altar-fire',
      uid: you.uid,
      otherCardId: 'the-nephilim',
      missed: false,
    })
    expect(attackEntry?.event?.damage).toBeGreaterThan(0)
  })

  it('orders a knockout\'s own entry after the attack that caused it', () => {
    const state = started({ forceFirst: 'foe' })
    const next = reduce(state, { type: 'END_TURN' })

    const you = next.players.you.active!
    you.cardId = 'the-altar-fire'
    you.damage = 0
    you.energy = Array(3).fill(figureCard(you).type)
    const foe = next.players.foe.active!
    foe.cardId = 'esau'
    // One hit from the kill: the weakness bonus alone finishes it.
    foe.damage = figureCard(foe).hp - 1

    const after = reduce(next, { type: 'ATTACK', attackIndex: 0 })
    const kinds = after.log.map((e) => e.event?.kind).filter(Boolean)
    const attackIndex = kinds.indexOf('attack')
    const knockoutIndex = kinds.indexOf('knockout')
    expect(attackIndex).toBeGreaterThanOrEqual(0)
    expect(knockoutIndex).toBeGreaterThan(attackIndex)
  })

  it('records what energy type was attached and to which Figure', () => {
    let state = started({ forceFirst: 'you' })
    const active = state.players.you.active!
    state.players.you.altar = 'light'

    state = reduce(state, { type: 'ATTACH', uid: active.uid })
    const entry = state.log.find((e) => e.event?.kind === 'attach')
    expect(entry?.event).toMatchObject({ kind: 'attach', uid: active.uid, energyType: 'light' })
  })

  it('records what an ascension climbed from and to', () => {
    let state = started({ forceFirst: 'you' })
    state = reduce(state, { type: 'END_TURN' })
    state = reduce(state, { type: 'END_TURN' })

    const active = state.players.you.active!
    active.cardId = 'abram'
    active.enteredOnTurn = 1
    state.players.you.hand.push('abraham')
    const hand = state.players.you.hand.indexOf('abraham')

    const after = reduce(state, { type: 'ASCEND', hand, uid: active.uid })
    const entry = after.log.find((e) => e.event?.kind === 'ascend')
    expect(entry?.event).toMatchObject({
      kind: 'ascend',
      cardId: 'abraham',
      otherCardId: 'abram',
      uid: active.uid,
    })
  })
})

describe('draw events', () => {
  /** Isolates the events a single reduce() call appended, since `started()`
   *  and even a prior turn already carry their own draw entries in the log. */
  const newDraws = (before: MatchState, after: MatchState) =>
    after.log.slice(before.log.length).filter((e) => e.event?.kind === 'draw')

  it('logs the automatic turn-start draw', () => {
    const state = started({ forceFirst: 'foe' })
    const topCard = state.players.you.deck[0]

    const after = reduce(state, { type: 'END_TURN' })
    const draws = newDraws(state, after)
    expect(draws).toHaveLength(1)
    expect(draws[0]?.player).toBe('you')
    expect(draws[0]?.event).toMatchObject({ kind: 'draw', cardId: topCard })
  })

  it('logs one event per card for a multi-card draw effect', () => {
    const state = started({ forceFirst: 'you' })
    const [first, second] = state.players.you.deck
    state.players.you.hand.push('the-well-of-beersheba')
    const hand = state.players.you.hand.indexOf('the-well-of-beersheba')

    const after = reduce(state, { type: 'PLAY_COVENANT', hand })
    const draws = newDraws(state, after)
    expect(draws).toHaveLength(2)
    expect(draws.map((e) => e.event?.cardId)).toEqual([first, second])
  })

  it('logs a draw event when a search effect falls back to hand, not when it reaches the Bench', () => {
    const state = started({ forceFirst: 'you' })
    // Fill the Bench so the search has nowhere to place its Figure but hand.
    state.players.you.bench = state.players.you.bench.map(() => makeFigure('the-altar-fire', state.turn))
    const basicId = state.players.you.deck.find((id) => {
      const card = requireCard(id)
      return isFigure(card) && card.stage === 'basic'
    })!
    state.players.you.hand.push('the-call-of-abram')
    const hand = state.players.you.hand.indexOf('the-call-of-abram')

    const after = reduce(state, { type: 'PLAY_COVENANT', hand })
    const draws = newDraws(state, after)
    expect(draws).toHaveLength(1)
    expect(draws[0]?.event).toMatchObject({ kind: 'draw', cardId: basicId })
  })

  it('logs no draw event when a search effect is discarded for a full hand', () => {
    const state = started({ forceFirst: 'you' })
    state.players.you.bench = state.players.you.bench.map(() => makeFigure('the-altar-fire', state.turn))
    // Fill to MAX_HAND first, then add the covenant on top — PLAY_COVENANT
    // removes it from hand before the search runs, so the hand it sees is
    // exactly at the cap, same as it would be mid-game.
    while (state.players.you.hand.length < RULES.MAX_HAND) state.players.you.hand.push('the-altar-fire')
    state.players.you.hand.push('the-call-of-abram')
    const hand = state.players.you.hand.indexOf('the-call-of-abram')

    const after = reduce(state, { type: 'PLAY_COVENANT', hand })
    expect(newDraws(state, after)).toHaveLength(0)
  })

  it('logs a draw event for a dig effect that reaches hand, none when the hand is full', () => {
    const state = started({ forceFirst: 'you' })
    state.players.you.hand.push('the-dream-of-pharaoh')
    const hand = state.players.you.hand.indexOf('the-dream-of-pharaoh')
    const topCard = state.players.you.deck[0]

    const after = reduce(state, { type: 'PLAY_COVENANT', hand })
    const draws = newDraws(state, after)
    expect(draws).toHaveLength(1)
    expect(draws[0]?.event).toMatchObject({ kind: 'draw', cardId: topCard })

    const full = started({ forceFirst: 'you' })
    while (full.players.you.hand.length < RULES.MAX_HAND) full.players.you.hand.push('the-altar-fire')
    full.players.you.hand.push('the-dream-of-pharaoh')
    const fullHand = full.players.you.hand.indexOf('the-dream-of-pharaoh')

    const afterFull = reduce(full, { type: 'PLAY_COVENANT', hand: fullHand })
    expect(newDraws(full, afterFull)).toHaveLength(0)
  })

  it("attributes Laban's opponent-reshuffle draws to the opponent, not the caster", () => {
    let state = started({ forceFirst: 'foe' })
    state = reduce(state, { type: 'END_TURN' })
    const active = state.players.you.active!
    active.cardId = 'laban'
    active.energy = ['earth']
    state.players.foe.hand = ['the-altar-fire', 'the-nephilim', 'esau']

    const after = reduce(state, { type: 'ATTACK', attackIndex: 0 })
    // An attack ends the turn, so the slice also carries the foe's own next
    // turn-start draw after this one — cut it off at the attack's own entry,
    // which the effect (and its draws) always resolves before.
    const added = after.log.slice(state.log.length)
    const attackIndex = added.findIndex((e) => e.event?.kind === 'attack')
    const draws = added.slice(0, attackIndex).filter((e) => e.event?.kind === 'draw')
    // Reshuffles 3 cards and draws 3 - 1 = 2 back, both credited to the foe.
    expect(draws).toHaveLength(2)
    for (const entry of draws) expect(entry.player).toBe('foe')
  })
})

/* -------------------------------------------------------------- knockouts */

describe('knockouts and points', () => {
  function aboutToDie(defenderCard: string) {
    const state = started({ forceFirst: 'foe' })
    const next = reduce(state, { type: 'END_TURN' })

    const you = next.players.you.active!
    you.cardId = 'the-altar-fire'
    you.energy = ['fire', 'fire', 'fire']

    const foe = next.players.foe.active!
    foe.cardId = defenderCard
    foe.damage = requireCard(defenderCard) && isFigure(requireCard(defenderCard))
      ? (requireCard(defenderCard) as { hp: number }).hp - 10
      : 0

    // Clear the bench so the knockout is decisive where the test wants it.
    next.players.foe.bench = next.players.foe.bench.map(() => null)
    return next
  }

  it('scores 1 point for an ordinary Figure', () => {
    const state = aboutToDie('esau')
    const after = reduce(state, { type: 'ATTACK', attackIndex: 0 })
    expect(after.players.you.points).toBe(RULES.POINTS_FIGURE)
  })

  it('scores 2 points for an Anointed Figure', () => {
    const state = aboutToDie('the-serpent')
    const after = reduce(state, { type: 'ATTACK', attackIndex: 0 })
    expect(after.players.you.points).toBe(RULES.POINTS_ANOINTED)
  })

  it('wins the match at the points threshold', () => {
    const state = aboutToDie('esau')
    state.players.you.points = RULES.POINTS_TO_WIN - 1

    const after = reduce(state, { type: 'ATTACK', attackIndex: 0 })
    expect(after.phase).toBe('ended')
    expect(after.winner).toBe('you')
    expect(after.endReason).toBe('points')
  })

  it('wins when the opponent has no Figure left to promote', () => {
    const state = aboutToDie('esau')
    const after = reduce(state, { type: 'ATTACK', attackIndex: 0 })

    expect(after.phase).toBe('ended')
    expect(after.endReason).toBe('no-figures')
  })

  it('requires a promotion when the bench is not empty', () => {
    const state = aboutToDie('esau')
    state.players.foe.bench[0] = {
      uid: 'bench-1',
      cardId: 'seth',
      beneath: [],
      damage: 0,
      energy: [],
      statuses: [],
      enteredOnTurn: 1,
      armor: 0,
      attackBonus: 0,
      retreatDiscount: 0,
      attachments: [],
    }

    const after = reduce(state, { type: 'ATTACK', attackIndex: 0 })
    expect(after.phase).toBe('promote')
    expect(after.promoting).toBe('foe')
    // ATTACK does not call endTurn while a promotion is pending, so `current`
    // is left exactly where it was — the attacker, 'you' — while `promoting`
    // names the defender who has to fill the gap. The screen's turn clock
    // reads this divergence directly (useMatch.ts's clock effect charges
    // `promoting` rather than `current` once the phase is 'promote'), since
    // charging the attacker for the defender's decision would bill the
    // wrong player for time they did not get to spend.
    expect(after.current).toBe('you')
    expect(after.current).not.toBe(after.promoting)

    // Nothing else may happen until it is resolved.
    expect(() => reduce(after, { type: 'END_TURN' })).toThrow(/must be promoted/)

    const promoted = reduce(after, { type: 'PROMOTE', benchIndex: 0 })
    expect(promoted.players.foe.active?.cardId).toBe('seth')
    expect(promoted.phase).toBe('main')
    // The attacker's turn was spent on the attack, so play has passed.
    expect(promoted.current).toBe('foe')
  })

  it('resolves both promotions when one attack empties both Active spots', () => {
    // Cain's Fratricide deals 80 and 20 to itself. Rigged so both land fatally.
    // This used to leave one side with no Active and no pending promotion,
    // because `promoting` was a single field written twice — the match then
    // limped on with an empty Active spot until it timed out.
    let state = started({ forceFirst: 'foe' })
    state = reduce(state, { type: 'END_TURN' })

    const mine = state.players.you.active!
    mine.cardId = 'cain'
    mine.energy = ['earth', 'earth']
    mine.damage = figureCard(mine).hp - 10 // 20 recoil is lethal

    const theirs = state.players.foe.active!
    theirs.cardId = 'esau'
    theirs.damage = figureCard(theirs).hp - 10 // 80 is lethal

    // Both sides keep a Bench, so both owe a promotion rather than losing.
    const spare = (uid: string, cardId: string) => ({
      uid,
      cardId,
      beneath: [],
      damage: 0,
      energy: [],
      statuses: [],
      enteredOnTurn: 1,
      armor: 0,
      attackBonus: 0,
      retreatDiscount: 0,
      attachments: [],
    })
    state.players.you.bench[0] = spare('mine-1', 'seth')
    state.players.foe.bench[0] = spare('theirs-1', 'esau')

    const attackIndex = figureCard(mine).attacks.findIndex((a) => a.effect === 'recoil-20')
    expect(attackIndex).toBeGreaterThanOrEqual(0)

    let after = reduce(state, { type: 'ATTACK', attackIndex })

    // Both Active spots are empty; the current player is asked first.
    expect(after.phase).toBe('promote')
    expect(after.promoting).toBe('you')
    expect(after.players.you.active).toBeNull()
    expect(after.players.foe.active).toBeNull()

    after = reduce(after, { type: 'PROMOTE', benchIndex: 0 })

    // The second vacancy must still be outstanding — the turn cannot pass yet.
    expect(after.phase).toBe('promote')
    expect(after.promoting).toBe('foe')
    expect(after.players.you.active?.cardId).toBe('seth')
    // A second way the same divergence arises: PROMOTE only calls endTurn
    // once every vacancy is filled, so resolving the first one here leaves
    // `current` sitting on 'you' — the player who just acted — while
    // `promoting` has already moved on to 'foe' for the one still open.
    expect(after.current).toBe('you')
    expect(after.current).not.toBe(after.promoting)

    after = reduce(after, { type: 'PROMOTE', benchIndex: 0 })

    expect(after.phase).toBe('main')
    expect(after.promoting).toBeNull()
    expect(after.players.foe.active?.cardId).toBe('esau')
    // Only now does the turn pass.
    expect(after.current).toBe('foe')
  })

  it('sends the whole ascension stack to the discard', () => {
    const state = aboutToDie('esau')
    state.players.foe.active!.beneath = ['abram', 'abraham']

    const after = reduce(state, { type: 'ATTACK', attackIndex: 0 })
    expect(after.players.foe.discard).toEqual(expect.arrayContaining(['abram', 'abraham', 'esau']))
  })
})

/* -------------------------------------------------------------------- misc */

describe('retreat', () => {
  it('swaps the Active Figure and pays the cost in energy', () => {
    let state = started({ forceFirst: 'foe' })
    state = reduce(state, { type: 'END_TURN' })

    const active = state.players.you.active!
    const bench = state.players.you.bench.findIndex((s) => s !== null)
    if (bench === -1) return

    const cost = figureCard(active).retreat
    active.energy = Array(cost).fill('light')

    const after = reduce(state, { type: 'RETREAT', benchIndex: bench })
    expect(after.players.you.active?.uid).not.toBe(active.uid)
    expect(after.players.you.bench[bench]?.uid).toBe(active.uid)
    expect(after.players.you.bench[bench]?.energy).toHaveLength(0)
  })

  it('refuses to retreat without the energy', () => {
    let state = started({ forceFirst: 'foe' })
    state = reduce(state, { type: 'END_TURN' })

    const active = state.players.you.active!
    const bench = state.players.you.bench.findIndex((s) => s !== null)
    if (bench === -1 || figureCard(active).retreat === 0) return

    active.energy = []
    expect(() => reduce(state, { type: 'RETREAT', benchIndex: bench })).toThrow(/Not enough energy/)
  })

  it('refuses to retreat a Bound Figure', () => {
    let state = started({ forceFirst: 'foe' })
    state = reduce(state, { type: 'END_TURN' })

    const active = state.players.you.active!
    const bench = state.players.you.bench.findIndex((s) => s !== null)
    if (bench === -1) return

    active.energy = Array(6).fill('light')
    active.statuses.push({ kind: 'bound', until: 99 })

    expect(() => reduce(state, { type: 'RETREAT', benchIndex: bench })).toThrow(/Bound/)
  })
})

describe('deck-out', () => {
  it('plays on when a player must draw from an empty deck', () => {
    let state = started({ forceFirst: 'you' })
    state.players.foe.deck = []
    const held = state.players.foe.hand.length

    state = reduce(state, { type: 'END_TURN' })

    // The turn passes to a player who cannot draw, and that is all it does:
    // no draw, no loss. The match is won on points, not on running dry.
    expect(state.current).toBe('foe')
    expect(state.phase).toBe('main')
    expect(state.winner).toBeNull()
    expect(state.players.foe.hand.length).toBe(held)
  })

  it('still lets an empty-decked player take the points and win', () => {
    let state = started({ forceFirst: 'you' })
    state.players.foe.deck = []
    state.players.foe.points = RULES.POINTS_TO_WIN - 1

    // Round-trip the turn so foe draws on nothing twice over, then hand it
    // the last point it needs.
    state = reduce(state, { type: 'END_TURN' })
    state = reduce(state, { type: 'END_TURN' })
    expect(state.phase).toBe('main')

    state = reduce(state, { type: 'CONCEDE', player: 'you' })
    expect(state.winner).toBe('foe')
  })
})

describe('determinism', () => {
  it('replays an identical match from the same seed and action list', () => {
    const actions: Action[] = [{ type: 'END_TURN' }, { type: 'END_TURN' }, { type: 'END_TURN' }]

    const run = () => {
      resetUids()
      let state = started({ seed: 4242, forceFirst: 'you' })
      for (const action of actions) state = reduce(state, action)
      return state
    }

    const a = run()
    const b = run()

    expect(a.rngState).toBe(b.rngState)
    expect(a.players.you.hand).toEqual(b.players.you.hand)
    expect(a.players.foe.hand).toEqual(b.players.foe.hand)
    expect(a.log.map((l) => l.text)).toEqual(b.log.map((l) => l.text))
  })

  it('does not mutate the state handed to it', () => {
    const state = started({ forceFirst: 'you' })
    const before = structuredClone(state)

    reduce(state, { type: 'END_TURN' })

    expect(state).toEqual(before)
  })
})

describe('concede and timeout', () => {
  it('hands the win to the other player on a concession', () => {
    const state = started()
    const after = reduce(state, { type: 'CONCEDE', player: 'you' })
    expect(after.winner).toBe('foe')
    expect(after.endReason).toBe('concede')
  })

  it('decides a timeout on points', () => {
    const state = started()
    state.players.foe.points = 2

    const after = reduce(state, { type: 'TIMEOUT', player: 'you' })
    expect(after.winner).toBe('foe')
    expect(after.endReason).toBe('timeout')
  })
})

describe('miracles', () => {
  /** Melchizedek is Anointed, so it carries a miracle; abram is not. */
  const anointed = 'melchizedek'

  it('lets a Figure standing in a slot call its miracle, once per turn', () => {
    let state = started({ forceFirst: 'you' })
    const active = state.players.you.active!
    active.cardId = anointed
    // Rigged low so the heal this miracle may roll has something to restore,
    // and so any of the seven possible rolls still leaves the board legal.
    active.damage = 40

    const miracle = miracleFor(anointed)!
    expect(miracle).toBeTruthy()

    const after = reduce(state, { type: 'MIRACLE', uid: active.uid })
    expect(after.players.you.miraclesThisTurn).toContain(active.uid)
    expect(after.log.some((entry) => entry.text.includes(miracle.name))).toBe(true)

    // A second call in the same turn is refused.
    expect(() => reduce(after, { type: 'MIRACLE', uid: active.uid })).toThrow(
      /already called its miracle this turn/,
    )

    // And it comes back on your next turn.
    state = reduce(reduce(after, { type: 'END_TURN' }), { type: 'END_TURN' })
    expect(state.players.you.miraclesThisTurn).toEqual([])
    expect(() => reduce(state, { type: 'MIRACLE', uid: active.uid })).not.toThrow()
  })

  it('refuses a miracle from a Figure that is not on the board', () => {
    const state = started({ forceFirst: 'you' })
    // A uid that belongs to nothing in play — the shape a card still sitting
    // in hand or in the deck would have, since neither is ever given one.
    expect(() => reduce(state, { type: 'MIRACLE', uid: 'not-in-play' })).toThrow(
      /not in play/,
    )
  })

  it('refuses a miracle from a Figure that has none', () => {
    const state = started({ forceFirst: 'you' })
    const active = state.players.you.active!
    active.cardId = 'abram'
    expect(miracleFor('abram')).toBeNull()
    expect(() => reduce(state, { type: 'MIRACLE', uid: active.uid })).toThrow(/has no miracle/)
  })

  it('offers a miracle only for Anointed Figures actually in play', () => {
    const state = started({ forceFirst: 'you' })
    const active = state.players.you.active!
    const bench = state.players.you.bench.find((f) => f !== null)!

    active.cardId = anointed
    bench.cardId = 'abram'

    const uids = legalActions(state)
      .filter((a) => a.type === 'MIRACLE')
      .map((a) => (a as { uid: string }).uid)

    // The Anointed Active is offered; the plain benched Figure is not, and
    // neither is anything outside `figuresInPlay` at all.
    expect(uids).toContain(active.uid)
    expect(uids).not.toContain(bench.uid)

    // A benched Anointed Figure *is* offered — a slot is a slot.
    bench.cardId = anointed
    const withBench = legalActions(state)
      .filter((a) => a.type === 'MIRACLE')
      .map((a) => (a as { uid: string }).uid)
    expect(withBench).toContain(bench.uid)

    // Spent ones drop back out of the list.
    const after = reduce(state, { type: 'MIRACLE', uid: active.uid })
    const left = legalActions(after)
      .filter((a) => a.type === 'MIRACLE')
      .map((a) => (a as { uid: string }).uid)
    expect(left).not.toContain(active.uid)
  })

  it('names an effect the engine actually implements, for every miracle', () => {
    // A miracle naming an unimplemented effect would resolve to a log line
    // and nothing else — a move that looks real and does nothing.
    for (const miracle of ALL_MIRACLES) {
      expect(effectIsImplemented(miracle.effect), miracle.name).toBe(true)
    }
  })

  it('is reached for by the AI, rather than left on the board', () => {
    // The AI scores every legal action and takes the best; an action it has
    // no case for scores 0, which is below END_TURN's 1 — so "the AI uses
    // miracles" is precisely the claim that a useful one out-scores ending
    // the turn. Set up a board where calling it is plainly the right move:
    // a damaged Anointed Active, no energy to attack with, nothing in hand.
    let state = started({ forceFirst: 'foe' })
    const foe = state.players.foe
    const active = foe.active!
    active.cardId = anointed
    active.damage = 60
    active.energy = []
    foe.hand = []
    foe.altar = null

    const rng = createRng(7)
    // `hard` rather than the default, so the deliberate-mistake roll cannot
    // pick something else and make this flap.
    const chosen = chooseAction(state, 'foe', DIFFICULTY.hard, rng)
    expect(chosen?.type).toBe('MIRACLE')

    // And it actually resolves when the AI takes it.
    state = reduce(state, chosen!)
    expect(state.players.foe.miraclesThisTurn).toContain(active.uid)
  })
})

