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
const DROP_MIN_S = 0.24
const DROP_MAX_S = 0.46
/** The speed, in px/s, the rise and drop are paced to — each phase's own
 *  duration is its distance divided by this, clamped to the ranges above.
 *  A flat duration regardless of distance is what made the Bench's own drop
 *  read as rushed: it travels much farther from the held centre position
 *  than the Active slot does, so covering that ground in the same fixed
 *  time is a genuinely faster drop, whatever the clock says. Pacing both
 *  phases by speed instead keeps every destination feeling like the same
 *  weight of card making the same kind of trip. */
const TRAVEL_PX_PER_S = 1500

/** How much larger the card gets at the centre of the screen — matched to
 *  the draw reveal's own peak, so the two "hero" flourishes this game has
 *  read as the same scale of moment. */
const PEAK_SCALE = 1.7

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
function computeTimings(fromRect: DOMRect, toRect: DOMRect) {
  const fromCX = fromRect.left + fromRect.width / 2
  const fromCY = fromRect.top + fromRect.height / 2
  const toCX = toRect.left + toRect.width / 2
  const toCY = toRect.top + toRect.height / 2
  const peakX = window.innerWidth / 2
  const peakY = window.innerHeight / 2

  const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v))
  const riseDist = Math.hypot(peakX - fromCX, peakY - fromCY)
  const dropDist = Math.hypot(toCX - peakX, toCY - peakY)
  const RISE_S = clamp(riseDist / TRAVEL_PX_PER_S, RISE_MIN_S, RISE_MAX_S)
  const DROP_S = clamp(dropDist / TRAVEL_PX_PER_S, DROP_MIN_S, DROP_MAX_S)
  const TO_LAND_S = RISE_S + HOLD_S + DROP_S
  const TOTAL_S = TO_LAND_S + IMPACT_S

  return { fromCX, fromCY, toCX, toCY, peakX, peakY, RISE_S, DROP_S, TO_LAND_S, TOTAL_S }
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
    const { TO_LAND_S, TOTAL_S } = computeTimings(trigger.fromRect, trigger.toRect)
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
  const { cardId, fromRect, toRect } = trigger

  const path = useMemo(() => {
    const { fromCX, fromCY, toCX, toCY, peakX, peakY, RISE_S, TO_LAND_S, TOTAL_S } = computeTimings(fromRect, toRect)
    const endScale = toRect.width / fromRect.width

    const at = (cx: number, cy: number, scale: number) => ({ x: cx - fromCX, y: cy - fromCY, scale })
    const start = at(fromCX, fromCY, 1)
    const peak = at(peakX, peakY, PEAK_SCALE)
    const end = at(toCX, toCY, endScale)

    const t1 = RISE_S / TOTAL_S
    const t2 = (RISE_S + HOLD_S) / TOTAL_S
    const t3 = TO_LAND_S / TOTAL_S
    // The rebound plays out entirely inside the impact tail, well short of
    // `1` — everything after it is the fade alone.
    const bounce1 = (TO_LAND_S + IMPACT_S * 0.3) / TOTAL_S
    const bounce2 = (TO_LAND_S + IMPACT_S * 0.6) / TOTAL_S

    return {
      card: {
        x: [start.x, peak.x, peak.x, end.x, end.x - 4, end.x + 4, end.x],
        y: [start.y, peak.y, peak.y, end.y, end.y + 3, end.y - 2, end.y],
        scale: [1, PEAK_SCALE, PEAK_SCALE, endScale, endScale * 0.86, endScale * 1.08, endScale],
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
      flip: {
        // Turns face-up on the way to the centre, not on the way down —
        // by the time it holds there the reveal is already done. Eased
        // both ways for the same reason the rise above is: it leaves one
        // standstill (flat at 0°) and arrives at another (flat at 180°,
        // held through the hold that follows).
        rotateY: [0, 180, 180],
        transition: { duration: TOTAL_S, times: [0, t1, 1], ease: ['easeInOut', 'linear'] },
      },
    }
    // Recomputed only if the trip itself changes — the rects are measured
    // once, at the moment the card was dropped.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fromRect, toRect])

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
const RAY_COUNT = 18

/**
 * The light breaking from under the card the instant it lands — a bright
 * white-gold core and a burst of rays shooting outward from it, timed to
 * start exactly on contact rather than riding the card's own transition.
 *
 * Rays, not a radius: the light is meant to read as shafts breaking outward
 * from underneath the card, not a glow spreading evenly around it. Both the
 * core and the rays use `screen` blend mode, which is what "brighter" means
 * against a background this dark — it adds light onto what's already
 * there instead of painting a flat colour over it, so overlapping rays and
 * the core they share actually intensify each other the way real light does.
 */
function LightBurst({ trigger }: { trigger: PlaceFxTrigger }) {
  const { toRect } = trigger
  const { TO_LAND_S } = useMemo(() => computeTimings(trigger.fromRect, trigger.toRect), [trigger])

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
    </div>
  )
}
