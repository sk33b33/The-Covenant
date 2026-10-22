import type { EndReason } from '@/engine/types'
import { create } from 'zustand'
import { load, save } from './persist'

/**
 * A running log of finished matches — Quick Battle, Training and Story alike
 * — so a player can look back at what they actually played rather than only
 * the running won/lost tally Profile already keeps.
 *
 * Capped rather than unbounded: every entry here rides in the same portal
 * save payload as everything else (see `persist.ts`), and a save that grows
 * forever is a save that gets slower to push and pull a little more with
 * every match played. The newest `MAX_ENTRIES` is plenty to actually look
 * back through on a phone screen; nothing in the rules reads this list, so
 * trimming the tail costs nothing but old history.
 */

export interface MatchHistoryEntry {
  id: string
  playedAt: number
  won: boolean
  opponentName: string
  yourPoints: number
  opponentPoints: number
  endReason: EndReason
}

export interface MatchHistoryState {
  entries: MatchHistoryEntry[]
}

const initial: MatchHistoryState = { entries: [] }

/** ~50 matches — see the module doc above for why this isn't unbounded. */
const MAX_ENTRIES = 50

interface MatchHistoryStore extends MatchHistoryState {
  /** Newest first. Trims to `MAX_ENTRIES` on every call, so the list never
   *  needs a separate cleanup pass. */
  record: (entry: Omit<MatchHistoryEntry, 'id' | 'playedAt'>) => void
  clear: () => void
  /** Replaces state wholesale from a cloud pull on sign-in — see `store/auth.ts`. */
  hydrate: (data: MatchHistoryState) => void
}

export const useMatchHistory = create<MatchHistoryStore>((set, get) => {
  const persist = () => save('matchHistory', { entries: get().entries })

  return {
    ...load('matchHistory', initial),

    record: (entry) => {
      const full: MatchHistoryEntry = {
        ...entry,
        id: `match-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`,
        playedAt: Date.now(),
      }
      set((s) => ({ entries: [full, ...s.entries].slice(0, MAX_ENTRIES) }))
      persist()
    },

    clear: () => {
      set({ entries: [] })
      persist()
    },

    hydrate: (data) => {
      set({ ...initial, ...data })
      persist()
    },
  }
})
