import { useId } from 'react'
import type { EnergyType, PackDefinition } from '@/game/types'
import { cx } from '@/lib/cx'
import { TreeGlyph } from './tree'

/**
 * A booster pack wrapper, drawn entirely in SVG.
 *
 * There is no pack photography to work from, and a foil wrapper is mostly
 * gradient, filigree and light anyway — the things SVG is best at. Drawing it
 * means every pack is one file, scales to any size without artefacts, and
 * themes itself from its energy type instead of needing three separate images.
 *
 * Construction, top to bottom: a foil header carrying the wordmark and set
 * code, a radiant burst behind a tree-of-life crest, and a name banner across
 * the foot. A diagonal sheen sells the foil.
 */

/**
 * Per-type wrapper palette. Every pack keeps a dark ground so the gold foil
 * and the crest stay the brightest things on it — a light-typed pack rendered
 * light would lose its filigree entirely, so Light gets a deep amber ground and
 * spends its brightness on the burst instead.
 */
const THEME: Record<EnergyType, { deep: string; mid: string; glow: string }> = {
  light: { deep: '#3a2a06', mid: '#c9a01a', glow: '#ffeCa8' },
  fire: { deep: '#3d130a', mid: '#a8391f', glow: '#ff9a63' },
  water: { deep: '#0c2434', mid: '#256b91', glow: '#8ad2f2' },
  earth: { deep: '#241d0f', mid: '#6b5a30', glow: '#e2c684' },
  spirit: { deep: '#241539', mid: '#6b4891', glow: '#d0b0f5' },
  shadow: { deep: '#100c17', mid: '#3a3049', glow: '#a394bd' },
}

interface Props {
  pack: PackDefinition
  setCode: string
  className?: string
}

export function PackWrapper({ pack, setCode, className }: Props) {
  // Gradient ids must be unique per instance or several packs on one screen
  // share whichever definition rendered last.
  const uid = useId().replace(/:/g, '')
  const t = THEME[pack.theme]

  const id = (n: string) => `${n}-${uid}`

  return (
    <svg
      viewBox="0 0 300 440"
      className={cx('block w-full h-auto', className)}
      role="img"
      aria-label={`${pack.name} booster pack`}
    >
      <defs>
        <linearGradient id={id('ground')} x1="0" y1="0" x2="0.35" y2="1">
          <stop offset="0%" stopColor={t.deep} />
          <stop offset="45%" stopColor="#120e08" />
          <stop offset="100%" stopColor={t.deep} />
        </linearGradient>

        <radialGradient id={id('burst')} cx="50%" cy="46%" r="52%">
          <stop offset="0%" stopColor={t.glow} stopOpacity="0.92" />
          <stop offset="38%" stopColor={t.mid} stopOpacity="0.5" />
          <stop offset="100%" stopColor={t.mid} stopOpacity="0" />
        </radialGradient>

        <linearGradient id={id('gold')} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#f4e0b8" />
          <stop offset="28%" stopColor="#c49a5c" />
          <stop offset="52%" stopColor="#8d5f2a" />
          <stop offset="74%" stopColor="#e8cf9e" />
          <stop offset="100%" stopColor="#a8763c" />
        </linearGradient>

        {/*
          The crest gets its own gold in user-space units. An objectBoundingBox
          gradient is not painted at all when the referencing shape has zero
          width or height, which silently drops the tree's vertical trunk.
          These coordinates are in the crest group's scaled 24-unit space.
        */}
        <linearGradient
          id={id('crestGold')}
          gradientUnits="userSpaceOnUse"
          x1="6"
          y1="4"
          x2="18"
          y2="22"
        >
          <stop offset="0%" stopColor="#f4e0b8" />
          <stop offset="35%" stopColor="#d9b478" />
          <stop offset="62%" stopColor="#a8763c" />
          <stop offset="100%" stopColor="#e8cf9e" />
        </linearGradient>

        <linearGradient id={id('sheen')} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#fff" stopOpacity="0" />
          <stop offset="46%" stopColor="#fff" stopOpacity="0.16" />
          <stop offset="54%" stopColor="#fff" stopOpacity="0.16" />
          <stop offset="100%" stopColor="#fff" stopOpacity="0" />
        </linearGradient>

        <linearGradient id={id('banner')} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#1c1610" />
          <stop offset="100%" stopColor="#0d0a06" />
        </linearGradient>

        <clipPath id={id('clip')}>
          <rect x="0" y="0" width="300" height="440" rx="14" />
        </clipPath>
      </defs>

      <g clipPath={`url(#${id('clip')})`}>
        <rect width="300" height="440" fill={`url(#${id('ground')})`} />

        {/* Radiant burst behind the crest. */}
        <circle cx="150" cy="205" r="150" fill={`url(#${id('burst')})`} />

        {/* Light rays, thinning as they fan out. */}
        <g opacity="0.32">
          {Array.from({ length: 16 }, (_, i) => {
            const a = (i / 16) * Math.PI * 2
            const w = i % 2 ? 3.5 : 7
            return (
              <path
                key={i}
                d={`M150 205 L${150 + Math.cos(a - 0.03) * 210} ${205 + Math.sin(a - 0.03) * 210}
                    L${150 + Math.cos(a + 0.03) * 210} ${205 + Math.sin(a + 0.03) * 210} Z`}
                fill={t.glow}
                opacity={w / 10}
              />
            )
          })}
        </g>

        {/* Foil header. */}
        <rect x="0" y="0" width="300" height="46" fill="#0e0b07" opacity="0.92" />
        <rect x="0" y="45" width="300" height="1.5" fill={`url(#${id('gold')})`} />
        <text
          x="20"
          y="30"
          fill={`url(#${id('gold')})`}
          fontFamily="Cinzel, Georgia, serif"
          fontSize="15"
          fontWeight="700"
          letterSpacing="3"
        >
          COVENANT
        </text>
        <rect x="243" y="12" width="42" height="22" rx="5" fill="#1c1610" />
        <rect
          x="243"
          y="12"
          width="42"
          height="22"
          rx="5"
          fill="none"
          stroke={`url(#${id('gold')})`}
          strokeWidth="1"
        />
        <text
          x="264"
          y="27"
          fill="#e5c08c"
          fontFamily="Inter, sans-serif"
          fontSize="11"
          fontWeight="600"
          textAnchor="middle"
        >
          {setCode}
        </text>

        {/* Tree-of-life crest. */}
        <g transform="translate(150 205)">
          <circle r="70" fill="#100c07" opacity="0.55" />
          <circle r="70" fill="none" stroke={`url(#${id('gold')})`} strokeWidth="2.5" />
          <circle r="62" fill="none" stroke={`url(#${id('gold')})`} strokeWidth="0.8" opacity="0.6" />
          {/* Scaled up 4.4×, so the stroke is divided to keep its icon weight.
              The canopy circle is dropped here — the medallion ring already
              encloses the mark, and two concentric circles read as a target. */}
          {/* Scaled 4.6×, so stroke width is divided to keep its icon weight,
              and the origin shifts to the mark's visual centre rather than the
              geometric centre of its 24×24 box. The canopy ring is kept: it
              sits well inside the medallion, reading as a seal rather than as
              two competing circles. */}
          <g transform="scale(4.6) translate(-12 -13.4)">
            <TreeGlyph
              width={1.5 / 4.6}
              fruitRadius={0.85}
              paint={`url(#${id('crestGold')})`}
            />
          </g>
        </g>

        {/* Name banner. */}
        <path d="M0 336 L300 320 L300 440 L0 440 Z" fill={`url(#${id('banner')})`} />
        <path d="M0 336 L300 320" stroke={`url(#${id('gold')})`} strokeWidth="2" fill="none" />
        <text
          x="150"
          y="392"
          fill={`url(#${id('gold')})`}
          fontFamily="Cinzel, Georgia, serif"
          fontSize={pack.name.length > 12 ? 27 : 33}
          fontWeight="700"
          textAnchor="middle"
          letterSpacing="1"
        >
          {pack.name.toUpperCase()}
        </text>
        <text
          x="150"
          y="415"
          fill="#8a7454"
          fontFamily="Inter, sans-serif"
          fontSize="10.5"
          fontWeight="500"
          textAnchor="middle"
          letterSpacing="2.6"
        >
          BOOSTER PACK
        </text>

        {/* Corner filigree. */}
        {[
          { t: 'translate(12 58)', s: 1 },
          { t: 'translate(288 58) scale(-1 1)', s: 1 },
        ].map((c, i) => (
          <path
            key={i}
            transform={c.t}
            d="M0 26 Q0 0 26 0 M4 22 Q4 4 22 4"
            stroke={`url(#${id('gold')})`}
            strokeWidth="1.6"
            fill="none"
            opacity="0.85"
          />
        ))}

        {/* Foil sheen, angled across the whole wrapper. */}
        <rect
          x="-160"
          y="0"
          width="140"
          height="440"
          fill={`url(#${id('sheen')})`}
          transform="rotate(18 150 220) translate(300 0)"
        />

        {/* Inner edge so the pack reads as an object, not a flat rectangle. */}
        <rect
          x="0.75"
          y="0.75"
          width="298.5"
          height="438.5"
          rx="13.5"
          fill="none"
          stroke="#000"
          strokeOpacity="0.5"
          strokeWidth="1.5"
        />
      </g>
    </svg>
  )
}
