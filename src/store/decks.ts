import { create } from 'zustand'
import { STARTER_DECK } from '@/data/starter'
import { getCard } from '@/data/cards'
import { RULES } from '@/game/config'
import { isFigure, type Deck, type EnergyType } from '@/game/types'
import { load, save } from './persist'

/**
 * Saved decks, and the one rule set that decides whether a deck may be played.
 *
 * `validateDeck` is the single authority — the deck builder shows its messages
 * live, and the battle entry point refuses anything it rejects, so there is no
 * way to reach a match with an illegal deck.
 */

export interface DeckValidation {
  legal: boolean
  errors: string[]
  counts: { total: number; figures: number; basics: number }
}

export function validateDeck(deck: Pick<Deck, 'cards' | 'energy'>): DeckValidation {
  const errors: string[] = []
  const cards = deck.cards.map(getCard)

  const missing = deck.cards.filter((id) => !getCard(id))
  if (missing.length) errors.push(`Unknown cards: ${missing.join(', ')}`)

  const resolved = cards.filter((c): c is NonNullable<typeof c> => Boolean(c))
  const figures = resolved.filter(isFigure)
  const basics = figures.filter((f) => f.stage === 'basic')

  if (deck.cards.length !== RULES.DECK_SIZE) {
    errors.push(`Deck must hold exactly ${RULES.DECK_SIZE} cards (currently ${deck.cards.length}).`)
  }

  const tally = new Map<string, number>()
  deck.cards.forEach((id) => tally.set(id, (tally.get(id) ?? 0) + 1))
  const over = [...tally.entries()].filter(([, n]) => n > RULES.MAX_COPIES)
  if (over.length) {
    const names = over.map(([id]) => getCard(id)?.name ?? id)
    errors.push(`No more than ${RULES.MAX_COPIES} copies of a card: ${names.join(', ')}.`)
  }

  if (basics.length < RULES.MIN_BASIC_FIGURES) {
    errors.push(`Include at least ${RULES.MIN_BASIC_FIGURES} Basic Figure, or you cannot open.`)
  }

  if (deck.energy.length < RULES.MIN_ENERGY_TYPES || deck.energy.length > RULES.MAX_ENERGY_TYPES) {
    errors.push(
      `Declare ${RULES.MIN_ENERGY_TYPES}–${RULES.MAX_ENERGY_TYPES} energy types for the Altar.`,
    )
  }

  // A Figure whose attacks need a type the Altar never supplies is a dead card;
  // worth warning about rather than forbidding, since colourless costs exist.
  const declared = new Set<EnergyType>(deck.energy)
  const stranded = figures.filter((f) =>
    f.attacks.every((a) => a.cost.some((c) => c !== null && !declared.has(c))),
  )
  if (stranded.length) {
    const names = [...new Set(stranded.map((f) => f.name))]
    errors.push(`No declared energy can pay for: ${names.join(', ')}.`)
  }

  return {
    legal: errors.length === 0,
    errors,
    counts: { total: deck.cards.length, figures: figures.length, basics: basics.length },
  }
}

interface DeckStore {
  decks: Deck[]
  activeDeckId: string | null

  get: (id: string) => Deck | undefined
  active: () => Deck | undefined
  upsert: (deck: Omit<Deck, 'updatedAt'>) => void
  remove: (id: string) => void
  setActive: (id: string) => void
  /** Installs the starter deck if the player has none. */
  ensureStarter: () => void
}

interface Persisted {
  decks: Deck[]
  activeDeckId: string | null
}

const initial: Persisted = { decks: [], activeDeckId: null }

export const useDecks = create<DeckStore>((set, get) => {
  const persist = () => save('decks', { decks: get().decks, activeDeckId: get().activeDeckId })

  return {
    ...load('decks', initial),

    get: (id) => get().decks.find((d) => d.id === id),
    active: () => {
      const { decks, activeDeckId } = get()
      return decks.find((d) => d.id === activeDeckId) ?? decks[0]
    },

    upsert: (deck) => {
      const next = { ...deck, updatedAt: Date.now() }
      const decks = get().decks.some((d) => d.id === deck.id)
        ? get().decks.map((d) => (d.id === deck.id ? next : d))
        : [...get().decks, next]

      set({ decks, activeDeckId: get().activeDeckId ?? deck.id })
      persist()
    },

    remove: (id) => {
      const decks = get().decks.filter((d) => d.id !== id)
      set({
        decks,
        activeDeckId: get().activeDeckId === id ? (decks[0]?.id ?? null) : get().activeDeckId,
      })
      persist()
    },

    setActive: (id) => {
      set({ activeDeckId: id })
      persist()
    },

    ensureStarter: () => {
      if (get().decks.length > 0) return
      get().upsert(STARTER_DECK)
    },
  }
})
