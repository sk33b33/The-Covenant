import { motion } from 'framer-motion'
import { EnergyOrb } from '@/art/EnergyOrb'
import { SlotOutline } from '@/art/BattleMat'
import { PressableCard } from '@/components/card/PressableCard'
import { requireCard } from '@/data/cards'
import { isFigure } from '@/game/types'
import { cx } from '@/lib/cx'
import type { FigureInPlay, StatusKind } from '@/engine/types'

/**
 * A Figure on the mat.
 *
 * The card itself is the same component the binder uses; what is added here is
 * everything that only matters mid-match — the HP bar, attached energy, status
 * markers and the selection glow. Those sit outside the card frame rather than
 * inside it, so a card never renders differently depending on where it is.
 */

const STATUS_MARK: Record<StatusKind, { label: string; tint: string }> = {
  blessed: { label: 'BLESSED', tint: '#f2d675' },
  bound: { label: 'BOUND', tint: '#8a7454' },
  blinded: { label: 'BLINDED', tint: '#8e6fb0' },
  afflicted: { label: 'AFFLICTED', tint: '#7fae5e' },
  slumber: { label: 'ASLEEP', tint: '#6f8ec0' },
  enduring: { label: 'ENDURING', tint: '#e5c08c' },
  shielded: { label: 'SHIELDED', tint: '#78c2e8' },
  guarded: { label: 'GUARDED', tint: '#9ab0c4' },
  unweak: { label: 'STEADFAST', tint: '#c9ae6c' },
}

interface Props {
  figure: FigureInPlay | null
  /** Width in px; the card scales itself from this. */
  width: number
  /** Empty-slot caption. */
  emptyLabel?: string
  onClick?: () => void
  /** Draws the gold selection ring. */
  selected?: boolean
  /** Draws the pulsing target ring. */
  targetable?: boolean
  /** Hides HP and energy for the opponent's face-down or distant pieces. */
  compactStats?: boolean
  /**
   * Suppresses hold-to-inspect. Set on your Active Figure while it is yours to
   * act with: there, a single tap already lifts the card *and* brings its
   * attacks with it, so a second gesture opening the same card without them
   * would be strictly worse than the tap it competes with.
   */
  noPeek?: boolean
  className?: string
}

export function BoardFigure({
  figure,
  width,
  emptyLabel,
  onClick,
  selected,
  targetable,
  compactStats,
  noPeek,
  className,
}: Props) {
  if (!figure) {
    return (
      <div
        className={cx('relative shrink-0', className)}
        style={{ width, aspectRatio: '63 / 88' }}
      >
        <SlotOutline label={emptyLabel} />
      </div>
    )
  }

  const card = requireCard(figure.cardId)
  const hp = isFigure(card) ? card.hp : 0
  const remaining = Math.max(0, hp - figure.damage)
  const fraction = hp > 0 ? remaining / hp : 0

  return (
    <motion.button
      // No `layout`/`layoutId` here any more. A promotion moves this same
      // Figure — same uid — from a Bench slot to the Active one in a single
      // commit, with no `AnimatePresence` staging the old instance's exit;
      // React just unmounts it there and mounts a new one here. That is
      // exactly the shape framer's shared-layout projection is built to
      // bridge, but bridging it while the outgoing instance still had an
      // *infinite* `animate` loop in flight (the pulsing ring every
      // `targetable` Bench Figure carries during a pending promotion) asked
      // the projection system to compute a FLIP transform off a transform
      // that was still being driven by a competing, never-completing
      // animation. This game already has one documented case of framer's own
      // gesture tracking destabilising under exactly this kind of
      // interference (see the drag-highlight comment above `setHighlight`
      // in Battle.tsx) — the promotion-freeze reports match that failure
      // mode closely enough, and this combination has no correctness or
      // requested-feature purpose, only an unrequested cosmetic cross-fade,
      // to be worth the risk.
      onClick={onClick}
      disabled={!onClick}
      className={cx('cov-figure-card relative shrink-0 block', className)}
      style={{ width }}
      animate={targetable ? { scale: [1, 1.04, 1] } : { scale: 1 }}
      transition={
        targetable
          ? { duration: 1.3, repeat: Infinity, ease: 'easeInOut' }
          : { type: 'spring', stiffness: 320, damping: 30 }
      }
      aria-label={`${card.name}, ${remaining} of ${hp} HP`}
    >
      <div
        style={{
          boxShadow: selected
            ? '0 0 0 2.5px var(--gold-bright), 0 0 18px rgba(229,192,140,.55)'
            : targetable
              ? '0 0 0 2px rgba(210,84,58,.9), 0 0 16px rgba(210,84,58,.45)'
              : undefined,
          // Traces the card's corner rather than a rounder ellipse of its own.
          // A percentage radius resolves per-axis, so `8%` on a 63:88 card drew
          // a ring that cut visibly across each corner of the card inside it.
          borderRadius: '4.5% / 3.22%',
        }}
      >
        <PressableCard card={card} compact noHolo inPlay noPeek={noPeek} />
      </div>

      {/* HP bar, hugging the card's foot. */}
      {!compactStats && (
        <div
          className="absolute left-[6%] right-[6%] bottom-[3%] h-[5px] rounded-pill overflow-hidden"
          style={{ background: 'rgba(10,7,3,.8)' }}
        >
          <motion.div
            className="h-full rounded-pill"
            initial={false}
            animate={{ width: `${fraction * 100}%` }}
            transition={{ duration: 0.42, ease: [0.22, 1, 0.36, 1] }}
            style={{
              background:
                fraction > 0.5 ? '#6f9e5a' : fraction > 0.22 ? '#c9a02e' : '#c0402c',
            }}
          />
        </div>
      )}

      {/* Remaining HP, large enough to read across the mat. */}
      {!compactStats && (
        <span
          className="absolute -top-1.5 -right-1 rounded-pill px-1.5 font-numeric font-bold tabular-nums leading-tight"
          style={{
            fontSize: Math.max(10, width * 0.13),
            background: 'rgba(10,7,3,.9)',
            color: fraction > 0.22 ? 'var(--gold-bright)' : '#ef8f7c',
          }}
        >
          {remaining}
        </span>
      )}

      {/* Attached energy, hung clear of the HP bar at the card's foot. */}
      {figure.energy.length > 0 && (
        <span className="absolute -bottom-3 left-1/2 -translate-x-1/2 flex gap-0.5">
          {figure.energy.slice(0, 5).map((type, i) => (
            <EnergyOrb key={i} type={type} size={Math.max(11, width * 0.15)} />
          ))}
          {figure.energy.length > 5 && (
            <span className="text-[9px] font-bold self-center" style={{ color: 'var(--gold-bright)' }}>
              +{figure.energy.length - 5}
            </span>
          )}
        </span>
      )}

      {/* Status markers stack down the left edge. */}
      {figure.statuses.length > 0 && (
        <span className="absolute -left-1 top-1/4 flex flex-col gap-0.5 items-start">
          {figure.statuses.map((status) => (
            <span
              key={status.kind}
              className="rounded-sm px-1 text-[7px] font-bold tracking-wide leading-[1.5]"
              style={{
                background: 'rgba(10,7,3,.92)',
                color: STATUS_MARK[status.kind].tint,
              }}
            >
              {STATUS_MARK[status.kind].label}
            </span>
          ))}
        </span>
      )}

      {/* Ascension depth, so a stacked Figure reads as one object. Kept off
          the nameplate, where it would sit on the stage label. */}
      {figure.beneath.length > 0 && (
        <span
          className="absolute bottom-[9%] left-[6%] rounded-pill px-1 text-[8px] font-bold leading-tight"
          style={{ background: 'rgba(10,7,3,.9)', color: 'var(--gold-bright)' }}
        >
          {'★'.repeat(figure.beneath.length)}
        </span>
      )}
    </motion.button>
  )
}
