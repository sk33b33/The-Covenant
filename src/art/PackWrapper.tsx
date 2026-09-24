import type { EnergyType, PackDefinition } from '@/game/types'
import { asset } from '@/lib/asset'
import { cx } from '@/lib/cx'
import './packWrapper.css'

/**
 * A booster pack wrapper.
 *
 * Genesis ships three packs. Two now carry their own dedicated foil stock —
 * Creation in a cream/ivory colourway, the Flood in black — with the
 * Promise still on the original shared brown leather shot as the default
 * for anything not listed in `PACK_PHOTO`. All three photos come from the
 * same shoot (identical medallion, name band and stat panel placement,
 * just a different colourway), which is what lets one shared name overlay
 * and glow still line up correctly on every one of them.
 */

/** Per-pack photography. A pack not listed here falls back to the shared
 *  shot every pack used before dedicated art existed for it. */
const PACK_PHOTO: Record<string, string> = {
  creation: 'art/packs/wrapper-creation.webp',
  'the-flood': 'art/packs/wrapper-flood.webp',
}

/** A faint colour under the nameplate, tied to the pack's exclusive type. */
const TYPE_GLOW: Record<EnergyType, string> = {
  light: '#ffeca8',
  fire: '#ff9a63',
  water: '#8ad2f2',
  earth: '#e2c684',
  spirit: '#d0b0f5',
  shadow: '#a394bd',
}

interface Props {
  pack: PackDefinition
  className?: string
}

export function PackWrapper({ pack, className }: Props) {
  const dedicatedPhoto = PACK_PHOTO[pack.id]

  return (
    <div className={cx('cov-pack', className)}>
      <img
        src={asset(dedicatedPhoto ?? 'art/packs/wrapper.webp')}
        alt={`${pack.name} booster pack`}
        className="cov-pack__photo"
        loading="lazy"
        decoding="async"
      />

      {/*
        The plate's dark pooling glow was tuned to sit on the shared shot's
        brown leather, where darkening it further just deepens an already
        dark colour. Creation's own dedicated photo is cream — the same
        darkening reads as a flat grey smudge there, not a shadow, since
        there's no way to darken a light background enough to cover the
        photo's own baked-in "Card Pack" label without the darkening itself
        becoming the visible thing. Dedicated art skips the plate rather
        than fighting that: it already carries its own finished nameplate.
      */}
      {!dedicatedPhoto && (
        <div className="cov-pack__plate">
          <div className="cov-pack__glow" style={{ '--pack-glow': `${TYPE_GLOW[pack.theme]}33` } as React.CSSProperties} />
          <span className="cov-pack__gem" />
          <span className="cov-pack__name gold-leaf">{pack.name.toUpperCase()}</span>
          <span className="cov-pack__gem" />
        </div>
      )}
    </div>
  )
}
