import { useEffect } from 'react'
import { motion } from 'framer-motion'
import { PressableCard } from '@/components/card/PressableCard'
import { requireCard } from '@/data/cards'

/**
 * The opening deal: your five opening-hand cards flying from the deck pile
 * into their own seats in the fan, right to left, one after another.
 *
 * Unlike a drawn card or a placed one, nothing here is a reveal — an opening
 * hand was never face-down to you, so every card here shows its real face
 * for the whole trip rather than turning up partway through. It is also the
 * one flight in this game that goes straight to a *specific* seat rather
 * than a generic landing spot: each card's own `toRect` is where it will
 * sit in the finished five-card fan, computed once, up front, so the fan's
 * own shape never has to reflow as later cards join it — see Battle.tsx's
 * `dealCardRect`. The real card underneath sits at that same seat from the
 * first frame too, just invisible (`HandCard`'s own `invisible`), so all
 * this has to do is fade one in as its own flight lands, in order.
 */

export interface DealFxCard {
  cardId: string
  fromRect: DOMRect
  toRect: DOMRect
}

export interface DealFxTrigger {
  id: number
  cards: DealFxCard[]
}

/** How far apart, in seconds, consecutive cards leave the pile — unhurried
 *  enough that each is read as its own distinct arrival rather than five
 *  cards rushing off the pile at once. */
const STAGGER_S = 0.3
const FLY_S = 0.6

/** Each card's own place in the launch order — the rightmost seat (the
 *  highest index) leaves the pile first, working back toward the left, so
 *  the deal reads right to left even though every card still ends up at its
 *  own correct seat (`dealCardRect` never changes). */
function delayFor(index: number, count: number) {
  return (count - 1 - index) * STAGGER_S
}

export function DealFx({
  trigger,
  onCardLand,
  onDone,
}: {
  trigger: DealFxTrigger | null
  /** Fires the instant one card's own flight reaches its seat — this is
   *  what reveals the real (invisible-until-now) card sitting there. */
  onCardLand: (index: number) => void
  /** Fires once every card has landed and the overlay has nothing left to
   *  show. */
  onDone: () => void
}) {
  const id = trigger?.id

  useEffect(() => {
    if (id === undefined || !trigger) return
    const count = trigger.cards.length
    const landTimers = trigger.cards.map((_, i) => setTimeout(() => onCardLand(i), (delayFor(i, count) + FLY_S) * 1000))
    const total = count ? (count - 1) * STAGGER_S + FLY_S : 0
    const doneTimer = setTimeout(onDone, total * 1000)
    return () => {
      landTimers.forEach(clearTimeout)
      clearTimeout(doneTimer)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id])

  if (!trigger) return null

  return (
    <div className="cov-deal-fx fixed inset-0 z-40 pointer-events-none" aria-hidden="true">
      {trigger.cards.map((card, i) => (
        <DealCard key={i} card={card} delay={delayFor(i, trigger.cards.length)} />
      ))}
    </div>
  )
}

function DealCard({ card, delay }: { card: DealFxCard; delay: number }) {
  const { cardId, fromRect, toRect } = card
  const dx = toRect.left - fromRect.left
  // A small rise above the straight line to its seat — the same lift every
  // other flight in this game carries a card with, just a gentler one:
  // pile and hand sit close together here, and five of these happen at
  // once, so this is a hint of an arc rather than a sweep.
  const dy = toRect.top - fromRect.top
  const endScale = toRect.width / fromRect.width

  return (
    <motion.div
      style={{
        position: 'absolute',
        left: fromRect.left,
        top: fromRect.top,
        width: fromRect.width,
        aspectRatio: '63 / 88',
        filter: 'drop-shadow(0 8px 14px rgba(0,0,0,.5))',
      }}
      initial={{ x: 0, y: 0, scale: 1, opacity: 0 }}
      animate={{
        x: [0, dx * 0.5, dx],
        y: [0, dy * 0.5 - 26, dy],
        scale: [1, (1 + endScale) / 2, endScale],
        opacity: [0, 1, 1, 0],
      }}
      transition={{
        default: { duration: FLY_S, delay, times: [0, 0.5, 1], ease: 'easeOut' },
        // Its own curve: in almost at once, opaque through the whole
        // middle of the flight, gone fast at the very end as the real
        // (already-seated) card takes over.
        opacity: { duration: FLY_S, delay, times: [0, 0.12, 0.8, 1], ease: 'easeOut' },
      }}
    >
      <div className="absolute inset-0 overflow-hidden" style={{ borderRadius: '4.5% / 3.22%' }}>
        <PressableCard card={requireCard(cardId)} compact noHolo inPlay noPeek />
      </div>
    </motion.div>
  )
}
