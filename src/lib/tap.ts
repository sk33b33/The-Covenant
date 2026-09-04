import { useSettings } from '@/store/settings'

/**
 * The soft click every button in the app makes on tap.
 *
 * Synthesised rather than a bundled clip. A UI tick like this is a few
 * milliseconds of tone with a fast attack and a faster decay — recording,
 * encoding and shipping a file for that buys nothing over generating it on
 * the spot, and skips a network request the entry chime can't avoid (that
 * one is a real recorded piece, not a blip).
 *
 * One `AudioContext`, built lazily on the first tap rather than at module
 * load: constructing one before any user gesture leaves it "suspended" in
 * most browsers until a gesture resumes it anyway, so there is nothing to
 * gain from doing it early, and building it inside the handler that a tap
 * itself triggers means the resume never has to be awaited — the gesture
 * that wants the sound is the same one unlocking it.
 */

let ctx: AudioContext | null = null

function audioContext(): AudioContext | null {
  if (ctx) return ctx
  const Ctor = window.AudioContext ?? (window as typeof window & { webkitAudioContext?: typeof AudioContext })
    .webkitAudioContext
  if (!Ctor) return null
  ctx = new Ctor()
  return ctx
}

export function playTap(): void {
  // The Sound Effects channel in Menu → Audio — its own mute and its own
  // volume, independent of Game Music.
  const { sfxMuted, sfxVolume } = useSettings.getState()
  if (sfxMuted || sfxVolume <= 0) return

  const audio = audioContext()
  if (!audio) return
  if (audio.state === 'suspended') void audio.resume()

  const now = audio.currentTime
  const osc = audio.createOscillator()
  const gain = audio.createGain()

  // A short downward tick reads as a press, not a beep — the pitch falling
  // is what makes it feel like something settling rather than an alert.
  osc.type = 'sine'
  osc.frequency.setValueAtTime(720, now)
  osc.frequency.exponentialRampToValueAtTime(380, now + 0.05)

  // Silent to a low peak in 4ms, back to silent by 70ms. Exponential ramps
  // can't target exactly zero, so both ends land just above it — inaudible,
  // and it avoids the click a hard stop at a non-zero gain would leave. The
  // peak itself scales with the slider; the floor stays a fixed near-zero
  // epsilon regardless, since it's inaudible at any volume.
  const peak = 0.08 * sfxVolume
  gain.gain.setValueAtTime(0.0001, now)
  gain.gain.exponentialRampToValueAtTime(peak, now + 0.004)
  gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.07)

  osc.connect(gain)
  gain.connect(audio.destination)

  osc.start(now)
  osc.stop(now + 0.08)
}
