import { useId } from 'react'
import { METAL_LABEL, RARITY_LABEL, RARITY_MARK, RARITY_METAL, type Rarity } from '@/game/types'

/**
 * The rarity mark shown in a card's footer and on collection tiles.
 *
 * Diamonds count up through the ordinary tiers, stars mark the chase tiers, and
 * a crown sits alone at the top — the same escalation the reference game uses,
 * because counting pips is faster to read at a glance than decoding a colour.
 *
 * The pips are struck in the same metal as the card's rim, so the two say one
 * thing in one language. Stating rarity twice in two unrelated palettes would
 * make a Sacred card look like it carried two different grades.
 */

const DIAMOND = 'M6 0.6 11.4 6 6 11.4 0.6 6Z'
const STAR = 'M6 0.4 7.5 4.3 11.6 4.5 8.4 7.1 9.5 11.2 6 8.9 2.5 11.2 3.6 7.1 0.4 4.5 4.5 4.3Z'
const CROWN = 'M0.8 9.6 2 2.4l3 3L6 1l1 4.4 3-3 1.2 7.2Z'

interface Props {
  rarity: Rarity
  /** Height of one pip, in px. */
  size?: number
  className?: string
}

export function RarityMark({ rarity, size = 11, className }: Props) {
  const uid = useId().replace(/:/g, '')
  const { shape, count } = RARITY_MARK[rarity]
  const metal = RARITY_METAL[rarity]

  const d = shape === 'diamond' ? DIAMOND : shape === 'star' ? STAR : CROWN
  const w = shape === 'crown' ? 11 : 12

  return (
    <svg
      width={size * count * (w / 12) + size * 0.16 * (count - 1)}
      height={size}
      viewBox={`0 0 ${count * w + 1.6 * (count - 1)} 12`}
      className={className}
      role="img"
      aria-label={`${RARITY_LABEL[rarity]}, ${METAL_LABEL[metal]}`}
    >
      <defs>
        <linearGradient id={`rar-${uid}`} x1="0" y1="0" x2="0.4" y2="1">
          <stop offset="0%" stopColor={`var(--metal-${metal}-hi)`} />
          <stop offset="45%" stopColor={`var(--metal-${metal}-mid)`} />
          <stop offset="100%" stopColor={`var(--metal-${metal}-lo)`} />
        </linearGradient>
      </defs>

      {Array.from({ length: count }, (_, i) => (
        <path
          key={i}
          d={d}
          transform={`translate(${i * (w + 1.6)} 0)`}
          fill={`url(#rar-${uid})`}
          stroke={`var(--metal-${metal}-lo)`}
          strokeWidth="0.5"
          strokeLinejoin="round"
        />
      ))}
    </svg>
  )
}
