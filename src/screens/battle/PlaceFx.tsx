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
 * lands. The card itself doesn't vanish outright on contact: it holds there
 * a beat, then fades the rest of the way out, handing off to the Figure now
 * actually standing in its place — while a yellow glow traces the outside
 * of its border, right underneath it, the instant it touches down.
 *
 * The Active slot gets a bigger version of this — a taller, larger peak,
 * since it's the one spot on the board every attack and every turn actually
 * revolves around — but the trip itself (the double flip, the timing of
 * every leg) is identical everywhere a card can land. A Bench drop earning
 * anything less would read as the lesser of the two, when a Figure joining
 * the bench is exactly as real an arrival as one taking the field.
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
   *  drop that gets the taller, larger peak. */
  isActive: boolean
}

/** How long the card holds at the centre of the screen, turned face-up,
 *  before falling — brief on purpose: nothing here is being read for the
 *  first time the way a drawn card is, this is a beat of drama rather than
 *  information. */
const HOLD_S = 0.18
/** The fade that hands off to the real Figure the landing just placed. */
const FADE_S = 0.35

/** The rise and the drop are each a fixed duration now, not one derived
 *  from how far a particular slot happens to sit from the centre. Distance
 *  proportional timing sounded right, but it meant every Bench slot quietly
 *  ran its own drop at its own speed — the one nearer the middle landing
 *  noticeably quicker than the one out at the edge — and it meant Bench and
 *  Active could never actually agree on a duration no matter how their
 *  individual bounds were tuned, since they were never measuring the same
 *  trip. A single rise and a single drop, shared by every slot the game
 *  has, is what makes "how long this takes" a property of the flourish
 *  itself rather than of whichever spot the finger happened to let go
 *  over. */
const RISE_S = 0.4
const DROP_S = 0.7

/** A single smooth ease shared by every leg of the trip that actually
 *  covers ground — the rise and the drop. A standard, well-behaved
 *  easeInOutCubic: both control points sit in x-order (0.65 before 0.86),
 *  so the curve is strictly monotonic — no crossed control points to fold
 *  the timing function back on itself and read as a hitch partway through.
 *  It holds its slowest near both ends a little longer than Framer's own
 *  `'easeInOut'`, which is what reads as smooth once nothing (no rebound,
 *  no burst) is left to paper over an otherwise ordinary landing. */
const EASE_SMOOTH = [0.65, 0, 0.35, 1] as const

/** How much larger the card gets at the centre of the screen — matched to
 *  the draw reveal's own peak, so the two "hero" flourishes this game has
 *  read as the same scale of moment. The Active slot gets a bigger, higher
 *  peak still: it's the one arrival every attack and turn actually revolves
 *  around, so it earns the more prominent version of this beat — a
 *  difference in how tall the trip stands, not in how long it takes. */
const PEAK_SCALE = 1.7
const ACTIVE_PEAK_SCALE = 2.1
/** How far above true screen centre the Active peak holds, as a fraction of
 *  screen height — enough to read as its own deliberately higher position
 *  rather than the same centre point just enlarged. */
const ACTIVE_PEAK_LIFT = 0.1

/** Every drop's own second turn in the air: a full flip cycle (away, then
 *  back to face-up) tacked onto the end of the first, so the card reveals
 *  itself, turns away again, and reveals itself a second time before it
 *  ever holds still. Shared by Bench and Active alike — arriving on the
 *  bench is exactly as real an arrival as taking the field. */
const FLIP_EXTRA_S = 0.4

const SHADOW = '0 10px 20px rgba(0,0,0,.55)'
/** The glow's own colour — warm yellow, the same family of light the
 *  frames and orbs already catch, rather than anything closer to white. */
const YELLOW = '#ffd85e'

/** The two moments every other piece of this flight is scheduled against —
 *  fixed now, the same for every slot, rather than derived per trip. */
const TO_LAND_S = RISE_S + FLIP_EXTRA_S + HOLD_S + DROP_S
const TOTAL_S = TO_LAND_S + FADE_S

/**
 * The positions this flight needs, derived once from the two rects a
 * trigger carries — where it starts, where it peaks, and where it ends.
 * Timing no longer lives here: only the geometry does.
 */
function computeTimings(fromRect: DOMRect, toRect: DOMRect, isActive: boolean) {
  const fromCX = fromRect.left + fromRect.width / 2
  const fromCY = fromRect.top + fromRect.height / 2
  const toCX = toRect.left + toRect.width / 2
  const toCY = toRect.top + toRect.height / 2
  const peakX = window.innerWidth / 2
  const peakY = window.innerHeight / 2 - (isActive ? window.innerHeight * ACTIVE_PEAK_LIFT : 0)
  const peakScale = isActive ? ACTIVE_PEAK_SCALE : PEAK_SCALE

  return { fromCX, fromCY, toCX, toCY, peakX, peakY, peakScale }
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
      <LandingGlow trigger={trigger} />
      <PlaceCard trigger={trigger} />
    </div>
  )
}

function PlaceCard({ trigger }: { trigger: PlaceFxTrigger }) {
  const { cardId, fromRect, toRect, isActive } = trigger

  const path = useMemo(() => {
    const { fromCX, fromCY, toCX, toCY, peakX, peakY, peakScale } = computeTimings(fromRect, toRect, isActive)
    const endScale = toRect.width / fromRect.width

    const at = (cx: number, cy: number, scale: number) => ({ x: cx - fromCX, y: cy - fromCY, scale })
    const start = at(fromCX, fromCY, 1)
    const peak = at(peakX, peakY, peakScale)
    const end = at(toCX, toCY, endScale)

    const t1 = RISE_S / TOTAL_S
    // The hold stretches to cover the extra flip cycle too — the card's
    // position and scale are already flat across it either way, so this is
    // the only change the longer flip needs here.
    const t2 = (RISE_S + FLIP_EXTRA_S + HOLD_S) / TOTAL_S
    const t3 = TO_LAND_S / TOTAL_S

    // The double turn: past the first reveal at `t1`, it turns away again
    // and reveals a second time, ending on `t1f` rather than holding flat
    // straight through — the same for every slot the game has.
    const t1f = (RISE_S + FLIP_EXTRA_S) / TOTAL_S
    const t1mid = (t1 + t1f) / 2
    const flip = {
      rotateY: [0, 180, 360, 540, 540],
      transition: {
        duration: TOTAL_S,
        times: [0, t1, t1mid, t1f, 1],
        ease: [EASE_SMOOTH, EASE_SMOOTH, EASE_SMOOTH, 'linear'],
      },
    }

    return {
      card: {
        x: [start.x, peak.x, peak.x, end.x, end.x],
        y: [start.y, peak.y, peak.y, end.y, end.y],
        scale: [1, peakScale, peakScale, endScale, endScale],
        opacity: [1, 1, 1, 1, 0],
        transition: {
          // One ease per segment rather than one for the whole path — a
          // single ease across every stop front-loads speed at the start of
          // *each* segment, which reads as a jolt everywhere a segment
          // boundary sits on a standstill: the rise leaving a card at rest,
          // and the drop leaving the held card at rest again. `EASE_SMOOTH`
          // either side of those two standstills is what actually reads as
          // one continuous motion rather than several stitched together —
          // and, with no rebound left to paper over a hard stop, it's also
          // what keeps the drop's own landing from reading as abrupt. It
          // lands and simply fades, so the last segment is the fade alone.
          duration: TOTAL_S,
          times: [0, t1, t2, t3, 1],
          ease: [EASE_SMOOTH, 'linear', EASE_SMOOTH, 'easeOut'],
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

/**
 * The glow that lights up under the card the instant it lands — a soft
 * yellow rim tracing the outside of its border, not a fill or a burst. A
 * transparent box the same shape as the card, sized a touch larger, lets a
 * plain `box-shadow` do the whole job: a shadow only ever paints outside an
 * element's own edges, so the light naturally stops exactly at the card's
 * silhouette instead of spilling into it or reading as a shape of its own.
 */
function LandingGlow({ trigger }: { trigger: PlaceFxTrigger }) {
  const { toRect } = trigger

  return (
    <motion.div
      className="absolute"
      style={{
        left: toRect.left,
        top: toRect.top,
        width: toRect.width,
        aspectRatio: '63 / 88',
        borderRadius: '4.5% / 3.22%',
        background: 'transparent',
        boxShadow: `0 0 ${toRect.width * 0.35}px ${toRect.width * 0.14}px ${YELLOW}`,
        mixBlendMode: 'screen',
      }}
      initial={{ opacity: 0 }}
      animate={{ opacity: [0, 1, 0] }}
      transition={{ duration: FADE_S, delay: TO_LAND_S, ease: 'easeOut' }}
    />
  )
}
