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
 * actually standing in its place.
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
/** The fade that hands off to the real Figure the landing just placed. Also
 *  fixed — a settle, not a trip. */
const FADE_S = 0.35

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
  const TOTAL_S = TO_LAND_S + FADE_S

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
        x: [start.x, peak.x, peak.x, end.x, end.x],
        y: [start.y, peak.y, peak.y, end.y, end.y],
        scale: [1, peakScale, peakScale, endScale, endScale],
        opacity: [1, 1, 1, 1, 0],
        transition: {
          // One ease per segment rather than one for the whole path — a
          // single 'easeOut' across every stop front-loads speed at the
          // start of *each* segment, which reads as a jolt everywhere a
          // segment boundary sits on a standstill: the rise leaving a card
          // at rest, and the drop leaving the held card at rest again.
          // 'easeInOut' either side of those two standstills is what
          // actually reads as one continuous motion rather than several
          // separate ones stitched together. It lands and simply fades —
          // no rebound — so the last segment is the fade alone.
          duration: TOTAL_S,
          times: [0, t1, t2, t3, 1],
          ease: ['easeInOut', 'linear', 'easeInOut', 'easeOut'],
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
