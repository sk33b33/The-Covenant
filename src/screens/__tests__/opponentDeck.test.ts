import { describe, expect, it } from 'vitest'
import { RULES } from '@/game/config'
import { requireCard } from '@/data/cards'
import { isFigure } from '@/game/types'
import { validateDeck } from '@/store/decks'
import { buildOpponentDeck } from '../BattleRoute'

/**
 * The quick-battle opponent deck.
 *
 * This exists because the generator shipped a bug that no rules test could
 * catch: it produced decks of 14–16 cards, and the engine dutifully played
 * them until the short side lost to deck-out around turn nine. The match
 * looked broken while every rule was working correctly. Asserting legality
 * over many seeds is the cheap way to keep generated content honest.
 */
describe('buildOpponentDeck', () => {
  it('produces a deck that passes the same check a player deck must pass', () => {
    for (let seed = 0; seed < 400; seed++) {
      const deck = buildOpponentDeck(seed)
      const result = validateDeck(deck)
      expect(result.errors, `seed ${seed}`).toEqual([])
      expect(result.legal, `seed ${seed}`).toBe(true)
    }
  })

  it('always holds exactly the deck size', () => {
    for (let seed = 0; seed < 400; seed++) {
      expect(buildOpponentDeck(seed).cards, `seed ${seed}`).toHaveLength(RULES.DECK_SIZE)
    }
  })

  it('never exceeds the copy limit', () => {
    for (let seed = 0; seed < 200; seed++) {
      const tally = new Map<string, number>()
      for (const id of buildOpponentDeck(seed).cards) {
        tally.set(id, (tally.get(id) ?? 0) + 1)
      }
      for (const [id, count] of tally) {
        expect(count, `seed ${seed}, ${id}`).toBeLessThanOrEqual(RULES.MAX_COPIES)
      }
    }
  })

  it('holds enough Basics to open reliably', () => {
    for (let seed = 0; seed < 200; seed++) {
      const basics = buildOpponentDeck(seed).cards.filter((id) => {
        const card = requireCard(id)
        return isFigure(card) && card.stage === 'basic'
      })
      // The opening hand is five cards; too few Basics makes the guaranteed
      // opening reshuffle work far harder than it should.
      expect(basics.length, `seed ${seed}`).toBeGreaterThanOrEqual(6)
    }
  })

  it('declares two distinct energy types', () => {
    for (let seed = 0; seed < 200; seed++) {
      const { energy } = buildOpponentDeck(seed)
      expect(energy).toHaveLength(2)
      expect(new Set(energy).size, `seed ${seed}`).toBe(2)
    }
  })

  it('is deterministic for a seed', () => {
    expect(buildOpponentDeck(7)).toEqual(buildOpponentDeck(7))
    expect(buildOpponentDeck(7).cards).not.toEqual(buildOpponentDeck(8).cards)
  })
})
