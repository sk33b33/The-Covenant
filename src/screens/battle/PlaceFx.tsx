import { useEffect, useMemo } from 'react'
import { motion } from 'framer-motion'
import { CardBack } from '@/art/CardBack'
import { PressableCard } from '@/components/card/PressableCard'
import { requireCard } from '@/data/cards'

/**
 * The placement: a hand card's own trip into the slot it was just dropped on.
 *
 * A drop is a gesture the player is already mid-way through when it fires —
 * the card has been following a finger since `onDragStart` — so, like the
 * attack sortie, the real placement is held back rather than applied
 * underneath an animation already telling its own story. The card leaves
 * wherever the finger let go of it, rises and grows toward the true centre
 * of the screen, turning face-up as it goes — a beat of spectacle the sortie
 * itself is built from, even though (unlike a drawn card) nothing about a
 * hand card's own face was actually hidden a moment ago. It holds there
 * briefly, then falls straight down into the slot it was bound for.
 *
 * The moment it lands is the moment the placement actually happens: `onLand`
 * fires right there, which is what the screen dispatches PLAY_FIGURE and
 * ASCEND from (or commits a setup pick), so the real Figure appears — or, for
 * an ASCEND, ascends — in the slot exactly as the card that caused it
 * finishes falling. The same "the drop causes the arrival" ordering the
 * sortie's own `onDone` is built on; an ASCEND's target just already has a
 * Figure standing on it, which keeps its old face right up until the new one
 * lands. The card itself doesn't vanish outright on contact: it settles with
 * a small squash-and-rebound, like something with real weight meeting the
 * mat, while a burst of white-gold light shoots out from underneath it — and
 * only once that settles does the card fade the rest of the way out, handing
 * off to the Figure now actually standing in its place.
 *
 * The Active slot gets the bigger version of this: it's the one spot on the
 * board every attack and every turn actually revolves around, so a card
 * landing there earns a taller, larger peak and a second full turn in the
 * air — flip, reveal, flip away, reveal again — before it holds and falls,
 * where a Bench arrival gets the single turn described above.
 */

export interface PlaceFxTrigger {
  id: number
  cardId: string
  /** Wherever the card was when the finger let go of it — not necessarily
   *  its resting spot in the fan, since a drag can end mid-gesture. */
  fromRect: DOMRect
  /** The slot it's bound for — the Active slot or a Bench slot, always your
   *  own; nothing else in this game hands a card off through a drag. */
  toRect: DOMRect
  /** Whether `toRect` is the Active slot rather than a Bench one — the one
   *  drop that gets the taller peak and the double flip. */
  isActive: boolean
}

/** How long the card holds at the centre of the screen, turned face-up,
 *  before falling — brief on purpose: nothing here is being read for the
 *  first time the way a drawn card is, this is a beat of drama rather than
 *  information. Fixed, unlike the rise and drop below: nothing about a hold
 *  in place scales with distance. */
const HOLD_S = 0.18
/** The settle: a squash-and-rebound on contact, then the fade that hands
 *  off to the real Figure the landing just placed. Also fixed — a contact
 *  effect, not a trip. */
const IMPACT_S = 0.35

const RISE_MIN_S = 0.3
const RISE_MAX_S = 0.5
/** The drop got its own, slower speed and its own, wider bounds: pacing it
 *  off the same 1500px/s the rise uses still read as rushed for the Bench,
 *  which travels much farther from the held centre position than the
 *  Active slot does — a card that size covering that much ground in well
 *  under half a second reads as thrown, not set down. Slower and given more
 *  room to clamp into is what makes a long Bench drop feel like the same
 *  weight of card taking its time, rather than the short Active drop just
 *  padded out. */
const RISE_PX_PER_S = 1500
const DROP_PX_PER_S = 950
const DROP_MIN_S = 0.34
const DROP_MAX_S = 0.68

/** How much larger the card gets at the centre of the screen — matched to
 *  the draw reveal's own peak, so the two "hero" flourishes this game has
 *  read as the same scale of moment. The Active slot gets a bigger, higher
 *  peak still: it's the one arrival every attack and turn actually revolves
 *  around, so it earns the more prominent version of this beat. */
const PEAK_SCALE = 1.7
const ACTIVE_PEAK_SCALE = 2.1
/** How far above true screen centre the Active peak holds, as a fraction of
 *  screen height — enough to read as its own deliberately higher position
 *  rather than the same centre point just enlarged. */
const ACTIVE_PEAK_LIFT = 0.1

/** The Active drop's extra turn in the air: a second full flip cycle (away,
 *  then back to face-up) tacked onto the end of the first, so the card
 *  reveals itself, turns away again, and reveals itself a second time
 *  before it ever holds still. Bench keeps just the one flip. */
const ACTIVE_FLIP_EXTRA_S = 0.4

const SHADOW = '0 10px 20px rgba(0,0,0,.55)'
/** The burst's own colours — white at the core fading to a warm yellow at
 *  the tip of each ray, rather than the game's usual gold leaf: this is
 *  meant to read as light itself breaking through, not another gilded
 *  surface like the frames and orbs already are. */
const WHITE = '#ffffff'
const YELLOW = '#ffe066'

/**
 * Every timing and position this flight needs, derived once from the two
 * rects a trigger carries — shared between the component that schedules
 * `onLand`/`onDone` and the two that actually animate, so neither can drift
 * out of sync with the other's idea of how long the trip takes.
 */
function computeTimings(fromRect: DOMRect, toRect: DOMRect, isActive: boolean) {
  const fromCX = fromRect.left + fromRect.width / 2
  const fromCY = fromRect.top + fromRect.height / 2
  const toCX = toRect.left + toRect.width / 2
  const toCY = toRect.top + toRect.height / 2
  const peakX = window.innerWidth / 2
  const peakY = window.innerHeight / 2 - (isActive ? window.innerHeight * ACTIVE_PEAK_LIFT : 0)
  const peakScale = isActive ? ACTIVE_PEAK_SCALE : PEAK_SCALE
  const flipExtraS = isActive ? ACTIVE_FLIP_EXTRA_S : 0

  const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v))
  const riseDist = Math.hypot(peakX - fromCX, peakY - fromCY)
  const dropDist = Math.hypot(toCX - peakX, toCY - peakY)
  const RISE_S = clamp(riseDist / RISE_PX_PER_S, RISE_MIN_S, RISE_MAX_S)
  const DROP_S = clamp(dropDist / DROP_PX_PER_S, DROP_MIN_S, DROP_MAX_S)
  const TO_LAND_S = RISE_S + flipExtraS + HOLD_S + DROP_S
  const TOTAL_S = TO_LAND_S + IMPACT_S

  return { fromCX, fromCY, toCX, toCY, peakX, peakY, peakScale, flipExtraS, RISE_S, DROP_S, TO_LAND_S, TOTAL_S }
}

export function PlaceFx({
  trigger,
  onLand,
  onDone,
}: {
  trigger: PlaceFxTrigger | null
  /** Fires the instant the card reaches the slot — dispatch the real
   *  placement here, so the Figure appears exactly as the card that became
   *  it finishes falling. */
  onLand: () => void
  /** Fires once the settle and the fade are both done and the overlay has
   *  nothing left to show. */
  onDone: () => void
}) {
  const id = trigger?.id

  useEffect(() => {
    if (id === undefined || !trigger) return
    const { TO_LAND_S, TOTAL_S } = computeTimings(trigger.fromRect, trigger.toRect, trigger.isActive)
    const landTimer = setTimeout(onLand, TO_LAND_S * 1000)
    const doneTimer = setTimeout(onDone, TOTAL_S * 1000)
    return () => {
      clearTimeout(landTimer)
      clearTimeout(doneTimer)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id])

  if (!trigger) return null

  return (
    <div className="cov-place-fx fixed inset-0 z-40 pointer-events-none" aria-hidden="true">
      {/* Painted first, so it sits *behind* the card in the same stacking
          context — light breaking out from underneath it, not laid over
          the top of it. */}
      <LightBurst trigger={trigger} />
      <PlaceCard trigger={trigger} />
    </div>
  )
}

function PlaceCard({ trigger }: { trigger: PlaceFxTrigger }) {
  const { cardId, fromRect, toRect, isActive } = trigger

  const path = useMemo(() => {
    const { fromCX, fromCY, toCX, toCY, peakX, peakY, peakScale, flipExtraS, RISE_S, TO_LAND_S, TOTAL_S } =
      computeTimings(fromRect, toRect, isActive)
    const endScale = toRect.width / fromRect.width

    const at = (cx: number, cy: number, scale: number) => ({ x: cx - fromCX, y: cy - fromCY, scale })
    const start = at(fromCX, fromCY, 1)
    const peak = at(peakX, peakY, peakScale)
    const end = at(toCX, toCY, endScale)

    const t1 = RISE_S / TOTAL_S
    // The hold stretches to cover the Active drop's extra flip cycle too —
    // the card's position and scale are already flat across it either way,
    // so this is the only change a longer flip needs here.
    const t2 = (RISE_S + flipExtraS + HOLD_S) / TOTAL_S
    const t3 = TO_LAND_S / TOTAL_S
    // The rebound plays out entirely inside the impact tail, well short of
    // `1` — everything after it is the fade alone.
    const bounce1 = (TO_LAND_S + IMPACT_S * 0.3) / TOTAL_S
    const bounce2 = (TO_LAND_S + IMPACT_S * 0.6) / TOTAL_S

    // The Active slot's own double turn: past the first reveal at `t1`, it
    // turns away again and reveals a second time, ending on `t1f` rather
    // than holding flat straight through — Bench keeps the single turn.
    const t1f = (RISE_S + flipExtraS) / TOTAL_S
    const t1mid = (t1 + t1f) / 2
    const flip = isActive
      ? {
          rotateY: [0, 180, 360, 540, 540],
          transition: {
            duration: TOTAL_S,
            times: [0, t1, t1mid, t1f, 1],
            ease: ['easeInOut', 'easeInOut', 'easeInOut', 'linear'],
          },
        }
      : {
          // Turns face-up on the way to the centre, not on the way down —
          // by the time it holds there the reveal is already done. Eased
          // both ways for the same reason the rise above is: it leaves one
          // standstill (flat at 0°) and arrives at another (flat at 180°,
          // held through the hold that follows).
          rotateY: [0, 180, 180],
          transition: { duration: TOTAL_S, times: [0, t1, 1], ease: ['easeInOut', 'linear'] as const },
        }

    return {
      card: {
        x: [start.x, peak.x, peak.x, end.x, end.x - 4, end.x + 4, end.x],
        y: [start.y, peak.y, peak.y, end.y, end.y + 3, end.y - 2, end.y],
        scale: [1, peakScale, peakScale, endScale, endScale * 0.86, endScale * 1.08, endScale],
        opacity: [1, 1, 1, 1, 1, 1, 0],
        transition: {
          // One ease per segment rather than one for the whole path — a
          // single 'easeOut' across every stop front-loads speed at the
          // start of *each* segment, which reads as a jolt everywhere a
          // segment boundary sits on a standstill: the rise leaving a card
          // at rest, and the drop leaving the held card at rest again.
          // 'easeInOut' either side of those two standstills is what
          // actually reads as one continuous motion rather than several
          // separate ones stitched together. The rebound keeps its own
          // snap — a real landing doesn't ease into the ground.
          default: {
            duration: TOTAL_S,
            times: [0, t1, t2, t3, bounce1, bounce2, 1],
            ease: ['easeInOut', 'linear', 'easeInOut', 'easeOut', 'easeInOut', 'easeOut'],
          },
          // Its own curve: opaque all the way through the rebound, fading
          // only in the sliver left after it settles — the same reasoning
          // the draw reveal's own late fade is built on.
          opacity: { duration: TOTAL_S, ease: 'easeIn', times: [0, t3, bounce2, 1] },
        },
      },
      flip,
    }
    // Recomputed only if the trip itself changes — the rects are measured
    // once, at the moment the card was dropped.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fromRect, toRect, isActive])

  return (
    <motion.div
      style={{
        position: 'absolute',
        left: fromRect.left,
        top: fromRect.top,
        width: fromRect.width,
        aspectRatio: '63 / 88',
        filter: `drop-shadow(${SHADOW})`,
      }}
      initial={{ x: 0, y: 0, scale: 1, opacity: 1 }}
      animate={path.card}
    >
      <motion.div
        className="absolute inset-0"
        style={{ transformStyle: 'preserve-3d', borderRadius: '4.5% / 3.22%' }}
        initial={{ rotateY: 0 }}
        animate={path.flip}
      >
        <div className="absolute inset-0 overflow-hidden" style={{ backfaceVisibility: 'hidden', borderRadius: '4.5% / 3.22%' }}>
          <CardBack />
        </div>
        <div
          className="absolute inset-0 overflow-hidden"
          style={{ backfaceVisibility: 'hidden', transform: 'rotateY(180deg)', borderRadius: '4.5% / 3.22%' }}
        >
          <PressableCard card={requireCard(cardId)} compact noHolo inPlay noPeek />
        </div>
      </motion.div>
    </motion.div>
  )
}

/** How many rays break from under the card — enough to read as a genuine
 *  burst rather than a handful of spokes, still few enough that each one
 *  is a distinct shaft of light rather than a blurred wheel. */
const RAY_COUNT = 30
/** How many motes of dust scatter with the rays — small, irregular grit
 *  thrown outward by the same impact, rather than more of the same shafts. */
const SPARK_COUNT = 24

/** A cheap, deterministic stand-in for `Math.random()` keyed off an index —
 *  the scatter should look different from one spark to the next, but not
 *  reshuffle itself on every re-render of the same trigger. */
function pseudoRandom(seed: number) {
  const x = Math.sin(seed * 12.9898) * 43758.5453
  return x - Math.floor(x)
}

/**
 * The light breaking from under the card the instant it lands — a bright
 * white-gold core, a burst of rays shooting outward from it, and a scatter
 * of dust motes riding the same impact, all timed to start exactly on
 * contact rather than riding the card's own transition.
 *
 * Rays, not a radius: the light is meant to read as shafts breaking outward
 * from underneath the card, not a glow spreading evenly around it. The dust
 * is what keeps that from reading as too clean a shape — real light breaking
 * through debris throws grit as well as beams, at angles and distances the
 * evenly-spaced rays never take. All three use `screen` blend mode, which is
 * what "brighter" means against a background this dark — it adds light onto
 * what's already
 * there instead of painting a flat colour over it, so overlapping rays and
 * the core they share actually intensify each other the way real light does.
 */
function LightBurst({ trigger }: { trigger: PlaceFxTrigger }) {
  const { toRect } = trigger
  const { TO_LAND_S } = useMemo(
    () => computeTimings(trigger.fromRect, trigger.toRect, trigger.isActive),
    [trigger],
  )

  const cx = toRect.left + toRect.width / 2
  const cy = toRect.top + toRect.height / 2
  const rayLength = toRect.width * 1.9
  const rayWidth = toRect.width * 0.07
  const coreSize = toRect.width * 0.5

  return (
    <div className="absolute" style={{ left: cx, top: cy, width: 0, height: 0, mixBlendMode: 'screen' }}>
      {/* The core the rays appear to shoot out of — small and quick,
          nowhere near the spread a radial glow would need, since it's a
          source for the rays to read from rather than the effect itself. */}
      <motion.div
        className="absolute rounded-full"
        style={{
          left: -coreSize / 2,
          top: -coreSize / 2,
          width: coreSize,
          height: coreSize,
          background: WHITE,
          boxShadow: `0 0 ${toRect.width * 0.9}px ${toRect.width * 0.3}px ${YELLOW}`,
        }}
        initial={{ opacity: 0, scale: 0.2 }}
        animate={{ opacity: [0, 1, 0], scale: [0.2, 1, 1.3] }}
        transition={{ duration: IMPACT_S * 0.75, delay: TO_LAND_S, ease: 'easeOut' }}
      />

      {Array.from({ length: RAY_COUNT }, (_, i) => {
        const angle = (360 / RAY_COUNT) * i
        // Alternating lengths read as a burst radiating unevenly, the way
        // real light through a break does, rather than a perfect gear of
        // identical spokes.
        const length = rayLength * (i % 2 === 0 ? 1 : 0.6)
        return (
          <motion.div
            key={i}
            className="absolute"
            style={{
              left: -rayWidth / 2,
              top: -length,
              width: rayWidth,
              height: length,
              background: `linear-gradient(to top, ${WHITE}, ${YELLOW} 45%, transparent)`,
              transformOrigin: '50% 100%',
              rotate: angle,
            }}
            initial={{ scaleY: 0, opacity: 0 }}
            animate={{ scaleY: [0, 1, 0.8], opacity: [0, 1, 0] }}
            transition={{ duration: IMPACT_S, delay: TO_LAND_S, ease: 'easeOut' }}
          />
        )
      })}

      {Array.from({ length: SPARK_COUNT }, (_, i) => {
        // Its own angle, independent of the rays' evenly-spaced spokes —
        // dust doesn't fly in a wheel, it scatters. Distance and size vary
        // per-mote too, so the field reads as grit thrown by the impact
        // rather than a second, denser ring of rays.
        const angle = pseudoRandom(i * 3.1) * 360
        const distance = rayLength * (0.35 + pseudoRandom(i * 7.7) * 0.85)
        const size = toRect.width * (0.02 + pseudoRandom(i * 5.3) * 0.035)
        const dx = Math.cos((angle * Math.PI) / 180) * distance
        const dy = Math.sin((angle * Math.PI) / 180) * distance
        // A little jitter on the timing too, so the dust doesn't all
        // twinkle out in perfect lockstep with the rays or each other.
        const delay = TO_LAND_S + pseudoRandom(i * 9.1) * IMPACT_S * 0.25
        return (
          <motion.div
            key={i}
            className="absolute rounded-full"
            style={{
              left: -size / 2,
              top: -size / 2,
              width: size,
              height: size,
              background: i % 3 === 0 ? YELLOW : WHITE,
              boxShadow: `0 0 ${size * 2}px ${size * 0.6}px ${WHITE}`,
            }}
            initial={{ x: 0, y: 0, opacity: 0, scale: 0.4 }}
            animate={{ x: [0, dx * 0.6, dx], y: [0, dy * 0.6, dy], opacity: [0, 1, 0], scale: [0.4, 1, 0.5] }}
            transition={{ duration: IMPACT_S * 1.3, delay, ease: 'easeOut' }}
          />
        )
      })}
    </div>
  )
}
