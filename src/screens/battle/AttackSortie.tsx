import { memo, useEffect, useMemo } from 'react'
import { motion, type TargetAndTransition, type Transition } from 'framer-motion'
import { PressableCard } from '@/components/card/PressableCard'
import { requireCard } from '@/data/cards'
import type { PlayerId } from '@/engine/types'
import type { EnergyType } from '@/game/types'
import { Head, elementTheme, type ElementTheme } from './AttackFx'

/**
 * The sortie: the attacking card's own flight, before the blow.
 *
 * Choosing an attack used to resolve it on the spot — the card never left its
 * slot, and the whole strike was something that happened *from* the card
 * rather than something the card did. This is the missing beat before that.
 * The Figure lifts clear of the mat, its element materialising around it,
 * carries itself across the arena left to right for the board to see, then
 * drops back into its slot — and the blow lands on that landing.
 *
 * Nothing here touches the engine. The attack is dispatched by `onDone`, so
 * the board is untouched for the whole flight: no damage, no knockout, no
 * turn hand-off until the card is home. That is what lets the drop read as
 * the thing that *causes* the strike rather than a flourish played over one
 * already resolved.
 */

export interface AttackSortieTrigger {
  /** Bumped per sortie, so the same card attacking twice replays it. */
  id: number
  cardId: string
  type: EnergyType
  /** Whose card is flying — which is what decides the way it lifts: yours
   *  rises off the bottom half, theirs descends from the top. */
  side: PlayerId
  /** The slot to lift out of and drop back into, as it sat at launch. */
  slotRect: DOMRect
}

/** Held still at the start, so the card viewer that was just dismissed is
 *  gone before the card underneath it moves — otherwise the same card is
 *  briefly on screen twice, once full size in the fading viewer and once
 *  lifting off the mat. */
const HOLD_S = 0.18

const LIFT_S = 0.3
const DRIFT_S = 0.26
const SWEEP_S = 0.46
const DROP_S = 0.36
const FLIGHT_S = LIFT_S + DRIFT_S + SWEEP_S + DROP_S

/** How much larger the card rides than it sits — enough to read as lifted
 *  toward the viewer, well short of the expanded viewer's own full size,
 *  which this is deliberately not. */
const SHOW_SCALE = 1.32

/** The furthest the card will travel to either side, before the viewport's
 *  own edges are allowed to cut it shorter. */
const MAX_REACH = 112

/** Radius the element's sigils orbit at, as a multiple of the flying card's
 *  own half-width — outside its edges at the scale it flies at. */
const ORBIT = 1.5

/**
 * The least the card will rise, as a multiple of its own height.
 *
 * The flight aims for the middle of the screen, where the mat draws its clash
 * ring — but "the middle of the screen" is not a distance, and both Actives
 * now sit close to it (they were each moved to line up with the deck and the
 * points chip). Measured on a 390×844 viewport your card had only 79px to
 * travel, and since it grows by a third on the way up, most of that read as
 * the card getting bigger rather than leaving the mat; on a shorter viewport
 * the gap closes further and the lift disappears entirely. So the target is a
 * floor, not a destination: the card always clears its slot by most of its own
 * height, and only flies further when the arena is actually further away.
 */
const MIN_LIFT = 0.85

/* Every repeating animation below is a module constant rather than an inline
 * literal. The board re-renders on every tick of the match clock, which lands
 * at least once inside a flight this long, and framer restarts an animation
 * whose target it sees change — so a fresh object each render would jolt the
 * card mid-air. The same reasoning is why the flight itself is memoised and
 * why the three layers around the card are `memo`ised: their props are all
 * stable for the life of one sortie. */
const BOB = { y: [0, -5, 0], rotate: [-1.5, 1.5, -1.5] }
const BOB_T: Transition = { duration: 1.6, repeat: Infinity, ease: 'easeInOut' }
const SPIN = { rotate: 360 }
const COUNTER_SPIN = { rotate: -360 }
const SPIN_T: Transition = { duration: 3.4, repeat: Infinity, ease: 'linear' }
const HIDDEN = { opacity: 0 }
const NO_SIZE = { width: 0, height: 0 }

/** The shared fade every layer around the card rides — framer's own target
 *  type, narrowed to the two fields this file actually sets, so one object
 *  can be handed straight to `animate`. */
type Glow = TargetAndTransition & { opacity: number[]; transition: Transition }

export function AttackSortie({
  trigger,
  onDone,
}: {
  trigger: AttackSortieTrigger | null
  /** Fires once the card is back in its slot. The attack goes here. */
  onDone: () => void
}) {
  const id = trigger?.id

  useEffect(() => {
    if (id === undefined) return
    const timer = setTimeout(onDone, (HOLD_S + FLIGHT_S) * 1000)
    return () => clearTimeout(timer)
    // `onDone` is rebuilt every render by the caller; keying on the sortie
    // itself is what keeps this from restarting the flight mid-air.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id])

  const flight = useMemo(() => {
    if (!trigger) return null
    const { slotRect } = trigger

    const centreX = slotRect.left + slotRect.width / 2
    const centreY = slotRect.top + slotRect.height / 2
    const flownHalfWidth = (slotRect.width * SHOW_SCALE) / 2

    // Toward the middle of the screen, where the mat draws its own halfway
    // line and clash ring — but never less than MIN_LIFT, and always away
    // from the flyer's own edge of the board rather than in whichever
    // direction the arena happens to lie. Taking the direction from the side
    // rather than from the sign of the distance is what keeps a card whose
    // slot already sits on the halfway line from lifting the wrong way.
    const away = trigger.side === 'you' ? -1 : 1
    const toArena = Math.abs(window.innerHeight / 2 - centreY)
    const rise = away * Math.max(slotRect.height * MIN_LIFT, toArena)

    // Whichever side has less room decides the reach, so the pass stays
    // symmetric and the card never leaves the screen on a narrow one.
    const room = Math.min(centreX, window.innerWidth - centreX) - flownHalfWidth - 12
    const reach = Math.max(0, Math.min(MAX_REACH, room))

    const transition: Transition = {
      duration: FLIGHT_S,
      delay: HOLD_S,
      times: [
        0,
        LIFT_S / FLIGHT_S,
        (LIFT_S + DRIFT_S) / FLIGHT_S,
        (LIFT_S + DRIFT_S + SWEEP_S) / FLIGHT_S,
        1,
      ],
      // One easing per leg: off the mat, into the pass, across, then down —
      // the last of them `easeIn` so the card falls into its slot rather than
      // settling onto it.
      ease: ['easeOut', 'easeInOut', 'easeInOut', 'easeIn'],
    }

    return {
      halfWidth: flownHalfWidth,
      card: {
        x: [0, 0, -reach, reach, 0],
        y: [0, rise, rise, rise, 0],
        scale: [1, SHOW_SCALE, SHOW_SCALE, SHOW_SCALE, 1],
        // Banks into each leg of the pass and comes level for the drop, so
        // the travel reads as carried rather than slid.
        rotate: [0, 0, -6, 6, 0],
        // Cast beneath the card and deepening as it climbs. Height off a
        // surface is read from its shadow before anything else, and this is
        // what separates a card that has risen off the mat from one that has
        // merely been scaled up in place.
        filter: [
          'drop-shadow(0 0px 0px rgba(0,0,0,0))',
          'drop-shadow(0 14px 18px rgba(0,0,0,.62))',
          'drop-shadow(0 14px 18px rgba(0,0,0,.62))',
          'drop-shadow(0 14px 18px rgba(0,0,0,.62))',
          'drop-shadow(0 0px 0px rgba(0,0,0,0))',
        ],
        transition,
      },
      // Lit for the flight and gone by the landing — every layer around the
      // card rides the same five stops as the path, so nothing outlives it.
      glow: { opacity: [0, 1, 1, 1, 0], transition } satisfies Glow,
    }
    // The trigger is replaced wholesale per sortie, so its id identifies it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id])

  if (!trigger || !flight) return null

  const theme = elementTheme(trigger.type)

  return (
    <div className="cov-attack-sortie fixed inset-0 z-40 pointer-events-none" aria-hidden="true">
      <motion.div
        style={{
          position: 'absolute',
          left: trigger.slotRect.left,
          top: trigger.slotRect.top,
          width: trigger.slotRect.width,
          aspectRatio: '63 / 88',
        }}
        initial={{ x: 0, y: 0, scale: 1, rotate: 0 }}
        animate={flight.card}
      >
        {/* The float itself, kept off the path above: a slow bob and sway on
            its own clock, so the card is never perfectly still even at the
            ends of the pass where the path momentarily is. */}
        <motion.div className="relative w-full h-full" animate={BOB} transition={BOB_T}>
          <Halo theme={theme} glow={flight.glow} />

          <div className="relative" style={{ borderRadius: '4.5% / 3.22%' }}>
            <PressableCard card={requireCard(trigger.cardId)} compact noHolo inPlay noPeek />
          </div>

          <Sigils theme={theme} radius={flight.halfWidth * ORBIT} glow={flight.glow} />
          <Embers theme={theme} spread={flight.halfWidth} glow={flight.glow} />
        </motion.div>
      </motion.div>
    </div>
  )
}

/** The element burning behind the card — a soft ground for the sigils to
 *  orbit in front of, and the only layer that tints the mat underneath. */
const Halo = memo(function Halo({ theme, glow }: { theme: ElementTheme; glow: Glow }) {
  const animate = useMemo(
    // Well under half: this sits behind a card that has to stay the readable
    // thing on screen, not behind a light show.
    () => ({ ...glow, opacity: glow.opacity.map((o) => o * 0.45) }),
    [glow],
  )

  return (
    <motion.span
      className="absolute pointer-events-none"
      style={{
        left: '-60%',
        top: '-45%',
        width: '220%',
        height: '190%',
        borderRadius: '50%',
        background: `radial-gradient(circle, ${theme.glow} 0%, transparent 62%)`,
        mixBlendMode: 'screen',
      }}
      initial={HIDDEN}
      animate={animate}
    />
  )
})

/** Three of the element's own projectile heads, orbiting the card. The
 *  wrapper turns; each sigil counter-turns by the same amount, so they ride
 *  the ring upright instead of tumbling around it. */
const Sigils = memo(function Sigils({
  theme,
  radius,
  glow,
}: {
  theme: ElementTheme
  radius: number
  glow: Glow
}) {
  return (
    <motion.span className="absolute left-1/2 top-1/2" style={NO_SIZE} initial={HIDDEN} animate={glow}>
      <motion.span className="absolute" style={NO_SIZE} animate={SPIN} transition={SPIN_T}>
        {[0, 1, 2].map((i) => {
          const angle = (i / 3) * Math.PI * 2
          return (
            <motion.span
              key={i}
              className="absolute"
              style={{ ...NO_SIZE, left: Math.cos(angle) * radius, top: Math.sin(angle) * radius }}
              animate={COUNTER_SPIN}
              transition={SPIN_T}
            >
              <Head theme={theme} scale={0.62} angle={0} />
            </motion.span>
          )
        })}
      </motion.span>
    </motion.span>
  )
})

/** What the card sheds while it flies — the element's own core colour,
 *  drifting off and dying, so the flight leaves something behind it rather
 *  than carrying a sealed glow across the screen. */
const Embers = memo(function Embers({
  theme,
  spread,
  glow,
}: {
  theme: ElementTheme
  spread: number
  glow: Glow
}) {
  const count = 9

  return (
    <motion.span className="absolute left-1/2 top-1/2" style={NO_SIZE} initial={HIDDEN} animate={glow}>
      {Array.from({ length: count }, (_, i) => {
        // Fixed rather than random: the same nine embers on every sortie are
        // indistinguishable from nine fresh ones, and a real roll would
        // reshuffle them on each re-render mid-flight.
        const t = (i + 1) / (count + 1)
        const size = 3 + (i % 3)

        return (
          <motion.span
            key={i}
            className="absolute"
            style={{
              left: (t * 2 - 1) * spread,
              top: 0,
              width: size,
              height: size,
              borderRadius: '50%',
              background: theme.core,
              boxShadow: `0 0 6px 1px ${theme.glow}`,
            }}
            animate={{
              y: [0, 26 + (i % 4) * 9],
              x: [0, (i % 2 === 0 ? 1 : -1) * (6 + (i % 3) * 5)],
              opacity: [0, 0.9, 0],
              scale: [0.5, 1, 0.3],
            }}
            transition={{
              duration: 1 + (i % 3) * 0.22,
              repeat: Infinity,
              delay: t * 0.9,
              ease: 'easeOut',
            }}
          />
        )
      })}
    </motion.span>
  )
})
