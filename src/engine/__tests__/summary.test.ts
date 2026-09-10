import { beforeEach, describe, expect, it } from 'vitest'
import { STARTER_DECK } from '@/data/starter'
import { buildBreakdown, pickMvp } from '../summary'
import { reduce } from '../reducer'
import { setupOptions } from '../legal'
import { createMatch, figureCard, resetUids, type MatchSetup } from '../state'
import type { MatchState, PlayerId } from '../types'


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

/** Places a legal opening board for both players and reaches the main phase —
 *  the first legal placement `setupOptions` offers, whatever the dealt hand
 *  actually contains, rather than a hardcoded card name that may not have
 *  been dealt. */
function setUpBoth(state: MatchState): MatchState {
  let next = state
  for (const player of ['you', 'foe'] as PlayerId[]) {
    const option = setupOptions(next, player)[0]
    if (!option) throw new Error(`No opening placement for ${player}`)
    next = reduce(next, { type: 'SETUP', player, ...option })
  }
  return next
}

beforeEach(() => resetUids())

/**
 * A rigged, already-fought exchange: `you`'s Active knocks out `foe`'s.
 *
 * Only the attacker's cardId is overwritten. The defender is left as
 * whatever `setUpBoth` actually dealt and placed — overwriting it too would
 * mean its "played" event, logged for the real card SETUP put there, no
 * longer matches the id this rig would go on to reference, which is exactly
 * the seam `buildBreakdown`'s tests below need to be honest.
 */
function knockoutMatch(): MatchState {
  let state = setUpBoth(match({ forceFirst: 'foe' }))

  const you = state.players.you.active!
  you.cardId = 'the-altar-fire'
  you.damage = 0
  you.energy = Array(3).fill(figureCard(you).type)
  const foe = state.players.foe.active!
  // A flat one below its own max HP: any positive hit at all is a kill,
  // whichever Basic setup happened to deal foe this run.
  foe.damage = figureCard(foe).hp - 1

  state = reduce(state, { type: 'END_TURN' }) // foe's opening turn passes
  return reduce(state, { type: 'ATTACK', attackIndex: 0 })
}

describe('pickMvp', () => {
  it('credits the Figure that dealt the most damage', () => {
    const state = knockoutMatch()
    const mvp = pickMvp(state)
    expect(mvp).toEqual({ cardId: 'the-altar-fire', player: 'you' })
  })

  it("falls back to the winner's Active when no attack ever landed", () => {
    let state = setUpBoth(match({ forceFirst: 'you' }))
    state = reduce(state, { type: 'CONCEDE', player: 'foe' })

    expect(state.winner).toBe('you')
    const mvp = pickMvp(state)
    expect(mvp?.player).toBe('you')
    expect(mvp?.cardId).toBe(state.players.you.active!.cardId)
  })
})

describe('buildBreakdown', () => {
  it('tallies damage dealt, damage taken and knockouts on the right side', () => {
    const state = knockoutMatch()
    const { stats } = buildBreakdown(state)

    expect(stats.you.damageDealt).toBeGreaterThan(0)
    expect(stats.foe.damageTaken).toBe(stats.you.damageDealt)
    expect(stats.you.knockouts).toBe(1)
    expect(stats.foe.knockouts).toBe(0)
  })

  it("lists each side's own cards used, not the opponent's", () => {
    // A one-card deck of something the starter deck never holds, so nothing
    // `you` draws could coincidentally be the same card and mask the bug
    // this guards — both sides otherwise draw from the identical starter
    // list, and a card as common as a Basic can easily turn up on both.
    let state = setUpBoth(
      match({ forceFirst: 'foe', foe: { deck: Array(20).fill('melchizedek'), energy: ['light', 'earth'] } }),
    )
    const foeCardId = state.players.foe.active!.cardId
    expect(foeCardId).toBe('melchizedek')

    const you = state.players.you.active!
    you.cardId = 'the-altar-fire'
    you.damage = 0
    you.energy = Array(3).fill(figureCard(you).type)
    state.players.foe.active!.damage = figureCard(state.players.foe.active!).hp - 1

    state = reduce(state, { type: 'END_TURN' })
    state = reduce(state, { type: 'ATTACK', attackIndex: 0 })

    const { cardsUsed } = buildBreakdown(state)
    expect(cardsUsed.you).toContain('the-altar-fire')
    // The card that got knocked out is credited to its own side, not to
    // whoever earned the points for knocking it out.
    expect(cardsUsed.you).not.toContain(foeCardId)
    expect(cardsUsed.foe).toContain(foeCardId)
  })

  it('counts an energy attachment under its own type', () => {
    let state = setUpBoth(match({ forceFirst: 'you' }))
    const you = state.players.you.active!
    state.players.you.altar = 'light'
    state = reduce(state, { type: 'ATTACH', uid: you.uid })

    const { stats } = buildBreakdown(state)
    expect(stats.you.energyAttached.light).toBe(1)
  })

  it('only charts entries that carry a structured event', () => {
    const state = knockoutMatch()
    const { timeline } = buildBreakdown(state)
    expect(timeline.every((entry) => entry.event !== undefined)).toBe(true)
    // The log itself has more than this — the "uses X" line, the win banner —
    // none of which carry a structured event.
    expect(timeline.length).toBeLessThan(state.log.length)
  })
})
