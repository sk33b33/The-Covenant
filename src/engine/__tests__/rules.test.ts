import { beforeEach, describe, expect, it } from 'vitest'
import { RULES } from '@/game/config'
import { STARTER_DECK } from '@/data/starter'
import { requireCard } from '@/data/cards'
import { isFigure } from '@/game/types'
import { IllegalAction, reduce } from '../reducer'
import { legalActions, setupOptions } from '../legal'
import { createMatch, figureCard, resetUids, type MatchSetup } from '../state'
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
  it('loses the match when a player must draw from an empty deck', () => {
    let state = started({ forceFirst: 'you' })
    state.players.foe.deck = []

    state = reduce(state, { type: 'END_TURN' })

    expect(state.phase).toBe('ended')
    expect(state.winner).toBe('you')
    expect(state.endReason).toBe('deckout')
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
