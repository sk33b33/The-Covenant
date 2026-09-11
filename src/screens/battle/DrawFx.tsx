import { useEffect, useMemo } from 'react'
import { motion, type Transition } from 'framer-motion'
import { CardBack } from '@/art/CardBack'
import { PressableCard } from '@/components/card/PressableCard'
import { requireCard } from '@/data/cards'
import type { PlayerId } from '@/engine/types'

/**
 * The draw: a card's own trip from the deck into a hand.
 *
 * Unlike the attack sortie, a draw cannot hold the engine up — it is a side
 * effect of an action already dispatched (END_TURN, a Miracle, a Covenant, a
 * Relic), often several to one dispatch, so by the time this file knows a
 * draw happened the hand has already gained the card. This is a flourish
 * played *over* that already-settled state, the same way `AttackFx`'s own
 * impact plays over a hit the engine has already resolved, rather than a
 * flight the real update waits on.
 *
 * The flight itself is the sortie's sibling in spirit — a quick, physical lift
 * off the pile with a bit of arc and a shadow, not the sortie's own wide sweep
 * through the middle of the board. Draws happen far more often than attacks
 * (every turn, plus every draw/dig/search effect), so this has to read in a
 * fraction of the time: no orbiting sigils, no elemental theming, one motion
 * value driving position and one driving the reveal.
 *
 * Your own draw enlarges at the top of its arc and turns face-up before
 * dropping into your hand — you're meant to see what you drew. The
 * opponent's card takes the same flight, at the same pace, but never turns:
 * it goes straight from the pile into their hand still face-down, which is
 * what keeps a hidden hand hidden.
 */

export interface DrawFxTrigger {
  /** Bumped per batch, so a second draw-2 in a row still replays. */
  id: number
  draws: DrawFxCard[]
}

export interface DrawFxCard {
  cardId: string
  /** Whose card this is — decides whether it turns face-up in flight. */
  side: PlayerId
  /** Where it lifts off from: the drawing player's own deck pile. */
  fromRect: DOMRect
  /** Where it settles: the drawing player's hand tray. The real card is
   *  already sitting there by the time this plays — this fades out right as
   *  it arrives, handing off to the card that's already in place. */
  toRect: DOMRect
}

/** How far apart, in seconds, two cards in the same batch launch — a
 *  draw-2 reads as two cards leaving in quick succession, not one double-wide
 *  blur or two identical flights landing on top of each other. */
const STAGGER_S = 0.11

const FLY_S = 0.32
/** Face-up only: how long the card holds at the top of its arc, turned, once
 *  the flight itself has arrived — the beat that actually shows you the card. */
const HOLD_S = 0.26
const DROP_S = 0.22

const OWN_TOTAL_S = FLY_S + HOLD_S + DROP_S
const FOE_TOTAL_S = FLY_S + DROP_S

/** How much larger the card gets at the top of its arc — enough to read as
 *  lifted and, for your own draw, worth pausing on; well short of the
 *  sortie's own peak, since this never leaves the corner of the screen. */
const PEAK_SCALE = 1.5

/** How far the arc lifts toward the middle of the screen, in px — a modest
 *  rise rather than the sortie's sweep: pile and hand sit close together on
 *  both sides of the table, so there is neither the room nor the need for
 *  more. */
const RISE = 46

const SHADOW = '0 10px 20px rgba(0,0,0,.55)'

export function DrawFx({ trigger, onDone }: { trigger: DrawFxTrigger | null; onDone: () => void }) {
  const id = trigger?.id

  useEffect(() => {
    if (id === undefined || !trigger) return
    const last = trigger.draws.length - 1
    const total = last * STAGGER_S + (trigger.draws.some((d) => d.side === 'you') ? OWN_TOTAL_S : FOE_TOTAL_S)
    const timer = setTimeout(onDone, total * 1000)
    return () => clearTimeout(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id])

  if (!trigger) return null

  return (
    <div className="cov-draw-fx fixed inset-0 z-40 pointer-events-none" aria-hidden="true">
      {trigger.draws.map((draw, i) => (
        <DrawCard key={i} draw={draw} delay={i * STAGGER_S} />
      ))}
    </div>
  )
}

function DrawCard({ draw, delay }: { draw: DrawFxCard; delay: number }) {
  const { cardId, side, fromRect, toRect } = draw
  const reveal = side === 'you'

  const path = useMemo(() => {
    const fromCX = fromRect.left + fromRect.width / 2
    const fromCY = fromRect.top + fromRect.height / 2
    const toCX = toRect.left + toRect.width / 2
    const toCY = toRect.top + toRect.height / 2

    // Your pile sits below your hand's own row, close by, and the opponent's
    // mirrors that above theirs — so the lift is toward the middle of the
    // screen for both, same as the sortie's own "away from your own edge"
    // rule, just over a much shorter hop.
    const liftDir = side === 'you' ? -1 : 1
    const peakX = fromCX + (toCX - fromCX) * 0.5
    const peakY = fromCY + (toCY - fromCY) * 0.35 + liftDir * RISE

    const endScale = toRect.width / fromRect.width

    const at = (cx: number, cy: number, scale: number) => ({ x: cx - fromCX, y: cy - fromCY, scale })
    const start = at(fromCX, fromCY, 1)
    const peak = at(peakX, peakY, PEAK_SCALE)
    const end = at(toCX, toCY, endScale)

    const total = reveal ? OWN_TOTAL_S : FOE_TOTAL_S
    const flyAt = FLY_S / total

    if (!reveal) {
      const transition: Transition = { duration: total, delay, ease: 'easeOut', times: [0, flyAt, 1] }
      return {
        card: {
          x: [start.x, peak.x, end.x],
          y: [start.y, peak.y, end.y],
          scale: [start.scale, peak.scale, end.scale],
          opacity: [1, 1, 0],
          transition,
        },
        flip: null,
      }
    }

    const holdAt = (FLY_S + HOLD_S) / total
    const transition: Transition = {
      duration: total,
      delay,
      ease: 'easeOut',
      times: [0, flyAt, holdAt, 1],
    }
    return {
      card: {
        x: [start.x, peak.x, peak.x, end.x],
        y: [start.y, peak.y, peak.y, end.y],
        scale: [start.scale, peak.scale, peak.scale, end.scale],
        opacity: [1, 1, 1, 0],
        transition,
      },
      flip: {
        rotateY: [0, 0, 180, 180],
        transition: { duration: total, delay, ease: 'easeInOut', times: [0, flyAt, holdAt, 1] },
      },
    }
    // Recomputed only if the trip itself changes — the rects are measured
    // once, at the moment the draw was seen, not on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fromRect, toRect, side, delay])

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
      {path.flip ? (
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
      ) : (
        <div className="absolute inset-0 overflow-hidden" style={{ borderRadius: '4.5% / 3.22%' }}>
          <CardBack />
        </div>
      )}
    </motion.div>
  )
}
