import { beforeEach, describe, expect, it } from 'vitest'
import { useDecks } from '../decks'
import type { Deck } from '@/game/types'

const deck = (id: string, name: string): Deck => ({
  id,
  name,
  cards: [],
  energy: ['fire'],
  updatedAt: 0,
})

describe('decks store', () => {
  beforeEach(() => {
    useDecks.setState({ decks: [deck('a', 'Alpha'), deck('b', 'Beta'), deck('c', 'Gamma')], activeDeckId: 'a' })
  })

  describe('duplicate', () => {
    it('inserts a copy directly after the original, named "<name> Copy"', () => {
      useDecks.getState().duplicate('a')
      const { decks } = useDecks.getState()
      expect(decks.map((d) => d.name)).toEqual(['Alpha', 'Alpha Copy', 'Beta', 'Gamma'])
    })

    it('gives the copy a new id distinct from the original', () => {
      useDecks.getState().duplicate('a')
      const { decks } = useDecks.getState()
      const [original, copy] = decks
      expect(copy!.id).not.toBe(original!.id)
    })

    it('does not change which deck is active', () => {
      useDecks.getState().duplicate('a')
      expect(useDecks.getState().activeDeckId).toBe('a')
    })

    it('is a no-op for an unknown id', () => {
      useDecks.getState().duplicate('does-not-exist')
      expect(useDecks.getState().decks).toHaveLength(3)
    })
  })

  describe('moveDeck', () => {
    it('moves a deck one slot earlier', () => {
      useDecks.getState().moveDeck('b', -1)
      expect(useDecks.getState().decks.map((d) => d.id)).toEqual(['b', 'a', 'c'])
    })

    it('moves a deck one slot later', () => {
      useDecks.getState().moveDeck('b', 1)
      expect(useDecks.getState().decks.map((d) => d.id)).toEqual(['a', 'c', 'b'])
    })

    it('is a no-op moving the first deck earlier', () => {
      useDecks.getState().moveDeck('a', -1)
      expect(useDecks.getState().decks.map((d) => d.id)).toEqual(['a', 'b', 'c'])
    })

    it('is a no-op moving the last deck later', () => {
      useDecks.getState().moveDeck('c', 1)
      expect(useDecks.getState().decks.map((d) => d.id)).toEqual(['a', 'b', 'c'])
    })

    it('is a no-op for an unknown id', () => {
      useDecks.getState().moveDeck('does-not-exist', 1)
      expect(useDecks.getState().decks.map((d) => d.id)).toEqual(['a', 'b', 'c'])
    })
  })
})
