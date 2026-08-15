import { useId } from 'react'
import type { EnergyType } from '@/game/types'
import { cx } from '@/lib/cx'

/**
 * The battle mat.
 *
 * Drawn as one SVG behind the board rather than as per-slot borders, because
 * the mat's job is to make the geometry legible at a glance: two mirrored
 * halves, a centre ring where the clash happens, and slot outlines that read as
 * places to put something even when empty. Doing that with CSS boxes gave a
 * grid of rectangles; a single drawn surface reads as a playing field.
 *
 * It scales with the container and is purely decorative — every interactive
 * slot is a real button positioned over it.
 */

const TINT: Record<EnergyType, string> = {
  light: '#f2d675',
  fire: '#d2543a',
  water: '#3d7fa6',
  earth: '#7a6a44',
  spirit: '#8e6fb0',
  shadow: '#3a3242',
}

export function BattleMat({
  className,
  theme = 'earth',
}: {
  className?: string
  /** Tints the mat toward the encounter's type. */
  theme?: EnergyType
}) {
  const uid = useId().replace(/:/g, '')
  const id = (n: string) => `${n}-${uid}`
  const tint = TINT[theme]

  return (
    <svg
      viewBox="0 0 390 620"
      preserveAspectRatio="xMidYMid slice"
      className={cx('absolute inset-0 w-full h-full', className)}
      aria-hidden="true"
    >
      <defs>
        <radialGradient id={id('ground')} cx="50%" cy="50%" r="72%">
          <stop offset="0%" stopColor="#2b2317" />
          <stop offset="58%" stopColor="#191308" />
          <stop offset="100%" stopColor="#0d0a05" />
        </radialGradient>

        <radialGradient id={id('clash')} cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor={tint} stopOpacity="0.26" />
          <stop offset="70%" stopColor={tint} stopOpacity="0.06" />
          <stop offset="100%" stopColor={tint} stopOpacity="0" />
        </radialGradient>

        <linearGradient id={id('gold')} gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="390" y2="620">
          <stop offset="0%" stopColor="#e8cf9e" />
          <stop offset="35%" stopColor="#b08751" />
          <stop offset="65%" stopColor="#7a5a2e" />
          <stop offset="100%" stopColor="#d9b478" />
        </linearGradient>
      </defs>

      <rect width="390" height="620" fill={`url(#${id('ground')})`} />

      {/* The clash, dead centre. */}
      <circle cx="195" cy="310" r="150" fill={`url(#${id('clash')})`} />
      <circle
        cx="195"
        cy="310"
        r="86"
        fill="none"
        stroke={`url(#${id('gold')})`}
        strokeWidth="1.4"
        opacity="0.5"
      />
      <circle
        cx="195"
        cy="310"
        r="72"
        fill="none"
        stroke={`url(#${id('gold')})`}
        strokeWidth="0.7"
        opacity="0.3"
      />

      {/* The halfway line, broken at the centre so the ring reads as a gate. */}
      <path
        d="M8 310 H109 M281 310 H382"
        stroke={`url(#${id('gold')})`}
        strokeWidth="1.2"
        opacity="0.5"
      />

      {/* Filigree corner marks, mirrored into all four corners. */}
      {[
        'translate(16 16)',
        'translate(374 16) scale(-1 1)',
        'translate(16 604) scale(1 -1)',
        'translate(374 604) scale(-1 -1)',
      ].map((transform, i) => (
        <path
          key={i}
          transform={transform}
          d="M0 34 Q0 0 34 0 M6 30 Q6 6 30 6"
          stroke={`url(#${id('gold')})`}
          strokeWidth="1.3"
          fill="none"
          opacity="0.55"
        />
      ))}

      {/* An inner rule, so the mat has an edge rather than bleeding out. */}
      <rect
        x="7"
        y="7"
        width="376"
        height="606"
        rx="16"
        fill="none"
        stroke={`url(#${id('gold')})`}
        strokeWidth="1"
        opacity="0.35"
      />
    </svg>
  )
}

/** An empty slot outline, sized by its container. */
export function SlotOutline({ label }: { label?: string }) {
  return (
    <span
      className="absolute inset-0 rounded-[8%] pointer-events-none grid place-items-center"
      style={{
        border: '1.5px dashed rgba(229,192,140,.26)',
      }}
    >
      {label && (
        <span
          className="text-[9px] tracking-[0.16em] uppercase"
          style={{ color: 'rgba(229,192,140,.34)' }}
        >
          {label}
        </span>
      )}
    </span>
  )
}
