import { asset } from './asset'
import { useSettings } from '@/store/settings'

/**
 * The looping battle music — a match and a story encounter both render the
 * same `Battle` screen, so both get this track instead of the menu loop
 * `music.ts` owns everywhere else. Swapping tracks rather than just muting
 * the menu loop is the point: a battle should sound like a battle.
 *
 * Built the same way as `music.ts`: one element, owned by the module rather
 * than by whichever screen happens to be mounted, so React's own churn —
 * StrictMode's double-mount, a route swap, `AnimatePresence` unmounting a
 * screen mid-transition — never has a chance to cut it off or restart it
 * from a component's effect cleanup running at the wrong moment.
 *
 * Pausing is driven by App.tsx's route effect, the instant a battle route
 * stops being current — but starting is not the same effect's job. Battle.tsx
 * calls `playBattleMusic` itself, once its own coin-flip-then-kickoff-banner
 * intro has actually finished, so the track never has to start underneath
 * that sequence's own sound and beat. Pausing and resuming is just that,
 * either way: the same loop picks up where it left off instead of starting
 * over each time a battle begins.
 */

let el: HTMLAudioElement | null = null

/** Builds the element and starts it downloading, without playing it. */
export function preloadBattleMusic(): void {
  if (el) return
  el = new Audio(asset('audio/battle-music.mp3'))
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
 *  from the route effect on every battle screen, say — since a track
 *  already playing just keeps playing. */
export function playBattleMusic(): void {
  preloadBattleMusic()
  const audio = el
  if (!audio) return

  syncVolume()
  if (!audio.paused) return

  void audio.play().catch(() => {
    /* autoplay refused (no gesture yet) or the file hasn't arrived —
       nothing depends on it; the route effect tries again on the next
       battle that wants it playing. */
  })
}

/** Pauses without resetting position, so the loop resumes from wherever it
 *  was rather than restarting — leaving and re-entering a battle repeatedly
 *  shouldn't mean only ever hearing the first few seconds of the track. */
export function pauseBattleMusic(): void {
  el?.pause()
}
