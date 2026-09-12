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
 * fires right there, which is what the screen dispatches PLAY_FIGURE (or
 * commits a setup pick) from, so the real Figure appears in the slot exactly
 * as the card that became it finishes falling — the same "the drop causes
 * the arrival" ordering the sortie's own `onDone` is built on. The card
 * itself doesn't vanish outright on contact: it settles with a small
 * squash-and-rebound, like something with real weight meeting the mat, while
 * a ring of gold light breaks from underneath it — and only once that
 * settles does the card fade the rest of the way out, handing off to the
 * Figure now actually standing in its place.
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

const RISE_S = 0.38
/** How long the card holds at the centre of the screen, turned face-up,
 *  before falling — brief on purpose: nothing here is being read for the
 *  first time the way a drawn card is, this is a beat of drama rather than
 *  information. */
const HOLD_S = 0.18
const DROP_S = 0.3
/** The settle: a squash-and-rebound on contact, then the fade that hands
 *  off to the real Figure the landing just placed. */
const IMPACT_S = 0.35

const TO_LAND_S = RISE_S + HOLD_S + DROP_S
const TOTAL_S = TO_LAND_S + IMPACT_S

/** How much larger the card gets at the centre of the screen — matched to
 *  the draw reveal's own peak, so the two "hero" flourishes this game has
 *  read as the same scale of moment. */
const PEAK_SCALE = 1.7

const SHADOW = '0 10px 20px rgba(0,0,0,.55)'
const GOLD = 'var(--gold-bright, #e8c274)'

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
    if (id === undefined) return
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
      <GoldBurst toRect={trigger.toRect} />
    </div>
  )
}

function PlaceCard({ trigger }: { trigger: PlaceFxTrigger }) {
  const { cardId, fromRect, toRect } = trigger

  const path = useMemo(() => {
    const fromCX = fromRect.left + fromRect.width / 2
    const fromCY = fromRect.top + fromRect.height / 2
    const toCX = toRect.left + toRect.width / 2
    const toCY = toRect.top + toRect.height / 2
    const peakX = window.innerWidth / 2
    const peakY = window.innerHeight / 2
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
          default: { duration: TOTAL_S, ease: 'easeOut', times: [0, t1, t2, t3, bounce1, bounce2, 1] },
          // Its own curve: opaque all the way through the rebound, fading
          // only in the sliver left after it settles — the same reasoning
          // the draw reveal's own late fade is built on.
          opacity: { duration: TOTAL_S, ease: 'easeIn', times: [0, t3, bounce2, 1] },
        },
      },
      flip: {
        // Turns face-up on the way to the centre, not on the way down —
        // by the time it holds there the reveal is already done.
        rotateY: [0, 180, 180],
        transition: { duration: TOTAL_S, ease: 'easeInOut', times: [0, t1, 1] },
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

/** The gold light breaking from under the card the instant it lands — a
 *  soft radial flash and a ring racing outward from it, timed to start
 *  exactly on contact rather than riding the card's own transition. */
function GoldBurst({ toRect }: { toRect: DOMRect }) {
  const cx = toRect.left + toRect.width / 2
  const cy = toRect.top + toRect.height / 2
  const size = toRect.width * 2.6

  return (
    <>
      <motion.div
        className="absolute rounded-full"
        style={{
          left: cx - size / 2,
          top: cy - size / 2,
          width: size,
          height: size,
          background: `radial-gradient(circle, ${GOLD} 0%, transparent 68%)`,
          mixBlendMode: 'screen',
        }}
        initial={{ opacity: 0, scale: 0.3 }}
        animate={{ opacity: [0, 0.85, 0], scale: [0.3, 1, 1.3] }}
        transition={{ duration: IMPACT_S, delay: TO_LAND_S, ease: 'easeOut' }}
      />
      <motion.span
        className="absolute rounded-full"
        style={{
          left: cx - toRect.width / 2,
          top: cy - toRect.width / 2,
          width: toRect.width,
          height: toRect.width,
          border: `2px solid ${GOLD}`,
        }}
        initial={{ opacity: 0, scale: 0.5 }}
        animate={{ opacity: [0, 0.9, 0], scale: [0.5, 2.2, 3] }}
        transition={{ duration: IMPACT_S * 1.1, delay: TO_LAND_S, ease: 'easeOut' }}
      />
    </>
  )
}
