import type { EnergyType, PackDefinition } from '@/game/types'
import { asset } from '@/lib/asset'
import { cx } from '@/lib/cx'
import './packWrapper.css'

/**
 * A booster pack wrapper.
 *
 * Genesis ships three packs that share one card pool and one piece of
 * wrapper photography — the same product shot, reused the way a real set
 * with several themed wrappers would reuse its foil stock. The name struck
 * across the middle is what tells them apart, not the wrapper itself.
 */

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
        src={asset('art/packs/wrapper.webp')}
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
