import { describe, expect, it } from 'vitest'
import { RULES } from '@/game/config'
import { getCard } from '@/data/cards'
import { isFigure } from '@/game/types'
import { validateDeck } from '@/store/decks'
import { ALL_ENCOUNTERS, CHAPTERS, isEncounterUnlocked } from '../story/genesis'

/**
 * Story content.
 *
 * The story decks are hand-written, which means a typo in a card id or one
 * card too many is a silent, shipped bug — the encounter would simply be
 * unplayable or lose to deck-out. These assertions are the proofreader.
 */

describe('story decks', () => {
  it('are legal decks by the same rules a player must follow', () => {
    for (const encounter of ALL_ENCOUNTERS) {
      const result = validateDeck(encounter.deck)
      expect(result.errors, `${encounter.id}`).toEqual([])
      expect(result.legal, `${encounter.id}`).toBe(true)
    }
  })

  it('name only cards that exist', () => {
    for (const encounter of ALL_ENCOUNTERS) {
      for (const id of encounter.deck.cards) {
        expect(getCard(id), `${encounter.id} references unknown card ${id}`).toBeDefined()
      }
      expect(
        getCard(encounter.reward.cardId),
        `${encounter.id} rewards unknown card ${encounter.reward.cardId}`,
      ).toBeDefined()
    }
  })

  it('hold enough Basics that the opening hand is not a coin flip', () => {
    for (const encounter of ALL_ENCOUNTERS) {
      const basics = encounter.deck.cards.filter((id) => {
        const card = getCard(id)
        return card && isFigure(card) && card.stage === 'basic'
      })
      expect(basics.length, `${encounter.id}`).toBeGreaterThanOrEqual(6)
    }
  })

  it('give every Ascended Figure its base Figure in the same deck', () => {
    for (const encounter of ALL_ENCOUNTERS) {
      const present = new Set(encounter.deck.cards)
      for (const id of encounter.deck.cards) {
        const card = getCard(id)
        if (!card || !isFigure(card) || card.stage === 'basic') continue
        // An Ascended Figure with no base in the deck can never be played.
        expect(
          present.has(card.ascendsFrom!),
          `${encounter.id}: ${card.id} ascends from ${card.ascendsFrom}, which is not in the deck`,
        ).toBe(true)
      }
    }
  })

  it('declares energy that can pay for the deck it is in', () => {
    for (const encounter of ALL_ENCOUNTERS) {
      const warnings = validateDeck(encounter.deck).warnings
      expect(warnings, `${encounter.id}`).toEqual([])
    }
  })
})

describe('story structure', () => {
  it('numbers encounters from one, without gaps', () => {
    for (const chapter of CHAPTERS) {
      const indices = chapter.encounters.map((e) => e.index).sort((a, b) => a - b)
      indices.forEach((value, i) => {
        expect(value, `${chapter.id}`).toBe(i + 1)
      })
    }
  })

  it('unlocks the first encounter and gates the rest behind the one before', () => {
    const genesis = CHAPTERS.find((c) => c.id === 'genesis')!
    const first = genesis.encounters[0]!
    const second = genesis.encounters[1]!

    expect(isEncounterUnlocked(first, [])).toBe(true)
    expect(isEncounterUnlocked(second, [])).toBe(false)
    expect(isEncounterUnlocked(second, [first.id])).toBe(true)
  })

  it('gives every encounter dialogue on both outcomes', () => {
    for (const encounter of ALL_ENCOUNTERS) {
      expect(encounter.intro.length, `${encounter.id} intro`).toBeGreaterThan(0)
      expect(encounter.victory.length, `${encounter.id} victory`).toBeGreaterThan(0)
      expect(encounter.defeat.length, `${encounter.id} defeat`).toBeGreaterThan(0)
    }
  })

  it('escalates rewards through the chapter', () => {
    const genesis = CHAPTERS.find((c) => c.id === 'genesis')!
    const talents = genesis.encounters.map((e) => e.reward.talents)
    for (let i = 1; i < talents.length; i++) {
      expect(talents[i]!, `encounter ${i + 1}`).toBeGreaterThan(talents[i - 1]!)
    }
  })

  it('keeps every deck at the configured size', () => {
    for (const encounter of ALL_ENCOUNTERS) {
      expect(encounter.deck.cards, `${encounter.id}`).toHaveLength(RULES.DECK_SIZE)
    }
  })
})
