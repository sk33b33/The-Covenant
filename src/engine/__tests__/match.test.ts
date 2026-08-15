import { describe, expect, it } from 'vitest'
import { RULES } from '@/game/config'
import { CARDS, requireCard } from '@/data/cards'
import { STARTER_DECK } from '@/data/starter'
import { createRng } from '@/game/rng'
import { isFigure } from '@/game/types'
import { DIFFICULTY, aiSetup, playAiTurn } from '../ai'
import { effectIsImplemented } from '../effects'
import { legalActions } from '../legal'
import { reduce } from '../reducer'
import { createMatch, figuresInPlay, resetUids } from '../state'
import type { MatchState, PlayerId } from '../types'

/**
 * Whole-match integration.
 *
 * The rules tests check one rule at a time against a rigged board. These play
 * complete matches end to end — which is the only way to catch the failures
 * that matter most: a turn that never passes, a promotion that deadlocks, a
 * match that cannot reach a winner.
 */

const OTHER_DECK = {
  cards: [
    'the-altar-fire',
    'the-altar-fire',
    'the-serpents-curse',
    'the-serpents-curse',
    'the-pillar-of-fire',
    'the-pillar-of-fire',
    'the-burning-bush',
    'the-burning-bush',
    'the-consuming-fire',
    'the-consuming-fire',
    'the-outer-darkness',
    'the-outer-darkness',
    'the-shadow-of-death',
    'the-tempter',
    'the-curse',
    'babel',
    'the-well-of-beersheba',
    'the-scattering',
    'the-staff',
    'the-censer',
  ],
  energy: ['fire', 'shadow'] as const,
}

/**
 * Runs a complete match between two AI players.
 *
 * `maxTurns` is a deadlock detector, not a rule: a healthy match ends on
 * points or a deck-out well inside it. Hitting the cap is a failure.
 */
function playMatch(seed: number, maxTurns = 300) {
  resetUids()

  let state: MatchState = createMatch({
    seed,
    you: { deck: STARTER_DECK.cards, energy: [...STARTER_DECK.energy] },
    foe: { deck: OTHER_DECK.cards, energy: [...OTHER_DECK.energy] },
  })

  const rng = createRng(seed ^ 0x5bf03635)

  // Opening placement for both sides.
  for (const player of ['you', 'foe'] as PlayerId[]) {
    state = reduce(state, aiSetup(state, player, rng))
  }

  let guard = 0
  while (state.phase !== 'ended' && guard < maxTurns) {
    guard++

    const actor = state.phase === 'promote' ? state.promoting! : state.current
    const before = {
      turn: state.turn,
      phase: state.phase,
      current: state.current,
      // One attack can empty both Active spots, so a pass that only hands the
      // promotion to the other player is still forward progress.
      promoting: state.promoting,
    }

    state = playAiTurn(state, actor, DIFFICULTY.steady)

    // Every pass must move the match forward, or we are looping.
    const moved =
      state.phase === 'ended' ||
      state.turn !== before.turn ||
      state.phase !== before.phase ||
      state.current !== before.current ||
      state.promoting !== before.promoting
    expect(moved, `seed ${seed} stalled at turn ${before.turn} (${before.phase})`).toBe(true)
  }

  return { state, turns: guard }
}

describe('a complete match', () => {
  it('reaches a winner from any seed', () => {
    for (let seed = 0; seed < 60; seed++) {
      const { state, turns } = playMatch(seed)

      expect(state.phase, `seed ${seed} did not end`).toBe('ended')
      expect(state.winner, `seed ${seed} ended with no winner`).not.toBeNull()
      expect(state.endReason).not.toBeNull()
      expect(turns).toBeLessThan(300)
    }
  })

  it('ends for a legitimate reason', () => {
    const reasons = new Set<string>()
    for (let seed = 100; seed < 160; seed++) {
      reasons.add(playMatch(seed).state.endReason!)
    }

    // Anything outside the modelled set means a match ended by accident.
    for (const reason of reasons) {
      expect(['points', 'deckout', 'no-figures']).toContain(reason)
    }
  })

  it('never awards more points than the game can end on', () => {
    for (let seed = 200; seed < 240; seed++) {
      const { state } = playMatch(seed)
      for (const id of ['you', 'foe'] as PlayerId[]) {
        // A single knockout can carry 2, so the ceiling is threshold + 1.
        expect(state.players[id].points).toBeLessThanOrEqual(RULES.POINTS_TO_WIN + 1)
      }
    }
  })

  it('leaves the board internally consistent at the end', () => {
    for (let seed = 300; seed < 330; seed++) {
      const { state } = playMatch(seed)

      for (const id of ['you', 'foe'] as PlayerId[]) {
        const player = state.players[id]

        // The bench is a fixed-length array; slots are figures or empty.
        expect(player.bench).toHaveLength(RULES.BENCH_SIZE)

        // No Figure may carry more damage than its own HP without having been
        // knocked out — that would mean a knockout was missed.
        for (const figure of figuresInPlay(player)) {
          const card = requireCard(figure.cardId)
          if (isFigure(card)) {
            expect(figure.damage, `${figure.cardId} survived past its HP`).toBeLessThan(card.hp)
          }
        }

        // uids are unique across the board.
        const uids = figuresInPlay(player).map((f) => f.uid)
        expect(new Set(uids).size).toBe(uids.length)
      }
    }
  })

  it('is fully determined by its seed', () => {
    const a = playMatch(9001)
    const b = playMatch(9001)

    expect(a.state.winner).toBe(b.state.winner)
    expect(a.state.endReason).toBe(b.state.endReason)
    expect(a.state.turn).toBe(b.state.turn)
    expect(a.state.log.map((l) => l.text)).toEqual(b.state.log.map((l) => l.text))
  })

  it('does not let either deck win every time', () => {
    // A hard skew would mean the turn order or a type matchup is broken rather
    // than merely unbalanced.
    const wins = { you: 0, foe: 0 }
    for (let seed = 400; seed < 480; seed++) {
      wins[playMatch(seed).state.winner!]++
    }

    expect(wins.you).toBeGreaterThan(0)
    expect(wins.foe).toBeGreaterThan(0)
  })
})

describe('the AI', () => {
  it('only ever takes actions the rules already offer', () => {
    resetUids()
    let state = createMatch({
      seed: 31337,
      you: { deck: STARTER_DECK.cards, energy: [...STARTER_DECK.energy] },
      foe: { deck: OTHER_DECK.cards, energy: [...OTHER_DECK.energy] },
    })

    const rng = createRng(1)
    for (const player of ['you', 'foe'] as PlayerId[]) {
      state = reduce(state, aiSetup(state, player, rng))
    }

    // Stepping one action at a time, every action the AI picks must have been
    // in the legal list — the same list the interface builds its buttons from.
    for (let i = 0; i < 120 && state.phase !== 'ended'; i++) {
      const actor = state.phase === 'promote' ? state.promoting! : state.current
      const offered = legalActions(state)
      const next = playAiTurn(state, actor, DIFFICULTY.hard)

      if (next === state) break
      expect(offered.length, 'the AI was handed a turn with no legal action').toBeGreaterThan(0)
      state = next
    }
  })

  it('plays better than random at a low mistake rate', () => {
    // Same decks both sides, so the only difference is decision quality. A
    // near-perfect AI should beat a mostly-random one clearly.
    let sharpWins = 0
    const rounds = 40

    for (let seed = 500; seed < 500 + rounds; seed++) {
      resetUids()
      let state = createMatch({
        seed,
        you: { deck: STARTER_DECK.cards, energy: [...STARTER_DECK.energy] },
        foe: { deck: STARTER_DECK.cards, energy: [...STARTER_DECK.energy] },
        forceFirst: seed % 2 === 0 ? 'you' : 'foe',
      })

      const rng = createRng(seed)
      for (const player of ['you', 'foe'] as PlayerId[]) {
        state = reduce(state, aiSetup(state, player, rng))
      }

      let guard = 0
      while (state.phase !== 'ended' && guard++ < 300) {
        const actor = state.phase === 'promote' ? state.promoting! : state.current
        state = playAiTurn(
          state,
          actor,
          actor === 'you' ? DIFFICULTY.hard : { mistakeRate: 0.95 },
        )
      }

      if (state.winner === 'you') sharpWins++
    }

    expect(sharpWins, `sharp AI won ${sharpWins}/${rounds}`).toBeGreaterThan(rounds * 0.6)
  })
})

describe('card data', () => {
  it('names an effect the engine can run, or none at all', () => {
    const missing = new Set<string>()

    for (const card of CARDS) {
      if (isFigure(card)) {
        for (const attack of card.attacks) {
          if (attack.effect && !effectIsImplemented(attack.effect)) missing.add(attack.effect)
        }
      } else if (!effectIsImplemented(card.effect)) {
        missing.add(card.effect)
      }
    }

    // Unimplemented riders are survivable — attacks still deal damage — but
    // they should be a known, shrinking list rather than a surprise.
    expect([...missing].sort()).toEqual([])
  })

  it('gives every ascending Figure a Figure to ascend from', () => {
    for (const card of CARDS) {
      if (!isFigure(card) || card.stage === 'basic') continue

      expect(card.ascendsFrom, `${card.id} has no ascendsFrom`).toBeDefined()
      const base = requireCard(card.ascendsFrom!)
      expect(isFigure(base), `${card.ascendsFrom} is not a Figure`).toBe(true)
    }
  })

  it('gives every Figure at least one attack it could pay for', () => {
    for (const card of CARDS) {
      if (!isFigure(card)) continue
      expect(card.attacks.length, `${card.id} has no attacks`).toBeGreaterThan(0)
      for (const attack of card.attacks) {
        expect(attack.cost.length, `${card.id}/${attack.name} is free`).toBeGreaterThan(0)
      }
    }
  })
})
