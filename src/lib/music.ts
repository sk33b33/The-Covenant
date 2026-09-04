import { asset } from './asset'
import { useSettings } from '@/store/settings'

/**
 * The looping menu music — Home, Cards, Social and Menu, and everything else
 * that isn't a match. A battle gets its own track (a separate module, once
 * that clip exists); this one's job is to fill the rest of the app and get
 * out of the way the moment a match starts.
 *
 * Built the same way `chime.ts` is: one element, owned by the module rather
 * than by whichever screen happens to be mounted, so React's own churn —
 * StrictMode's double-mount, a route swap, `AnimatePresence` unmounting a
 * screen mid-transition — never has a chance to cut it off or restart it
 * from a component's effect cleanup running at the wrong moment. Playback
 * is driven by App.tsx's route effect (play outside a battle, pause inside
 * one), so pausing and resuming is just that — the same loop picks up where
 * it left off instead of starting over each time a battle ends.
 */

let el: HTMLAudioElement | null = null

/** Builds the element and starts it downloading, without playing it — the
 *  first tap on the entry screen is what actually starts playback, since
 *  that's the one gesture guaranteed to satisfy the browser's autoplay
 *  policy. */
export function preloadMusic(): void {
  if (el) return
  el = new Audio(asset('audio/menu-music.mp3'))
  el.preload = 'auto'
  el.loop = true
  syncVolume()
}

function syncVolume(): void {
  if (!el) return
  const { musicMuted, musicVolume } = useSettings.getState()
  el.volume = musicMuted ? 0 : musicVolume
}

// Live, not just at the moment playback starts — dragging the Game Music
// slider (or hitting Muted) takes effect immediately on a track that's
// already looping, the same as it does mid-chime.
useSettings.subscribe(syncVolume)

/** Starts the loop if it isn't already running. Safe to call repeatedly —
 *  from the route effect on every non-battle screen, say — since a track
 *  already playing just keeps playing. */
export function playMusic(): void {
  preloadMusic()
  const audio = el
  if (!audio) return

  syncVolume()
  if (!audio.paused) return

  void audio.play().catch(() => {
    /* autoplay refused (no gesture yet) or the file hasn't arrived —
       nothing depends on it; the route effect tries again on the next
       screen that wants it playing. */
  })
}

/** Pauses without resetting position, so the loop resumes from wherever it
 *  was rather than restarting — entering and leaving a battle repeatedly
 *  shouldn't mean only ever hearing the first few seconds of the track. */
export function pauseMusic(): void {
  el?.pause()
}
