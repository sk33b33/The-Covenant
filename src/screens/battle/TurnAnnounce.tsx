import { useEffect } from 'react'
import { motion } from 'framer-motion'

/**
 * The turn hand-off card.
 *
 * Sweeps across the middle of the mat every time the turn changes hands, so
 * a player never has to infer whose move it is from the small label in the
 * turn banner — especially now that the opponent takes its turn one paced
 * action at a time and there is real time to lose track in.
 *
 * Built from the same materials as everything else on this screen rather
 * than as a generic toast: the display face the logo and headings use, the
 * gold-leaf gradient the frames and orbs are struck from, and a pair of
 * filigree rules that draw outward from the centre the way the mat's own
 * ring does. Yours arrives in full gold leaf; the opponent's is the same
 * plate in cold ash, so the two are distinguishable at a glance even before
 * the words are read.
 */

/** Total lifetime, including both sweeps. The hold in the middle is what's
 *  left after the in and out animations below take their share. */
export const TURN_ANNOUNCE_S = 1.75

export interface TurnCue {
  /** Unique per announcement, so repeats of the same side still replay. */
  key: string
  mine: boolean
}

export function TurnAnnounce({ cue, onDone }: { cue: TurnCue | null; onDone: () => void }) {
  useEffect(() => {
    if (!cue) return
    const timer = setTimeout(onDone, TURN_ANNOUNCE_S * 1000)
    return () => clearTimeout(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cue?.key])

  if (!cue) return null

  const { mine } = cue
  const label = mine ? 'Your Turn' : "Opponent's Turn"
  // The opponent's plate is the same gold leaf drained of its warmth rather
  // than a different colour altogether — the mat has one metal on it, and a
  // second hue here would read as a different game's UI.
  const plate = mine
    ? 'var(--gold-leaf)'
    : 'linear-gradient(155deg, #cdc4b4 0%, #9d968a 22%, #6f6a61 46%, #b9b1a4 60%, #5d584f 80%, #a8a196 100%)'
  const rule = mine ? 'var(--gold-bright)' : 'rgba(200,194,182,.75)'
  const wash = mine ? 'rgba(229,192,140,.16)' : 'rgba(190,186,178,.12)'

  return (
    <div
      className="fixed inset-0 z-[55] grid place-items-center pointer-events-none"
      // Announced politely rather than assertively: it repeats every turn,
      // and a screen reader interrupting itself twice a minute to say the
      // same two phrases is worse than saying them a beat late.
      role="status"
      aria-live="polite"
    >
      <motion.div
        key={cue.key}
        className="relative w-full flex flex-col items-center gap-1.5"
        initial={{ opacity: 0 }}
        animate={{ opacity: [0, 1, 1, 0] }}
        transition={{ duration: TURN_ANNOUNCE_S, times: [0, 0.14, 0.72, 1], ease: 'easeOut' }}
      >
        {/* The band behind the words: darkest at the centre and gone by the
            screen edges, so it sits the text over the mat without drawing a
            hard-edged bar across the board. */}
        <motion.div
          className="absolute inset-x-0"
          style={{
            height: 76,
            background: `linear-gradient(90deg, transparent, rgba(10,7,3,.82) 22%, rgba(10,7,3,.9) 50%, rgba(10,7,3,.82) 78%, transparent)`,
          }}
          initial={{ scaleX: 0.2, opacity: 0 }}
          animate={{ scaleX: [0.2, 1, 1, 1.06], opacity: [0, 1, 1, 0] }}
          transition={{ duration: TURN_ANNOUNCE_S, times: [0, 0.16, 0.72, 1], ease: [0.22, 1, 0.36, 1] }}
        />

        {/* A wash of the side's own colour under the words, so "yours" reads
            warm and "theirs" cold before either is spelled out. */}
        <motion.div
          className="absolute inset-x-0"
          style={{
            height: 76,
            background: `radial-gradient(ellipse 40% 100% at 50% 50%, ${wash}, transparent 70%)`,
          }}
          initial={{ opacity: 0 }}
          animate={{ opacity: [0, 1, 1, 0] }}
          transition={{ duration: TURN_ANNOUNCE_S, times: [0, 0.2, 0.72, 1] }}
        />

        <Rule color={rule} />

        <motion.span
          className="relative font-display uppercase text-center"
          style={{
            fontSize: 26,
            letterSpacing: '0.22em',
            // The same trick the logo uses: paint the leaf, then clip it to
            // the letterforms, so the text is struck from the metal rather
            // than merely coloured to look like it.
            background: plate,
            WebkitBackgroundClip: 'text',
            backgroundClip: 'text',
            color: 'transparent',
            // Text-shadow can't cross a background-clip, so the lift under
            // the letters is a drop-shadow filter instead.
            filter: `drop-shadow(0 2px 3px rgba(0,0,0,.85)) drop-shadow(0 0 12px ${mine ? 'rgba(229,192,140,.4)' : 'rgba(0,0,0,.5)'})`,
            paddingInline: '0.22em',
          }}
          initial={{ y: 10, scale: 0.94 }}
          animate={{ y: 0, scale: 1 }}
          transition={{ duration: 0.42, ease: [0.22, 1, 0.36, 1] }}
        >
          {label}
        </motion.span>

        <Rule color={rule} />

        {/* A single glint travelling across the plate, the same light the
            card rims catch. It is what keeps the metal from reading as a
            flat fill for the second it is on screen. */}
        <motion.div
          className="absolute"
          style={{
            top: 12,
            height: 52,
            width: 90,
            background: 'linear-gradient(105deg, transparent, rgba(255,248,228,.5), transparent)',
            filter: 'blur(6px)',
          }}
          initial={{ x: -220, opacity: 0 }}
          animate={{ x: 220, opacity: [0, 0.9, 0] }}
          transition={{ duration: 0.85, delay: 0.22, ease: 'easeInOut' }}
        />
      </motion.div>
    </div>
  )
}

/** One filigree rule, drawn outward from the centre. */
function Rule({ color }: { color: string }) {
  return (
    <motion.div
      className="relative"
      style={{
        height: 1,
        width: '62%',
        maxWidth: 300,
        background: `linear-gradient(90deg, transparent, ${color} 30%, ${color} 70%, transparent)`,
      }}
      initial={{ scaleX: 0 }}
      animate={{ scaleX: 1 }}
      transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
    />
  )
}
