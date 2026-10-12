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

/** The clash ring's own tint per type — exported so a small swatch picker
 *  (DeckBuilder's playmat row) can key a quick-glance colour dot off the
 *  exact same value, since the full mat's own glow is too small a fraction
 *  of a thumbnail-sized render to read as a colour at a glance on its own. */
export const MAT_TINT: Record<EnergyType, string> = {
  light: '#f2d675',
  fire: '#d2543a',
  water: '#3d7fa6',
  earth: '#7a6a44',
  spirit: '#8e6fb0',
  shadow: '#3a3242',
}

/**
 * A single sprig of the Covenant seal's own tree — the same silhouette the
 * card back carries (trunk, two branch pairs, a top twig, root ticks at the
 * base), simplified to a line-weight a scattered watermark can actually
 * read at. Drawn once in `<defs>` and stamped out by `<use>` below rather
 * than repeated inline, the same reuse the corner marks further down
 * already get from being one `<path>` mirrored by transform instead of four.
 * Centred on its own origin so each stamp's `rotate`/`scale` in the scatter
 * below turns it in place rather than around a corner.
 */
const TREE_MARK =
  'M0 14 V-10 M0 14 L-4 18 M0 14 L0 19 M0 14 L4 18 M0 6 L-7 -1 M0 6 L7 -1 M0 -2 L-6 -9 M0 -2 L6 -9 M0 -10 L0 -16'
const TREE_LEAVES: [number, number][] = [
  [-7, -1],
  [7, -1],
  [-6, -9],
  [6, -9],
  [0, -16],
]

/**
 * Where each stamp lands — hand-placed rather than seeded at random, so the
 * pattern is fixed art rather than something that reshuffles if this ever
 * re-renders. Kept clear of the clash rings themselves (within ~110px of
 * centre) and off the very edge (the filigree's own territory), scaled and
 * rotated unevenly so the field reads as scattered rather than a stamped
 * grid.
 */
const TREE_SCATTER: { x: number; y: number; r: number; s: number; o: number }[] = [
  { x: 55, y: 70, r: -12, s: 0.9, o: 0.09 },
  { x: 320, y: 55, r: 18, s: 1.1, o: 0.08 },
  { x: 150, y: 108, r: 8, s: 0.7, o: 0.07 },
  { x: 262, y: 132, r: -20, s: 1.0, o: 0.09 },
  { x: 40, y: 200, r: 15, s: 1.2, o: 0.08 },
  { x: 352, y: 222, r: -8, s: 0.8, o: 0.07 },
  { x: 96, y: 252, r: -22, s: 0.65, o: 0.06 },
  { x: 110, y: 30, r: 5, s: 0.6, o: 0.06 },
  { x: 300, y: 382, r: 10, s: 0.9, o: 0.08 },
  { x: 60, y: 422, r: -15, s: 1.0, o: 0.09 },
  { x: 332, y: 440, r: 20, s: 0.75, o: 0.07 },
  { x: 140, y: 482, r: -6, s: 1.15, o: 0.08 },
  { x: 252, y: 500, r: 14, s: 0.85, o: 0.07 },
  { x: 190, y: 540, r: -18, s: 0.7, o: 0.06 },
  { x: 45, y: 562, r: 22, s: 0.95, o: 0.09 },
  { x: 340, y: 572, r: -10, s: 1.05, o: 0.08 },
  { x: 280, y: 592, r: -14, s: 0.8, o: 0.07 },
  { x: 200, y: 172, r: 25, s: 0.55, o: 0.05 },
]

/** Linear interpolation between two `#rrggbb` hex colours, `t` in [0, 1]. */
function mix(a: string, b: string, t: number): string {
  const pa = parseInt(a.slice(1), 16)
  const pb = parseInt(b.slice(1), 16)
  const chan = (shift: number) => {
    const va = (pa >> shift) & 0xff
    const vb = (pb >> shift) & 0xff
    return Math.round(va + (vb - va) * t)
      .toString(16)
      .padStart(2, '0')
  }
  return `#${chan(16)}${chan(8)}${chan(0)}`
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
  const tint = MAT_TINT[theme]

  // The frame — corner filigree and the inner edge rule — stays pure gold
  // regardless of theme, the same metal every other border in the game
  // uses: it reads as the table's own edge, not part of the match. The
  // *field* is what carries the theme, in two registers: a colour-graded
  // wash across the ground itself (barely there near the centre, heaviest
  // toward the corners, so it frames rather than competes with the clash
  // glow) and an accent metal — gold folded toward the tint — for the
  // elements that actually ring the clash: the two circles and the
  // halfway line gating them. Below `clash`, which still carries the
  // strongest, purest hit of the colour right where the action lands.
  const groundNear = mix('#2b2317', tint, 0.08)
  const groundMid = mix('#191308', tint, 0.16)
  const groundFar = mix('#0d0a05', tint, 0.24)
  const accentNear = mix('#e8cf9e', tint, 0.4)
  const accentMid = mix('#b08751', tint, 0.4)
  const accentDeep = mix('#7a5a2e', tint, 0.4)
  const accentFar = mix('#d9b478', tint, 0.4)

  return (
    <svg
      viewBox="0 0 390 620"
      preserveAspectRatio="xMidYMid slice"
      className={cx('absolute inset-0 w-full h-full', className)}
      aria-hidden="true"
    >
      <defs>
        <radialGradient id={id('ground')} cx="50%" cy="50%" r="72%">
          <stop offset="0%" stopColor={groundNear} />
          <stop offset="58%" stopColor={groundMid} />
          <stop offset="100%" stopColor={groundFar} />
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

        <linearGradient id={id('accent')} gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="390" y2="620">
          <stop offset="0%" stopColor={accentNear} />
          <stop offset="35%" stopColor={accentMid} />
          <stop offset="65%" stopColor={accentDeep} />
          <stop offset="100%" stopColor={accentFar} />
        </linearGradient>

        <g id={id('tree')}>
          <path d={TREE_MARK} stroke={`url(#${id('accent')})`} strokeWidth="1" strokeLinecap="round" fill="none" />
          {TREE_LEAVES.map(([lx, ly], i) => (
            <circle key={i} cx={lx} cy={ly} r="1.5" fill={`url(#${id('accent')})`} />
          ))}
        </g>
      </defs>

      <rect width="390" height="620" fill={`url(#${id('ground')})`} />

      {/* The seal's own tree, scattered across the field — part of the
          ground texture rather than the structural frame, so it's drawn in
          `accent` (gold folded toward the theme) alongside the clash rings
          and halfway line, not the frame's plain `gold`. */}
      {TREE_SCATTER.map((t, i) => (
        <use
          key={i}
          href={`#${id('tree')}`}
          transform={`translate(${t.x} ${t.y}) rotate(${t.r}) scale(${t.s})`}
          opacity={t.o}
        />
      ))}

      {/* The clash, dead centre. */}
      <circle cx="195" cy="310" r="150" fill={`url(#${id('clash')})`} />
      <circle
        cx="195"
        cy="310"
        r="86"
        fill="none"
        stroke={`url(#${id('accent')})`}
        strokeWidth="1.4"
        opacity="0.5"
      />
      <circle
        cx="195"
        cy="310"
        r="72"
        fill="none"
        stroke={`url(#${id('accent')})`}
        strokeWidth="0.7"
        opacity="0.3"
      />

      {/* The halfway line, broken at the centre so the ring reads as a gate. */}
      <path
        d="M8 310 H109 M281 310 H382"
        stroke={`url(#${id('accent')})`}
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

/** An empty slot outline, sized by its container.
 *
 *  Carries the stable `cov-slot-outline` class a drag handler targets
 *  directly (see global.css) to show a live "will this land here?" highlight
 *  while a card in hand is being dragged over it — toggled straight on the
 *  DOM node rather than through a React prop, so a drag in progress never has
 *  to re-render the board just to light up the slot it's hovering. */
export function SlotOutline({ label }: { label?: string }) {
  return (
    <span
      className="cov-slot-outline absolute inset-0 rounded-[8%] pointer-events-none grid place-items-center"
      style={{ border: '1.5px dashed rgba(229,192,140,.26)' }}
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
