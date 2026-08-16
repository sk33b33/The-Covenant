import { load, save } from '@/store/persist'

/**
 * The game's two sounds, synthesised.
 *
 * No audio files. Everything here is oscillators and a generated impulse
 * response, which costs nothing to download, works offline in the PWA without
 * touching the service worker's precache, and leaves every parameter as a
 * number in this file rather than baked into a binary.
 *
 * Two sounds only, and they are shaped by how often they play. The entry swell
 * is heard once per session and can afford to be lush. The tap is heard on
 * every press in the app, which makes restraint the entire design: quiet,
 * short, and dry.
 */

const MUTE_KEY = 'sound'

let muted = load<boolean>(MUTE_KEY, false)
let ctx: AudioContext | null = null
let reverb: ConvolverNode | null = null
let master: GainNode | null = null

export const isMuted = () => muted

export function setMuted(next: boolean): void {
  muted = next
  save(MUTE_KEY, next)
  // Silence anything mid-flight rather than letting a long reverb tail play on
  // after the switch — the toggle has to feel like it took effect.
  if (next && master && ctx) master.gain.setValueAtTime(0, ctx.currentTime)
  else if (master && ctx) master.gain.setValueAtTime(1, ctx.currentTime)
}

/**
 * The context is built on first use, never at module load.
 *
 * Browsers refuse to start audio outside a user gesture, and a context created
 * on load starts `suspended` and stays that way. Every entry point here is a
 * press, so building it lazily means it is always born inside a gesture.
 */
function audio(): { ctx: AudioContext; reverb: ConvolverNode; master: GainNode } | null {
  if (muted) return null

  if (!ctx) {
    const Ctor = window.AudioContext ?? (window as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
    if (!Ctor) return null
    ctx = new Ctor()

    master = ctx.createGain()
    master.gain.value = 1
    master.connect(ctx.destination)

    reverb = ctx.createConvolver()
    reverb.buffer = impulse(ctx, 2.6, 2.4)
    const wet = ctx.createGain()
    wet.gain.value = 0.9
    reverb.connect(wet)
    wet.connect(master)
  }

  // Mobile browsers suspend the context when the tab is backgrounded, and it
  // does not resume on its own.
  if (ctx.state === 'suspended') void ctx.resume()

  return ctx && reverb && master ? { ctx, reverb, master } : null
}

/**
 * A room, made of decaying noise.
 *
 * Convolution against exponentially-decaying noise is the cheapest convincing
 * reverb there is, and it is the whole difference between a chord that stops
 * dead and one that rings out in a cathedral. Stereo, with the two channels
 * generated independently so the tail has width.
 */
function impulse(context: AudioContext, seconds: number, decay: number): AudioBuffer {
  const length = Math.floor(context.sampleRate * seconds)
  const buffer = context.createBuffer(2, length, context.sampleRate)

  for (let channel = 0; channel < 2; channel++) {
    const data = buffer.getChannelData(channel)
    for (let i = 0; i < length; i++) {
      // The leading (1 - i/length) keeps the very front of the tail dense, so
      // the onset sounds like a room rather than a delay line.
      data[i] = (Math.random() * 2 - 1) * (1 - i / length) ** decay
    }
  }

  return buffer
}

/* ------------------------------------------------------------------- entry */

/** A major ninth, in Hz. No melody: it has to survive the hundredth opening. */
const CHORD = [174.61, 261.63, 329.63, 392.0, 587.33]

/**
 * The choral swell, played once as the splash dissolves.
 *
 * Each note is two oscillators a few cents apart. That detune is what stops a
 * stack of sine waves sounding like a test tone — real voices never agree
 * exactly, and the slow beating between the pairs is heard as warmth rather
 * than as two notes.
 */
export function playEnter(): void {
  const a = audio()
  if (!a) return
  const { ctx, reverb, master } = a
  const t = ctx.currentTime

  CHORD.forEach((freq, i) => {
    // The upper voices enter fractionally later, so the chord blooms from its
    // root instead of arriving as a block.
    const start = t + i * 0.055

    for (const cents of [-6, 6]) {
      const osc = ctx.createOscillator()
      osc.type = 'sine'
      osc.frequency.value = freq * 2 ** (cents / 1200)

      const gain = ctx.createGain()
      const peak = 0.13 / (1 + i * 0.35)
      gain.gain.setValueAtTime(0.0001, start)
      gain.gain.exponentialRampToValueAtTime(peak, start + 0.5)
      gain.gain.exponentialRampToValueAtTime(0.0001, start + 3.4)

      osc.connect(gain)
      gain.connect(reverb)
      gain.connect(master)
      osc.start(start)
      osc.stop(start + 3.6)
    }
  })

  // A shimmer an octave above the top voice, quiet and late, which is what
  // reads as "light" rather than simply "chord".
  const shimmer = ctx.createOscillator()
  shimmer.type = 'triangle'
  shimmer.frequency.value = CHORD[CHORD.length - 1]! * 2
  const shimmerGain = ctx.createGain()
  shimmerGain.gain.setValueAtTime(0.0001, t)
  shimmerGain.gain.exponentialRampToValueAtTime(0.02, t + 0.9)
  shimmerGain.gain.exponentialRampToValueAtTime(0.0001, t + 3.2)
  shimmer.connect(shimmerGain)
  shimmerGain.connect(reverb)
  shimmer.start(t)
  shimmer.stop(t + 3.4)
}

/* --------------------------------------------------------------------- tap */

/**
 * The press tick.
 *
 * Deliberately dry — routed past the reverb entirely. A tail on a sound that
 * fires on every press in the app smears into the next one and turns a
 * responsive interface into a wash. Short, soft, and gone.
 */
export function playTap(): void {
  const a = audio()
  if (!a) return
  const { ctx, master } = a
  const t = ctx.currentTime

  const osc = ctx.createOscillator()
  osc.type = 'triangle'
  osc.frequency.setValueAtTime(1180, t)
  // A small downward slide reads as a physical click rather than a beep.
  osc.frequency.exponentialRampToValueAtTime(760, t + 0.05)

  // Rolls off the triangle's upper harmonics, which are what make a bare
  // oscillator tick sound cheap.
  const tone = ctx.createBiquadFilter()
  tone.type = 'lowpass'
  tone.frequency.value = 2600

  const gain = ctx.createGain()
  gain.gain.setValueAtTime(0.0001, t)
  gain.gain.exponentialRampToValueAtTime(0.055, t + 0.006)
  gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.075)

  osc.connect(tone)
  tone.connect(gain)
  gain.connect(master)
  osc.start(t)
  osc.stop(t + 0.09)
}
