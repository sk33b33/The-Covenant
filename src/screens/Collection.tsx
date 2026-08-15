import { useMemo, useState } from 'react'
import { motion } from 'framer-motion'
import { BinderIcon, CloseIcon, SearchIcon } from '@/art/icons'
import { EnergyOrb } from '@/art/EnergyOrb'
import { PressableCard } from '@/components/card/PressableCard'
import { usePeek } from '@/store/peek'
import { EmptyState, Progress } from '@/components/ui'
import { CARDS } from '@/data/cards'
import { GENESIS } from '@/data/sets'
import {
  ENERGY_TYPES,
  RARITY_ORDER,
  isFigure,
  type Card as CardData,
  type EnergyType,
} from '@/game/types'
import { useCollection } from '@/store/collection'
import { cx } from '@/lib/cx'

/**
 * The binder.
 *
 * Shows the whole set, not just what you own, because a collection screen that
 * hides its gaps gives you nothing to chase. Unowned cards render as silhouettes
 * so the shape of what is missing is visible at a glance.
 */
export function Collection() {
  const owned = useCollection((s) => s.owned)
  const markSeen = useCollection((s) => s.markSeen)
  const peek = usePeek((s) => s.peek)
  const unseen = useCollection((s) => s.unseen)

  const [query, setQuery] = useState('')
  const [types, setTypes] = useState<EnergyType[]>([])
  const [ownedOnly, setOwnedOnly] = useState(false)

  const ownedCount = Object.keys(owned).filter((id) => owned[id]! > 0).length
  const totalHeld = Object.values(owned).reduce((a, b) => a + b, 0)

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase()

    return CARDS.filter((card) => {
      if (ownedOnly && !owned[card.id]) return false
      if (types.length && (!isFigure(card) || !types.includes(card.type))) return false
      if (q && !card.name.toLowerCase().includes(q)) return false
      return true
    }).sort((a, b) => {
      // Figures before Covenants and Relics, then rarity, then name — the order
      // a player thinks in when hunting for a card.
      const kindOrder = (c: CardData) => (isFigure(c) ? 0 : c.kind === 'covenant' ? 1 : 2)
      return (
        kindOrder(a) - kindOrder(b) ||
        RARITY_ORDER[b.rarity] - RARITY_ORDER[a.rarity] ||
        a.name.localeCompare(b.name)
      )
    })
  }, [query, types, ownedOnly, owned])

  const toggleType = (t: EnergyType) =>
    setTypes((prev) => (prev.includes(t) ? prev.filter((x) => x !== t) : [...prev, t]))

  return (
    <div className="scroll-y h-full">
      <div className="mx-auto max-w-app px-4 pt-safe pb-tabbar">
        <div className="text-center pt-2 pb-3">
          <h1 className="font-display text-xl tracking-wide">My Cards</h1>
        </div>

        {/* ---------------------------------------------------- set progress */}
        <div className="neu rounded-lg p-4">
          <div className="flex items-baseline justify-between mb-2">
            <span className="text-sm font-semibold">{GENESIS.name}</span>
            <span className="text-sm text-ink-muted tabular-nums">
              {ownedCount} / {CARDS.length}
            </span>
          </div>
          <Progress value={CARDS.length ? ownedCount / CARDS.length : 0} label="Set completion" />
          <p className="text-xs text-ink-muted mt-2">
            {totalHeld.toLocaleString()} cards held
          </p>
        </div>

        {/* --------------------------------------------------------- filters */}
        <div className="neu rounded-lg mt-3 p-3 space-y-3">
          <label className="flex items-center gap-2.5 neu-sunk rounded-pill px-3.5 py-2">
            <SearchIcon size={17} className="text-ink-faint shrink-0" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search by name"
              className="flex-1 min-w-0 bg-transparent outline-none text-sm placeholder:text-ink-faint"
              aria-label="Search cards by name"
            />
            {query && (
              <button onClick={() => setQuery('')} aria-label="Clear search">
                <CloseIcon size={15} className="text-ink-faint" />
              </button>
            )}
          </label>

          <div className="flex items-center gap-2 flex-wrap">
            {ENERGY_TYPES.map((t) => (
              <button
                key={t}
                onClick={() => toggleType(t)}
                aria-pressed={types.includes(t)}
                className={cx(
                  'rounded-pill p-1 transition-all duration-200',
                  types.includes(t) ? 'shadow-pressed scale-95' : 'shadow-raised-sm',
                )}
                style={{
                  background: types.includes(t) ? 'var(--bg-sunk)' : 'var(--surface)',
                }}
              >
                <EnergyOrb type={t} size={22} />
              </button>
            ))}

            <button
              onClick={() => setOwnedOnly((v) => !v)}
              aria-pressed={ownedOnly}
              className={cx(
                'ml-auto rounded-pill px-3 py-1.5 text-xs font-medium transition-all',
                ownedOnly ? 'shadow-pressed text-ink' : 'shadow-raised-sm text-ink-muted',
              )}
              style={{ background: ownedOnly ? 'var(--bg-sunk)' : 'var(--surface)' }}
            >
              Owned only
            </button>
          </div>
        </div>

        {/* ------------------------------------------------------------ grid */}
        {visible.length === 0 ? (
          <EmptyState icon={<BinderIcon size={40} />} title="Nothing matches">
            {ownedOnly
              ? 'You do not own any cards matching these filters yet. Open a pack, or turn off "Owned only" to see what there is to find.'
              : 'No card in the Genesis set matches these filters.'}
          </EmptyState>
        ) : (
          <div className="grid grid-cols-3 gap-2.5 mt-3">
            {visible.map((card) => {
              const count = owned[card.id] ?? 0
              return (
                <CollectionTile
                  key={card.id}
                  card={card}
                  count={count}
                  isNew={unseen.includes(card.id)}
                  onOpen={() => {
                    peek(card, { count })
                    if (count) markSeen([card.id])
                  }}
                />
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}

function CollectionTile({
  card,
  count,
  isNew,
  onOpen,
}: {
  card: CardData
  count: number
  isNew: boolean
  onOpen: () => void
}) {
  const locked = count === 0

  return (
    // Unowned cards open too. Wanting to read a card you have not pulled yet is
    // the reason to keep them in the binder at all; refusing the tap made the
    // gap look like a bug rather than a goal.
    <motion.button
      whileTap={{ scale: 0.95 }}
      onClick={onOpen}
      className="relative block w-full text-left"
      aria-label={locked ? `${card.name}, not collected` : `${card.name}, ${count} owned`}
    >
      {/* Unowned cards stay visible as desaturated silhouettes — the gap is the
          point of a collection screen. The card art is already dark, so this
          leans on grayscale and opacity rather than dimming, which previously
          rendered owned and unowned tiles almost identically. */}
      <div
        style={
          locked
            ? { filter: 'grayscale(1) contrast(0.85) brightness(1.15)', opacity: 0.34 }
            : undefined
        }
      >
        <PressableCard card={card} compact noHolo={locked} count={count} />
      </div>

      {count > 1 && (
        <span
          className="absolute bottom-1 right-1 rounded-pill px-1.5 py-0.5 text-[10px] font-bold tabular-nums"
          style={{ background: 'rgba(20,14,8,.86)', color: 'var(--gold-bright)' }}
        >
          ×{count}
        </span>
      )}

      {isNew && !locked && (
        <span
          className="absolute top-1 left-1 rounded-pill px-1.5 py-0.5 text-[9px] font-bold tracking-wide"
          style={{ background: 'var(--negative)', color: '#fff' }}
        >
          NEW
        </span>
      )}
    </motion.button>
  )
}
