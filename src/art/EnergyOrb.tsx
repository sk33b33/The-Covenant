import { useId } from 'react'
import type { EnergyType } from '@/game/types'
import { ENERGY_LABEL } from '@/game/types'

/**
 * An energy orb.
 *
 * These render at 13–16 px inside attack costs, which is the smallest thing in
 * the game that must stay unambiguous — misreading a cost misplays a turn. So
 * each glyph is distinguished by silhouette first and colour second: a
 * six-pointed star, a flame, a droplet, a mountain, a dove and a crescent are
 * all separable in monochrome, which also means the set survives colour-blind
 * players and a greyscale screenshot.
 */

const GLYPH: Record<EnergyType, string> = {
  // Star of light, six points.
  light: 'M12 3.4 13.9 9.4 20 8.2 15.7 12.6 19.4 17.8 13.2 16.2 12 21.6 10.8 16.2 4.6 17.8 8.3 12.6 4 8.2 10.1 9.4Z',
  // Flame with an inner curl.
  fire: 'M12 3c3.2 3.4 5.6 6.3 5.6 9.6a5.6 5.6 0 0 1-11.2 0C6.4 9.3 8.8 6.4 12 3Zm0 7.4c-1.4 1.4-2.1 2.5-2.1 3.7a2.1 2.1 0 0 0 4.2 0c0-1.2-.7-2.3-2.1-3.7Z',
  // Droplet.
  water: 'M12 3.2c3.6 4.2 6 7.3 6 10.2a6 6 0 0 1-12 0c0-2.9 2.4-6 6-10.2Z',
  // Mountain with a foothill.
  earth: 'M2.6 19.4 9.6 6.2l4.6 8.4 2-3.2 5.2 8Z',
  // Dove in flight.
  spirit:
    'M4 12.6c3.4.4 5.6-.6 7.4-2.6 1-1.2 1.6-2.6 1.6-4.2 2 1 3.4 2.8 4 5.2 1.4.2 2.4.8 3 1.8-1 .6-2 .8-3.2.8-.6 3.2-3 5.4-6.4 5.8.8-1.2 1.2-2.4 1.2-3.8-3 .2-5.4-1-7.6-3Z',
  // Crescent, cut so it cannot be mistaken for the droplet.
  shadow: 'M15.2 3.4a9 9 0 1 0 5.2 15.8A9.6 9.6 0 0 1 15.2 3.4Z',
}

/** Ground and glyph colours per type, tuned so the glyph always carries contrast. */
const PAINT: Record<EnergyType, { ground: string; edge: string; glyph: string }> = {
  light: { ground: '#f4d979', edge: '#a8860f', glyph: '#4a3a06' },
  fire: { ground: '#d2543a', edge: '#7d2413', glyph: '#fff0e6' },
  water: { ground: '#3d7fa6', edge: '#1a4560', glyph: '#eaf6fd' },
  earth: { ground: '#8a7850', edge: '#453a20', glyph: '#fdf7e6' },
  spirit: { ground: '#8e6fb0', edge: '#4d3268', glyph: '#f7effd' },
  shadow: { ground: '#4a4056', edge: '#1a1622', glyph: '#e2dcee' },
}

interface Props {
  type: EnergyType
  /** A number is px; a string is passed through, so callers can size in `cqw`. */
  size?: number | string
  className?: string
  /** Colourless: any type satisfies this cost. */
  any?: boolean
}

export function EnergyOrb({ type, size = 16, className, any }: Props) {
  const uid = useId().replace(/:/g, '')
  const p = PAINT[type]

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      className={className}
      role="img"
      aria-label={any ? 'Any energy' : `${ENERGY_LABEL[type]} energy`}
    >
      <defs>
        <radialGradient id={`orb-${uid}`} cx="38%" cy="30%" r="76%">
          <stop offset="0%" stopColor="#fff" stopOpacity="0.45" />
          <stop offset="52%" stopColor={any ? '#cfc4ad' : p.ground} />
          <stop offset="100%" stopColor={any ? '#8d8069' : p.edge} />
        </radialGradient>
      </defs>

      <circle cx="12" cy="12" r="11" fill={`url(#orb-${uid})`} />
      <circle
        cx="12"
        cy="12"
        r="11"
        fill="none"
        stroke={any ? '#5c523c' : p.edge}
        strokeWidth="1.4"
      />

      {any ? (
        // Colourless is a plain star, matching nothing and satisfied by anything.
        <path
          d="M12 6.2 13.4 10.6 18 10.6 14.3 13.3 15.7 17.7 12 15 8.3 17.7 9.7 13.3 6 10.6 10.6 10.6Z"
          fill="#f2ece0"
          stroke="#5c523c"
          strokeWidth="0.6"
          strokeLinejoin="round"
        />
      ) : (
        <path d={GLYPH[type]} fill={p.glyph} />
      )}
    </svg>
  )
}

/** A row of orbs for an attack cost. `null` entries are colourless. */
export function EnergyCost({
  cost,
  size = 15,
  className,
}: {
  cost: (EnergyType | null)[]
  size?: number
  className?: string
}) {
  return (
    <span className={className} style={{ display: 'inline-flex', gap: size * 0.1 }}>
      {cost.map((c, i) =>
        c === null ? (
          <EnergyOrb key={i} type="light" size={size} any />
        ) : (
          <EnergyOrb key={i} type={c} size={size} />
        ),
      )}
    </span>
  )
}
