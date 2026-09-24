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

/** How long a pulled card wears the "new" badge before it fades on its own,
 *  for whoever never opens it to acknowledge it directly (see `markSeen`). */
export const UNSEEN_WINDOW_MS = 12 * 60 * 60 * 1000

export interface CollectionState {
  owned: Record<string, number>
  /** Card ids pulled recently, each against when — the "new" badge in
   *  Collection reads this against the current time and `UNSEEN_WINDOW_MS`
   *  itself, since a timestamp doesn't stop being true on its own. */
  unseenSince: Record<string, number>
}

const initial: CollectionState = { owned: {}, unseenSince: {} }

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
  /** Replaces state wholesale from a cloud pull on sign-in — see `store/auth.ts`. */
  hydrate: (data: CollectionState) => void
}

const snapshot = (s: CollectionStore): CollectionState => ({
  owned: s.owned,
  unseenSince: s.unseenSince,
})

export const useCollection = create<CollectionStore>((set, get) => {
  const persist = () => save('collection', snapshot(get()))

  // A save from before `unseenSince` existed carries the old `unseen` array
  // (or nothing at all) instead — falling back field by field, rather than
  // trusting the loaded object whole, is what keeps that save from booting
  // with `unseenSince` missing and every "new" check throwing.
  const loaded = load('collection', initial)

  return {
    owned: loaded.owned ?? initial.owned,
    unseenSince: loaded.unseenSince ?? initial.unseenSince,

    count: (cardId) => get().owned[cardId] ?? 0,
    has: (cardId) => (get().owned[cardId] ?? 0) > 0,

    add: (cardIds) => {
      const owned = { ...get().owned }
      const newIds: string[] = []

      for (const id of cardIds) {
        if (!owned[id]) newIds.push(id)
        owned[id] = (owned[id] ?? 0) + 1
      }

      // Stamped fresh for every id in the pull, a duplicate included — a
      // second copy of a card you already own is still a new pull, and
      // deserves its own full 12 hours rather than inheriting however much
      // of the first copy's window happened to be left.
      const now = Date.now()
      const unseenSince = { ...get().unseenSince }
      for (const id of cardIds) unseenSince[id] = now
      set({ owned, unseenSince })
      persist()
      return newIds
    },

    markSeen: (cardIds) => {
      let unseenSince: Record<string, number>
      if (cardIds) {
        unseenSince = { ...get().unseenSince }
        for (const id of cardIds) delete unseenSince[id]
      } else {
        unseenSince = {}
      }
      set({ unseenSince })
      persist()
    },

    total: () => Object.values(get().owned).reduce((a, b) => a + b, 0),

    progress: (setId) => {
      const pool = setId ? CARDS.filter((c) => c.set === setId) : CARDS
      const owned = pool.filter((c) => (get().owned[c.id] ?? 0) > 0).length
      return { owned, total: pool.length }
    },

    reset: () => {
      set({ owned: {}, unseenSince: {} })
      persist()
    },

    hydrate: (data) => {
      set({
        owned: data.owned ?? initial.owned,
        unseenSince: data.unseenSince ?? initial.unseenSince,
      })
      persist()
    },
  }
})
