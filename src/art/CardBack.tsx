import { useId } from 'react'
import { TreeGlyph } from './tree'
import { cx } from '@/lib/cx'

/**
 * The card back.
 *
 * Every face-down card in the game is this: both decks, the opening hand, the
 * five cards inside an unopened pack. It is the most-repeated image in the
 * product, so it is drawn rather than shipped as a bitmap — one scalable
 * component instead of a texture that would need three resolutions.
 *
 * Construction is a deep vellum ground, a guilloche ring of radiating spokes,
 * the tree-of-life seal, and a double gold rule inset from the edge.
 */
export function CardBack({ className }: { className?: string }) {
  const uid = useId().replace(/:/g, '')
  const id = (n: string) => `${n}-${uid}`

  return (
    <svg
      viewBox="0 0 300 419"
      className={cx('block w-full h-auto', className)}
      role="img"
      aria-label="Card back"
    >
      <defs>
        <linearGradient id={id('ground')} x1="0.1" y1="0" x2="0.9" y2="1">
          <stop offset="0%" stopColor="#241a0e" />
          <stop offset="45%" stopColor="#120d07" />
          <stop offset="100%" stopColor="#1e1509" />
        </linearGradient>

        {/* User-space so zero-width shapes (the trunk) still receive paint. */}
        <linearGradient
          id={id('gold')}
          gradientUnits="userSpaceOnUse"
          x1="40"
          y1="40"
          x2="260"
          y2="380"
        >
          <stop offset="0%" stopColor="#f4e0b8" />
          <stop offset="26%" stopColor="#c49a5c" />
          <stop offset="50%" stopColor="#8d5f2a" />
          <stop offset="76%" stopColor="#e8cf9e" />
          <stop offset="100%" stopColor="#a8763c" />
        </linearGradient>

        <radialGradient id={id('halo')} cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#c79c62" stopOpacity="0.42" />
          <stop offset="100%" stopColor="#c79c62" stopOpacity="0" />
        </radialGradient>

        <clipPath id={id('clip')}>
          <rect width="300" height="419" rx="16" />
        </clipPath>
      </defs>

      <g clipPath={`url(#${id('clip')})`}>
        <rect width="300" height="419" fill={`url(#${id('ground')})`} />
        <circle cx="150" cy="209" r="150" fill={`url(#${id('halo')})`} />

        {/* Guilloche: radiating spokes, alternating length. */}
        <g stroke={`url(#${id('gold')})`} opacity="0.3">
          {Array.from({ length: 48 }, (_, i) => {
            const a = (i / 48) * Math.PI * 2
            const r0 = i % 2 ? 96 : 104
            const r1 = i % 4 === 0 ? 132 : 122
            return (
              <line
                key={i}
                x1={150 + Math.cos(a) * r0}
                y1={209 + Math.sin(a) * r0}
                x2={150 + Math.cos(a) * r1}
                y2={209 + Math.sin(a) * r1}
                strokeWidth={i % 4 === 0 ? 1.8 : 0.9}
              />
            )
          })}
        </g>

        <circle
          cx="150"
          cy="209"
          r="90"
          fill="none"
          stroke={`url(#${id('gold')})`}
          strokeWidth="2.2"
        />
        <circle
          cx="150"
          cy="209"
          r="136"
          fill="none"
          stroke={`url(#${id('gold')})`}
          strokeWidth="1.2"
          opacity="0.75"
        />

        {/* Seal. */}
        <g transform="translate(150 209) scale(5.6) translate(-12 -13.4)">
          <TreeGlyph width={1.5 / 5.6} fruitRadius={0.8} paint={`url(#${id('gold')})`} />
        </g>

        {/* Double rule inset from the trimmed edge. */}
        <rect
          x="9"
          y="9"
          width="282"
          height="401"
          rx="10"
          fill="none"
          stroke={`url(#${id('gold')})`}
          strokeWidth="2"
        />
        <rect
          x="15"
          y="15"
          width="270"
          height="389"
          rx="7"
          fill="none"
          stroke={`url(#${id('gold')})`}
          strokeWidth="0.8"
          opacity="0.65"
        />
      </g>
    </svg>
  )
}
