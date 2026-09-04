import { create } from 'zustand'
import { load, save } from './persist'

/**
 * Graphics and audio preferences.
 *
 * `reducedMotion` is an override on top of the OS's own prefers-reduced-motion
 * — either one simplifies the pack carousel's spring and drops the card
 * viewer's 3D tilt, for a player whose phone doesn't report the preference
 * itself but still wants it off.
 *
 * Audio is two independent channels rather than one shared switch: sound
 * effects (the button tap) and game music (the entry chime — the one piece
 * of scored audio the game has, not a UI blip). Each gets its own mute and
 * its own 0–1 volume, so muting one leaves the other untouched. Everything
 * that plays a sound reads its channel's volume and mute at the moment it
 * plays, funnelled through `src/lib/tap.ts` and `src/lib/chime.ts` — nothing
 * downstream has to remember to check either.
 */

export interface SettingsState {
  reducedMotion: boolean
  sfxMuted: boolean
  musicMuted: boolean
  sfxVolume: number
  musicVolume: number
}

const initial: SettingsState = {
  reducedMotion: false,
  sfxMuted: false,
  musicMuted: false,
  sfxVolume: 1,
  musicVolume: 1,
}

interface SettingsStore extends SettingsState {
  setReducedMotion: (v: boolean) => void
  setSfxMuted: (v: boolean) => void
  setMusicMuted: (v: boolean) => void
  setSfxVolume: (v: number) => void
  setMusicVolume: (v: number) => void
}

const snapshot = (s: SettingsStore): SettingsState => ({
  reducedMotion: s.reducedMotion,
  sfxMuted: s.sfxMuted,
  musicMuted: s.musicMuted,
  sfxVolume: s.sfxVolume,
  musicVolume: s.musicVolume,
})

const clamp01 = (v: number) => Math.min(1, Math.max(0, v))

/**
 * `load` returns whatever shape was actually on disk, not merged with
 * defaults — a save from before the single `muted` switch split into two
 * channels would otherwise come back missing `sfxMuted`/`musicMuted`/both
 * volumes entirely. Filling gaps from `initial` here, once, is simpler than
 * teaching every reader of the store to fall back individually. The old
 * `muted` field (if present) seeds both new switches, so a player who had
 * muted the game doesn't come back to it suddenly making noise.
 */
function migrate(): SettingsState {
  const stored = load<Partial<SettingsState> & { muted?: boolean }>('settings', {})
  const legacyMuted = typeof stored.muted === 'boolean' ? stored.muted : undefined

  return {
    reducedMotion: stored.reducedMotion ?? initial.reducedMotion,
    sfxMuted: stored.sfxMuted ?? legacyMuted ?? initial.sfxMuted,
    musicMuted: stored.musicMuted ?? legacyMuted ?? initial.musicMuted,
    sfxVolume: typeof stored.sfxVolume === 'number' ? clamp01(stored.sfxVolume) : initial.sfxVolume,
    musicVolume: typeof stored.musicVolume === 'number' ? clamp01(stored.musicVolume) : initial.musicVolume,
  }
}

export const useSettings = create<SettingsStore>((set, get) => {
  const persist = () => save('settings', snapshot(get()))

  return {
    ...migrate(),

    setReducedMotion: (v) => {
      set({ reducedMotion: v })
      persist()
    },

    setSfxMuted: (v) => {
      set({ sfxMuted: v })
      persist()
    },

    setMusicMuted: (v) => {
      set({ musicMuted: v })
      persist()
    },

    setSfxVolume: (v) => {
      set({ sfxVolume: clamp01(v) })
      persist()
    },

    setMusicVolume: (v) => {
      set({ musicVolume: clamp01(v) })
      persist()
    },
  }
})
