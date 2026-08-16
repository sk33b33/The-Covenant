import { useEffect, useRef, useState } from 'react'
import { motion, useReducedMotion } from 'framer-motion'
import { asset } from '@/lib/asset'
import { CHIME_S, playChime, preloadChime } from '@/lib/chime'
import { STARTER_CARD_IDS } from '@/data/starter'
import { useCollection } from '@/store/collection'
import { useDecks } from '@/store/decks'
import { useProfile } from '@/store/profile'
import { useNav } from '@/store/nav'

/**
 * Tap to enter.
 *
 * The key art already carries the Covenant wordmark, so this screen adds no
 * lettering of its own beyond the prompt — a second title over a painted one
 * reads as a mistake. The art is the entire screen; the interface is one line
 * of text and a tap target the size of the display.
 *
 * The tap is the only way in — there is no path that skips this screen — and it
 * carries the entry sound. Nothing about entering depends on the sound
 * arriving: the route change runs on its own timer, so a blocked or missing
 * clip costs you the music and nothing else.
 *
 * Rendered as an overlay by App rather than as a routed screen, so its exit
 * plays over the top of the interface: the black lifts to reveal a game that
 * was already there, instead of cutting to it.
 */

/*
 * The opening runs the length of the clip.
 *
 *   0.00s          tap — the sound starts, the prompt goes
 *   0.00 → 3.60s   the artwork darkens to black
 *   3.60 → 4.20s   holds there
 *   3.88 → 5.98s   the sound fades to silence
 *   4.20 → 5.60s   the black lifts, revealing the game
 *
 * The sound begins resolving exactly as the screen reaches black and its last
 * breath carries over the revealed interface — which is why it is owned by
 * lib/chime rather than by this component, whose unmount it has to outlive.
 */

/** How far the sound outlasts the picture, so its tail resolves over the game. */
const TAIL_S = 0.38

/** Everything below is a share of this, so re-trimming the clip retimes it all. */
const VISUAL_S = CHIME_S - TAIL_S

const DARKEN_S = VISUAL_S * 0.64
const HOLD_S = VISUAL_S * 0.11
const LIFT_S = VISUAL_S * 0.25

/** Bright gold over darkening art reads as a bug, so it goes early. */
const PROMPT_OUT_S = 0.45

export function Enter() {
  const isNew = useProfile((s) => s.isNew)
  const markSeen = useProfile((s) => s.markSeen)
  const setTab = useNav((s) => s.setTab)
  const addCards = useCollection((s) => s.add)
  const ensureStarter = useDecks((s) => s.ensureStarter)

  const [leaving, setLeaving] = useState(false)
  const timer = useRef<number | null>(null)

  const reduce = useReducedMotion()
  const darken = reduce ? 0.2 : DARKEN_S
  const hold = reduce ? 0 : HOLD_S
  const lift = reduce ? 0.25 : LIFT_S

  // Fetched now so the file is ready at the tap rather than starting to
  // download at the moment it is meant to be heard.
  useEffect(() => {
    preloadChime()
    return () => {
      if (timer.current !== null) window.clearTimeout(timer.current)
    }
  }, [])

  const enter = () => {
    if (leaving) return
    setLeaving(true)
    playChime()

    // First entry hands over a playable deck. Landing on an empty binder, an
    // empty deck list and an unusable Battle tab is three dead ends before the
    // game has said anything.
    //
    // Done on the tap rather than with the route change below: deferring it
    // would mean closing the app mid-fade leaves `isNew` true, and the starter
    // deck gets handed out a second time.
    if (isNew) {
      addCards(STARTER_CARD_IDS)
      ensureStarter()
    }
    markSeen()

    // Changing the route is what removes this overlay, so it waits until the
    // screen has gone black and held there. Staging the exit itself — one
    // animation with per-child delays — would do the same thing while relying
    // on how framer propagates `exit` down a tree.
    timer.current = window.setTimeout(
      () => setTab('home'),
      (darken + hold) * 1000,
    )
  }

  return (
    <motion.button
      onClick={enter}
      className="fixed inset-0 z-40 w-full h-full overflow-hidden bg-[#0d0a06] cursor-pointer"
      aria-label="Tap to enter The Covenant"
      // Still a live target while it fades, on purpose. Making it inert would
      // let taps fall through to the hub behind it, and a player would be
      // opening packs they cannot see.
      aria-disabled={leaving || undefined}
      initial={{ opacity: 1 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: lift, ease: [0.4, 0, 0.2, 1] }}
    >
      {/* A very slow push-in so the screen breathes without drawing attention. */}
      <motion.img
        src={asset('art/key/cover.webp')}
        alt="The Covenant"
        className="absolute inset-0 w-full h-full object-cover"
        style={{ objectPosition: '50% 38%' }}
        initial={{ scale: 1.02, opacity: 0 }}
        animate={{ scale: 1.09, opacity: 1 }}
        transition={{
          opacity: { duration: 1.2, ease: 'easeOut' },
          scale: { duration: 26, ease: 'linear', repeat: Infinity, repeatType: 'reverse' },
        }}
      />

      {/* Only enough scrim at the foot to hold the prompt legible. */}
      <div
        className="absolute inset-x-0 bottom-0 h-[34%] pointer-events-none"
        style={{
          background:
            'linear-gradient(to top, rgba(8,6,3,.94) 0%, rgba(8,6,3,.6) 45%, transparent 100%)',
        }}
      />

      <div className="relative h-full flex flex-col items-center justify-end pb-16 px-8">
        <motion.div
          className="flex flex-col items-center gap-4"
          initial={{ opacity: 0, y: 14 }}
          animate={leaving ? { opacity: 0, y: 0 } : { opacity: 1, y: 0 }}
          transition={
            leaving
              ? { duration: PROMPT_OUT_S, ease: 'easeOut' }
              : { delay: 0.9, duration: 0.9, ease: [0.22, 1, 0.36, 1] }
          }
        >
          <span
            className="h-px w-24"
            style={{
              background: 'linear-gradient(to right, transparent, #d9b478, transparent)',
            }}
          />

          {/* Breathing, not blinking — a blink reads as a warning. */}
          <motion.span
            className="font-display text-sm tracking-[0.34em] pl-[0.34em]"
            style={{ color: '#f0dcbc', textShadow: '0 2px 12px rgba(0,0,0,.8)' }}
            animate={leaving ? { opacity: 0 } : { opacity: [0.42, 1, 0.42] }}
            transition={
              leaving
                ? { duration: PROMPT_OUT_S }
                : { duration: 2.8, repeat: Infinity, ease: 'easeInOut' }
            }
          >
            TAP TO ENTER
          </motion.span>
        </motion.div>
      </div>

      {/*
        The black itself, over everything else on the screen so the art, the
        scrim and the prompt all go under it together.

        This is what makes the transition a fade to black rather than a
        dissolve: the overlay only starts fading out once this is opaque, so
        there is a moment where the screen is nothing but black, and the game
        is revealed from it rather than showing through the artwork.
      */}
      <motion.div
        className="absolute inset-0 pointer-events-none"
        style={{ background: '#000' }}
        data-testid="enter-veil"
        initial={{ opacity: 0 }}
        animate={{ opacity: leaving ? 1 : 0 }}
        transition={{ duration: darken, ease: [0.37, 0, 0.63, 1] }}
      />
    </motion.button>
  )
}
