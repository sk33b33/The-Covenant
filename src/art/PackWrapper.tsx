import type { EnergyType, PackDefinition } from '@/game/types'
import { asset } from '@/lib/asset'
import { cx } from '@/lib/cx'
import './packWrapper.css'

/**
 * A booster pack wrapper.
 *
 * Genesis ships three packs, each with its own dedicated foil stock —
 * Creation in cream/ivory, the Flood in black, the Promise in brown
 * leather. All three photos come from the same shoot (identical medallion
 * and border placement, just a different colourway) and all three leave
 * the same band blank beneath "Card Pack" for a pack's own name — which is
 * what lets one shared overlay line up correctly on every one of them. A
 * pack not listed in `PACK_PHOTO` falls back to the original shared shot,
 * for whatever the set adds next before it has dedicated art of its own.
 */

const PACK_PHOTO: Record<string, string> = {
  creation: 'art/packs/wrapper-creation.webp',
  'the-flood': 'art/packs/wrapper-flood.webp',
  'the-promise': 'art/packs/wrapper-promise.webp',
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
  return (
    <div className={cx('cov-pack', className)}>
      <img
        src={asset(PACK_PHOTO[pack.id] ?? 'art/packs/wrapper.webp')}
        alt={`${pack.name} booster pack`}
        className="cov-pack__photo"
        loading="lazy"
        decoding="async"
      />

      <div className="cov-pack__plate">
        <div className="cov-pack__glow" style={{ '--pack-glow': `${TYPE_GLOW[pack.theme]}33` } as React.CSSProperties} />
        <span className="cov-pack__gem" />
        <span className="cov-pack__name gold-leaf">{pack.name.toUpperCase()}</span>
        <span className="cov-pack__gem" />
      </div>
    </div>
  )
}
