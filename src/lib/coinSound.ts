import { asset } from './asset'
import { useSettings } from '@/store/settings'

/**
 * The coin's own flip — a short recorded clip, not synthesised the way
 * `tap.ts`'s click is: that one is a few milliseconds of tone with nothing
 * to it but pitch and decay, this is a real physical sound with a texture
 * no oscillator would fake convincingly.
 *
 * One element, built once and reused for every flip — a card that flips a
 * coin more than once in a match has no reason to re-fetch and re-decode
 * the same few kilobytes each time, the same reasoning `chime.ts`'s own
 * singleton is built on.
 *
 * Routed through the Sound Effects channel (`sfxMuted`/`sfxVolume`), not
 * Game Music: this is a gameplay cue like the tap click, not the one scored
 * piece of audio the entry chime is.
 */

/** The clip's own length, from scripts/trim-audio.py. */
const COIN_SOUND_S = 1.54

let el: HTMLAudioElement | null = null

function element(): HTMLAudioElement {
  if (!el) {
    el = new Audio(asset('audio/coin-spin.mp3'))
    el.preload = 'auto'
  }
  return el
}

/** Starts fetching the clip ahead of the first flip, so playback isn't
 *  waiting on a network request the moment the coin actually needs it. */
export function preloadCoinSound(): void {
  element()
}

/**
 * Plays the clip once, its own `playbackRate` stretched or compressed so it
 * starts with the spin and runs out right as the coin settles — the
 * match-start flip and the shorter mid-match one turn for different
 * lengths of time, but both share this one clip rather than needing their
 * own recording apiece.
 */
export function playCoinSpin(durationS: number): void {
  const { sfxMuted, sfxVolume } = useSettings.getState()
  if (sfxMuted || sfxVolume <= 0) return

  const audio = element()
  audio.currentTime = 0
  audio.playbackRate = COIN_SOUND_S / durationS
  audio.volume = sfxVolume
  void audio.play().catch(() => {
    /* autoplay refused or the file never arrived — nothing depends on it */
  })
}
