import { useState } from 'react'
import { EnergyCost, EnergyOrb } from '@/art/EnergyOrb'
import { RarityMark } from '@/art/RarityMark'
import { isFigure, WEAKNESS, type Card as CardData, type FigureCard } from '@/game/types'
import { asset } from '@/lib/asset'
import { cx } from '@/lib/cx'
import './card.css'

/**
 * The card frame.
 *
 * The supplied renders are complete cards with an empty text box and no HP, so
 * the game crops out their artwork window and redraws the frame here. That is
 * what allows HP, attack costs, damage and rarity to render as live text — and
 * what lets a balance change be a one-line data edit instead of new art.
 *
 * Sizing is entirely container-relative (see card.css), so this one component
 * serves the collection grid, the battle mat and the detail view without
 * size-specific rules.
 */

const STAGE_LABEL: Record<FigureCard['stage'], string> = {
  basic: 'Basic',
  'ascended-1': 'Ascended I',
  'ascended-2': 'Ascended II',
}

const HOLO_RARITIES = new Set(['anointed', 'illustration', 'sacred', 'crown'])

interface Props {
  card: CardData
  /** Hides rules text and footer; for thumbnails below ~90px. */
  compact?: boolean
  /** Suppresses the sheen on chase rarities. */
  noHolo?: boolean
  /** On the battle mat: hides the printed HP, which the board draws live. */
  inPlay?: boolean
  className?: string
  /** Inline style hook, used by the detail view's tilt. */
  style?: React.CSSProperties
}

export function Card({ card, compact, noHolo, inPlay, className, style }: Props) {
  const [artFailed, setArtFailed] = useState(false)

  const figure = isFigure(card) ? card : null
  const anointed = figure?.anointed ?? false
  const holo = !noHolo && HOLO_RARITIES.has(card.rarity)

  // Non-figures have no energy type of their own; they take the frame's gold.
  const type = figure?.type ?? 'light'

  const nameClass =
    card.name.length > 20
      ? 'cov-card__name--longer'
      : card.name.length > 13
        ? 'cov-card__name--long'
        : ''

  return (
    <article
      className={cx(
        'cov-card',
        anointed && 'cov-card--anointed',
        holo && 'cov-card--holo',
        compact && 'cov-card--compact',
        inPlay && 'cov-card--in-play',
        className,
      )}
      style={style}
      aria-label={`${card.name}, ${figure ? `${figure.hp} HP` : card.kind}`}
    >
      <div className="cov-card__ground" />

      {/* ------------------------------------------------------ nameplate */}
      <header className="cov-card__nameplate">
        {figure && figure.stage !== 'basic' && (
          <span className="cov-card__stage">{STAGE_LABEL[figure.stage]}</span>
        )}
        {!figure && <span className="cov-card__stage">{card.kind}</span>}

        <h3 className={cx('cov-card__name', nameClass)}>{card.name}</h3>

        {figure && (
          <span className="cov-card__hp">
            <span className="cov-card__hp-label">HP</span>
            <span className="cov-card__hp-value">{figure.hp}</span>
          </span>
        )}
      </header>

      {/* --------------------------------------------------------- artwork */}
      <div className="cov-card__art">
        {artFailed ? (
          <div
            className="cov-card__placeholder"
            style={{
              background: `radial-gradient(circle at 50% 34%, var(--energy-${type}) -40%, transparent 62%), linear-gradient(168deg,#2a2112,#14100a)`,
            }}
          >
            <span className="cov-card__placeholder-initial">{card.name.charAt(0)}</span>
          </div>
        ) : (
          <img
            src={asset(`art/cards/${card.id}.webp`)}
            alt=""
            loading="lazy"
            decoding="async"
            onError={() => setArtFailed(true)}
          />
        )}
      </div>

      {/* -------------------------------------------------------- type orb */}
      <div className="cov-card__orb">
        <EnergyOrb type={type} size="11.5cqw" />
      </div>

      {/* --------------------------------------------------------- rules */}
      {!compact && (
        <div className="cov-card__body">
          {/* Narrowed on `card` rather than the `figure` alias, so TypeScript
              can see that the other branch is a Covenant or Relic with prose. */}
          {isFigure(card) ? (
            card.attacks.map((atk) => (
              <div className="cov-card__attack" key={atk.name}>
                <span className="cov-card__attack-cost">
                  <EnergyCost cost={atk.cost} size={14} />
                </span>
                <span className="cov-card__attack-main">
                  <span className="cov-card__attack-name">{atk.name}</span>
                  {atk.text && <span className="cov-card__attack-text">{atk.text}</span>}
                </span>
                {atk.damage > 0 && <span className="cov-card__attack-damage">{atk.damage}</span>}
              </div>
            ))
          ) : (
            <>
              <p className="cov-card__rules">{card.text}</p>
              {card.flavor && <p className="cov-card__flavor">{card.flavor}</p>}
            </>
          )}
        </div>
      )}

      {/* --------------------------------------------------------- footer */}
      {!compact && (
        <footer className="cov-card__footer">
          {figure && (
            <>
              <span className="cov-card__stat">
                <span className="cov-card__stat-label">Weak</span>
                <EnergyOrb type={WEAKNESS[figure.type]} size={13} />
              </span>
              <span className="cov-card__stat">
                <span className="cov-card__stat-label">Retreat</span>
                <EnergyCost cost={Array(figure.retreat).fill(null)} size={13} />
              </span>
            </>
          )}
          <span className="cov-card__footer-spacer" />
          <span className="cov-card__set">{card.set.slice(0, 3).toUpperCase()}</span>
          <RarityMark rarity={card.rarity} size={10} />
        </footer>
      )}
    </article>
  )
}

