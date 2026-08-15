import { create } from 'zustand'
import { ECONOMY, xpForLevel } from '@/game/config'
import { load, save } from './persist'

export interface ProfileState {
  name: string
  level: number
  xp: number
  /** True until the player taps through the splash for the first time. */
  isNew: boolean
  battlesWon: number
  battlesPlayed: number
  packsOpened: number
  createdAt: number
}

const initial: ProfileState = {
  name: 'Wayfarer',
  level: 1,
  xp: 0,
  isNew: true,
  battlesWon: 0,
  battlesPlayed: 0,
  packsOpened: 0,
  createdAt: Date.now(),
}

interface ProfileStore extends ProfileState {
  rename: (name: string) => void
  markSeen: () => void
  /** Adds XP and rolls levels. Returns how many levels were gained. */
  addXp: (amount: number) => number
  recordBattle: (won: boolean) => void
  recordPackOpened: () => void
}

const persist = (state: ProfileState) => save('profile', state)

const snapshot = (s: ProfileStore): ProfileState => ({
  name: s.name,
  level: s.level,
  xp: s.xp,
  isNew: s.isNew,
  battlesWon: s.battlesWon,
  battlesPlayed: s.battlesPlayed,
  packsOpened: s.packsOpened,
  createdAt: s.createdAt,
})

export const useProfile = create<ProfileStore>((set, get) => ({
  ...load('profile', initial),

  rename: (name) => {
    const trimmed = name.trim().slice(0, 16) || 'Wayfarer'
    set({ name: trimmed })
    persist(snapshot(get()))
  },

  markSeen: () => {
    if (!get().isNew) return
    set({ isNew: false })
    persist(snapshot(get()))
  },

  addXp: (amount) => {
    let { level, xp } = get()
    xp += amount

    let gained = 0
    // A large reward can cross more than one level at once.
    while (xp >= xpForLevel(level)) {
      xp -= xpForLevel(level)
      level += 1
      gained += 1
    }

    set({ level, xp })
    persist(snapshot(get()))
    return gained
  },

  recordBattle: (won) => {
    set((s) => ({
      battlesPlayed: s.battlesPlayed + 1,
      battlesWon: s.battlesWon + (won ? 1 : 0),
    }))
    get().addXp(won ? ECONOMY.XP_PER_WIN : ECONOMY.XP_PER_LOSS)
  },

  recordPackOpened: () => {
    set((s) => ({ packsOpened: s.packsOpened + 1 }))
    get().addXp(ECONOMY.XP_PER_PACK)
  },
}))

/** Fraction of the way to the next level, 0–1. */
export const levelProgress = (level: number, xp: number): number =>
  Math.max(0, Math.min(1, xp / xpForLevel(level)))
