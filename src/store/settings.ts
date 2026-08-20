import { create } from 'zustand'
import { load, save } from './persist'

/**
 * Graphics and audio preferences.
 *
 * Small on purpose: two switches, both wired to something real rather than
 * decorative. `reducedMotion` is an override on top of the OS's own
 * prefers-reduced-motion — either one simplifies the pack carousel's spring
 * and drops the card viewer's 3D tilt, for a player whose phone doesn't
 * report the preference itself but still wants it off. `muted` gates every
 * sound the game plays (currently just the entry chime) at the source, so
 * nothing downstream has to remember to check it.
 */

export interface SettingsState {
  reducedMotion: boolean
  muted: boolean
}

const initial: SettingsState = {
  reducedMotion: false,
  muted: false,
}

interface SettingsStore extends SettingsState {
  setReducedMotion: (v: boolean) => void
  setMuted: (v: boolean) => void
}

const snapshot = (s: SettingsStore): SettingsState => ({
  reducedMotion: s.reducedMotion,
  muted: s.muted,
})

export const useSettings = create<SettingsStore>((set, get) => {
  const persist = () => save('settings', snapshot(get()))

  return {
    ...load('settings', initial),

    setReducedMotion: (v) => {
      set({ reducedMotion: v })
      persist()
    },

    setMuted: (v) => {
      set({ muted: v })
      persist()
    },
  }
})
