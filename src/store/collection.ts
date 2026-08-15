import { create } from 'zustand'
import { CARDS } from '@/data/cards'
import { load, save } from './persist'

/**
 * What the player owns.
 *
 * Stored as id → count rather than a list of card instances. Cards in this game
 * are fungible — two copies of Jacob are interchangeable — so a count is the
 * whole truth, and it keeps the save a few hundred bytes instead of growing
 * without limit as packs are opened.
 */

export interface CollectionState {
  owned: Record<string, number>
  /** Card ids seen in a pack but not yet acknowledged, for the "new" badge. */
  unseen: string[]
}

const initial: CollectionState = { owned: {}, unseen: [] }

interface CollectionStore extends CollectionState {
  count: (cardId: string) => number
  has: (cardId: string) => boolean
  /** Adds cards. Returns the ids that were new to the collection. */
  add: (cardIds: string[]) => string[]
  markSeen: (cardIds?: string[]) => void
  /** Total cards held, counting duplicates. */
  total: () => number
  /** Distinct cards held, and the set size. */
  progress: (setId?: string) => { owned: number; total: number }
  reset: () => void
}

const snapshot = (s: CollectionStore): CollectionState => ({ owned: s.owned, unseen: s.unseen })

export const useCollection = create<CollectionStore>((set, get) => {
  const persist = () => save('collection', snapshot(get()))

  return {
    ...load('collection', initial),

    count: (cardId) => get().owned[cardId] ?? 0,
    has: (cardId) => (get().owned[cardId] ?? 0) > 0,

    add: (cardIds) => {
      const owned = { ...get().owned }
      const newIds: string[] = []

      for (const id of cardIds) {
        if (!owned[id]) newIds.push(id)
        owned[id] = (owned[id] ?? 0) + 1
      }

      const unseen = [...new Set([...get().unseen, ...cardIds])]
      set({ owned, unseen })
      persist()
      return newIds
    },

    markSeen: (cardIds) => {
      const unseen = cardIds ? get().unseen.filter((id) => !cardIds.includes(id)) : []
      set({ unseen })
      persist()
    },

    total: () => Object.values(get().owned).reduce((a, b) => a + b, 0),

    progress: (setId) => {
      const pool = setId ? CARDS.filter((c) => c.set === setId) : CARDS
      const owned = pool.filter((c) => (get().owned[c.id] ?? 0) > 0).length
      return { owned, total: pool.length }
    },

    reset: () => {
      set({ owned: {}, unseen: [] })
      persist()
    },
  }
})
