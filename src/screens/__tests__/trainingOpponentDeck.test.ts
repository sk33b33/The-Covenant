import { describe, expect, it } from 'vitest'
import { RULES } from '@/game/config'
import { requireCard } from '@/data/cards'
import { isFigure } from '@/game/types'
import { validateDeck } from '@/store/decks'
import { buildTrainingOpponentDeck } from '../BattleRoute'

/**
 * The Training opponent deck.
 *
 * Same shape of coverage as `opponentDeck.test.ts` — the one thing this
 * builder has to get right that the quick-battle one doesn't is staying
 * legal while restricted to a *single* element, which is the whole point of
 * a Training deck (see `buildTrainingOpponentDeck`'s own comment). Looping
 * over many seeds exercises every element in the set many times over.
 */
describe('buildTrainingOpponentDeck', () => {
  it('produces a deck that passes the same check a player deck must pass', () => {
    for (let seed = 0; seed < 400; seed++) {
      const deck = buildTrainingOpponentDeck(seed)
      const result = validateDeck(deck)
      expect(result.errors, `seed ${seed}`).toEqual([])
      expect(result.legal, `seed ${seed}`).toBe(true)
    }
  })

  it('always holds exactly the deck size', () => {
    for (let seed = 0; seed < 400; seed++) {
      expect(buildTrainingOpponentDeck(seed).cards, `seed ${seed}`).toHaveLength(RULES.DECK_SIZE)
    }
  })

  it('never exceeds the copy limit', () => {
    for (let seed = 0; seed < 200; seed++) {
      const tally = new Map<string, number>()
      for (const id of buildTrainingOpponentDeck(seed).cards) {
        tally.set(id, (tally.get(id) ?? 0) + 1)
      }
      for (const [id, count] of tally) {
        expect(count, `seed ${seed}, ${id}`).toBeLessThanOrEqual(RULES.MAX_COPIES)
      }
    }
  })

  it('holds enough Basics to open reliably', () => {
    for (let seed = 0; seed < 200; seed++) {
      const basics = buildTrainingOpponentDeck(seed).cards.filter((id) => {
        const card = requireCard(id)
        return isFigure(card) && card.stage === 'basic'
      })
      expect(basics.length, `seed ${seed}`).toBeGreaterThanOrEqual(6)
    }
  })

  it('declares exactly one energy type', () => {
    for (let seed = 0; seed < 200; seed++) {
      const { energy } = buildTrainingOpponentDeck(seed)
      expect(energy, `seed ${seed}`).toHaveLength(1)
    }
  })

  it('draws every Figure from that single declared element', () => {
    for (let seed = 0; seed < 200; seed++) {
      const { cards, energy } = buildTrainingOpponentDeck(seed)
      for (const id of cards) {
        const card = requireCard(id)
        if (isFigure(card)) expect(card.type, `seed ${seed}, ${id}`).toBe(energy[0])
      }
    }
  })

  it('is deterministic for a seed', () => {
    expect(buildTrainingOpponentDeck(7)).toEqual(buildTrainingOpponentDeck(7))
    expect(buildTrainingOpponentDeck(7).cards).not.toEqual(buildTrainingOpponentDeck(8).cards)
  })
})
