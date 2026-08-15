import { create } from 'zustand'
import { load, save } from './persist'

/**
 * Story progress.
 *
 * Records which encounters have been cleared, so rewards are paid once and the
 * chapter map knows what to unlock. Attempts are tracked only to let the
 * interface soften after a few losses; nothing in the rules reads them.
 */

export interface StoryState {
  cleared: string[]
  attempts: Record<string, number>
}

const initial: StoryState = { cleared: [], attempts: {} }

interface StoryStore extends StoryState {
  isCleared: (encounterId: string) => boolean
  attemptsOn: (encounterId: string) => number
  noteAttempt: (encounterId: string) => void
  /** Marks an encounter cleared. Returns false if it already was, so the
   *  caller knows not to pay the first-clear reward twice. */
  clear: (encounterId: string) => boolean
  reset: () => void
}

export const useStory = create<StoryStore>((set, get) => {
  const persist = () => save('story', { cleared: get().cleared, attempts: get().attempts })

  return {
    ...load('story', initial),

    isCleared: (id) => get().cleared.includes(id),
    attemptsOn: (id) => get().attempts[id] ?? 0,

    noteAttempt: (id) => {
      set((s) => ({ attempts: { ...s.attempts, [id]: (s.attempts[id] ?? 0) + 1 } }))
      persist()
    },

    clear: (id) => {
      if (get().cleared.includes(id)) return false
      set((s) => ({ cleared: [...s.cleared, id] }))
      persist()
      return true
    },

    reset: () => {
      set({ cleared: [], attempts: {} })
      persist()
    },
  }
})
