import { asset } from './asset'
import { useSettings } from '@/store/settings'

/**
 * The entry sound.
 *
 * Owned by the module rather than by the screen that plays it. That is not
 * tidiness — it is the fix for a real defect. The splash used to build its own
 * `Audio` in an effect and pause it in that effect's cleanup, and
 * AnimatePresence unmounts the splash while the clip is still running, so the
 * sound was cut off a fifth of the way in and its fade never ran at all. Out
 * here the sound's lifetime is the sound's, and it can carry over the top of
 * the interface it just revealed.
 *
 * A single element, built once, also makes React's StrictMode double-mount in
 * development a non-event.
 */

/** The clip's length, from scripts/trim-audio.py: 249 frames at 1152 samples. */
export const CHIME_S = 5.98

/** How long the tail takes to reach silence. */
const FADE_S = 2.1

let el: HTMLAudioElement | null = null

/**
 * Builds and starts fetching the clip, so the file is decoded and ready before
 * the tap rather than beginning its download at the moment it should be heard.
 */
export function preloadChime(): void {
  if (el) return
  el = new Audio(asset('audio/enter.mp3'))
  el.preload = 'auto'
}

/**
 * Plays the clip once, fading it out over its last couple of seconds.
 *
 * The fade is a raised cosine rather than the straight line it replaces:
 *
 *     volume = ½(1 + cos(πt))
 *
 * Its slope is zero at both ends, so the sound leaves full volume
 * imperceptibly instead of lurching off it, and settles into silence instead of
 * arriving at it. A linear ramp on amplitude is not linear in loudness — it
 * drops away quickly and then hangs, which is the opposite of resolving.
 *
 * Driven off `currentTime` on animation frames, not a timer: a `setTimeout`
 * measures from the moment play was *requested*, so a clip that starts late
 * fades the wrong part of itself. Frame increments peak around 0.0125, far too
 * small to zipper.
 */
export function playChime(): void {
  preloadChime()
  const audio = el
  if (!audio) return

  // The mute switch in Menu → Audio. Checked here, at the one place every
  // sound in the game funnels through, rather than at each call site.
  if (useSettings.getState().muted) return

  // A second tap must not restart it, and must not double it up over itself.
  if (!audio.paused) return

  audio.currentTime = 0
  audio.volume = 1
  void audio.play().catch(() => {
    /* autoplay refused or the file never arrived — nothing depends on it */
  })

  const frame = () => {
    if (audio.paused) return

    const total = Number.isFinite(audio.duration) ? audio.duration : CHIME_S
    const left = total - audio.currentTime

    if (left <= FADE_S) {
      const t = Math.min(1, Math.max(0, 1 - left / FADE_S))
      audio.volume = Math.min(1, Math.max(0, 0.5 * (1 + Math.cos(Math.PI * t))))
    }

    if (left <= 0.02) {
      audio.pause()
      return
    }

    requestAnimationFrame(frame)
  }

  requestAnimationFrame(frame)
}
