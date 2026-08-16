import { motion } from 'framer-motion'
import { useLongPress } from '@/hooks/useLongPress'
import { usePeek } from '@/store/peek'
import { cx } from '@/lib/cx'
import type { SheetOption } from '@/screens/battle/ActionSheet'
import type { Card as CardData } from '@/game/types'
import { Card } from './Card'

/**
 * A card you can lift.
 *
 * Press and hold anything that is a card — in the binder, on the mat, in your
 * hand, in a pack reveal — and it opens in the viewer. The one exception is
 * your Active Figure mid-match, which uses `mode="tap"`: it is the card you
 * touch most, and its attacks live in the viewer with it.
 *
 * Hold is deliberately *additive*. A card in hand still plays on tap, a bench
 * Figure still promotes, a binder tile still opens. Nothing that worked before
 * needs a different gesture now, which is what lets this go everywhere at once
 * without relearning any screen.
 *
 * The cue is not decoration: an invisible 450ms gesture is one users never
 * discover. The card sinks and a ring of light closes around it as the press
 * completes, so the first accidental hold teaches the gesture.
 */

interface Props {
  card: CardData
  /** `hold` everywhere; `tap` for the Active Figure, which opens on one tap. */
  mode?: 'hold' | 'tap'
  /**
   * Set when the card has no interactive parent — a pack reveal, a story
   * reward, the deck cover, the social showcase.
   *
   * Elsewhere the card sits inside a button that already answers Enter and
   * Space, so hold is an addition. On its own, hold would be the *only* way
   * in, and a keyboard or switch user could never open the card at all. This
   * makes the card itself the control: tap, Enter and Space all open it.
   */
  standalone?: boolean
  /** Offered beneath the card in the viewer. */
  actions?: SheetOption[]
  /** Copies held, shown in the viewer where ownership is the point. */
  count?: number
  /** Turns lifting off — for a face-down card, or an opponent's hand. */
  noPeek?: boolean

  compact?: boolean
  noHolo?: boolean
  inPlay?: boolean
  className?: string
  style?: React.CSSProperties
}

export function PressableCard({
  card,
  mode = 'hold',
  standalone,
  actions,
  count,
  noPeek,
  className,
  ...cardProps
}: Props) {
  const peek = usePeek((s) => s.peek)
  const open = () => peek(card, { actions, count })

  const { progress, handlers } = useLongPress({
    onLongPress: open,
    disabled: noPeek || mode === 'tap',
  })

  const held = progress > 0
  const opensOnClick = !noPeek && (mode === 'tap' || standalone)

  return (
    <motion.div
      {...handlers}
      onClick={opensOnClick ? open : undefined}
      {...(standalone && !noPeek
        ? {
            role: 'button',
            tabIndex: 0,
            'aria-label': `View ${card.name}`,
            onKeyDown: (e: React.KeyboardEvent) => {
              if (e.key !== 'Enter' && e.key !== ' ') return
              e.preventDefault()
              open()
            },
          }
        : {})}
      className={cx('relative', className)}
      // A press that goes nowhere still has to feel received, so the card sinks
      // slightly from the first frame rather than only at the threshold.
      animate={{ scale: held ? 1 - progress * 0.045 : 1 }}
      transition={{ type: 'spring', stiffness: 420, damping: 34 }}
    >
      <Card card={card} {...cardProps} />

      {held && (
        <span
          aria-hidden="true"
          className="absolute inset-0 pointer-events-none"
          style={{
            // Traces the card's own corner. The card's 4.5cqw is a length, so
            // both axes get the same radius; a bare `4.5%` here would resolve
            // per-axis and draw an ellipse that cuts across the corner. On a
            // 63:88 card the matching vertical radius is 4.5 × 63/88.
            borderRadius: '4.5% / 3.22%',
            // A ring that closes as the hold completes. Drawn with a conic
            // gradient masked to the edge, so it traces the card's own outline
            // instead of sitting on top of the art.
            padding: '2px',
            background: `conic-gradient(var(--gold-bright) ${progress * 360}deg, transparent 0deg)`,
            WebkitMask: 'linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0)',
            WebkitMaskComposite: 'xor',
            maskComposite: 'exclude',
            opacity: 0.9,
          }}
        />
      )}
    </motion.div>
  )
}
