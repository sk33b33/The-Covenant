/**
 * The tree of life — the game's mark.
 *
 * Built from explicit primitives rather than one clever path, because this
 * renders anywhere from 20 px (tab bar, card type orb) to 300 px (booster
 * wrapper, card back) and a filled silhouette collapses into a blob at the
 * small end while a bare skeleton reads as a rune at the large end.
 *
 * The construction is deliberately symmetrical — a heraldic tree, not a
 * naturalistic one — with fruit at the branch tips supplying the canopy mass
 * that makes it legible small.
 *
 * Stroke width is passed in rather than fixed, so a scaled-up instance divides
 * its width by the scale and keeps the same visual weight.
 */

interface TreeGlyphProps {
  /** Stroke width in the 24×24 coordinate space. */
  width?: number
  /** Enclosing canopy ring. Drop it when an outer medallion already encloses the mark. */
  canopy?: boolean
  /** Fruit at the branch tips. */
  fruit?: boolean
  /**
   * Fruit radius in glyph units. Deliberately independent of `width` — a
   * scaled-up instance divides its stroke width, and tying the fruit to it
   * would shrink them to nothing exactly where they matter most.
   */
  fruitRadius?: number
  /**
   * SVG paint for the mark. Defaults to `currentColor` so it inherits text
   * colour in the icon set. Pass an explicit `url(#gradient)` when painting it
   * with gold leaf — the CSS `color` property cannot hold a paint server
   * reference, so `currentColor` silently falls back there.
   */
  paint?: string
}

/** Branch tips, which double as fruit positions. */
const TIPS: [number, number][] = [
  [8.5, 11.1],
  [15.5, 11.1],
  [9.4, 8.5],
  [14.6, 8.5],
  [12, 5.9],
]

export function TreeGlyph({
  width = 1.7,
  canopy = true,
  fruit = true,
  fruitRadius = 1.15,
  paint = 'currentColor',
}: TreeGlyphProps) {
  return (
    <g
      fill="none"
      stroke={paint}
      strokeWidth={width}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {canopy && <circle cx="12" cy="8.6" r="6.7" />}

      {/* Trunk and central leader. */}
      <path d="M12 21.6V5.9" />

      {/* Two symmetrical pairs of branches. */}
      <path d="M12 14.5 8.5 11.1M12 14.5 15.5 11.1" />
      <path d="M12 11.3 9.4 8.5M12 11.3 14.6 8.5" />

      {/* Roots. */}
      <path d="M12 21.6 9.4 20M12 21.6 14.6 20" />

      {fruit &&
        TIPS.map(([cx, cy], i) => (
          <circle key={i} cx={cx} cy={cy} r={fruitRadius} fill={paint} stroke="none" />
        ))}
    </g>
  )
}
