import { useMemo, useState } from 'react'
import { motion } from 'framer-motion'
import { BinderIcon, CloseIcon, GridIcon, ListIcon, SearchIcon } from '@/art/icons'
import { EnergyOrb } from '@/art/EnergyOrb'
import { PressableCard } from '@/components/card/PressableCard'
import { usePeek } from '@/store/peek'
import { EmptyState, Progress } from '@/components/ui'
import { CARDS } from '@/data/cards'
import { GENESIS } from '@/data/sets'
import {
  ENERGY_TYPES,
  RARITY_ORDER,
  RARITY_LABEL,
  isFigure,
  type Card as CardData,
  type EnergyType,
} from '@/game/types'
import { UNSEEN_WINDOW_MS, useCollection } from '@/store/collection'
import { useNow } from '@/hooks/useNow'
import { cx } from '@/lib/cx'

type ViewMode = 'grid' | 'list'

const VIEW_KEY = 'covenant:cardsView'

/** The stored choice, same read-it-once-then-trust-state pattern `theme.ts`
 *  already uses — storage can throw (private mode, quota), and this is a
 *  display preference, not state worth crashing the binder over. */
function loadView(): ViewMode {
  try {
    const saved = localStorage.getItem(VIEW_KEY)
    if (saved === 'grid' || saved === 'list') return saved
  } catch {
    /* storage denied; default below still renders */
  }
  return 'grid'
}

function saveView(mode: ViewMode): void {
  try {
    localStorage.setItem(VIEW_KEY, mode)
  } catch {
    /* not worth surfacing — the toggle still works for this session */
  }
}

/**
 * The binder.
 *
 * Opens owned-only, so the first thing you see is your own collection rather
 * than a wall of silhouettes for a set you have barely touched. The "Owned
 * only" toggle switches to the whole set, where unowned cards render as
 * silhouettes so the shape of what is missing is visible at a glance.
 */
export function Collection() {
  const owned = useCollection((s) => s.owned)
  const markSeen = useCollection((s) => s.markSeen)
  const peek = usePeek((s) => s.peek)
  const unseenSince = useCollection((s) => s.unseenSince)
  // A minute is plenty fine-grained for a 12-hour window, and cheap enough
  // to tick in the background the whole time the binder is open.
  const now = useNow(60_000)
  const isUnseen = (cardId: string) => {
    const since = unseenSince[cardId]
    return since !== undefined && now - since < UNSEEN_WINDOW_MS
  }

  const [query, setQuery] = useState('')
  const [types, setTypes] = useState<EnergyType[]>([])
  // Defaults to owned-only: opening the binder to a wall of silhouettes reads
  // as "you own nothing" before it reads as "here is what to chase". Showing
  // your own cards first, with a toggle to reveal the gaps, does both.
  const [ownedOnly, setOwnedOnly] = useState(true)
  const [view, setView] = useState<ViewMode>(loadView)

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

  // The same list, paired with each card's own owned count — handed to the
  // viewer so a swipe there can page through exactly what's on screen here,
  // in the same order, with each card's count following it. Kept separate
  // from `visible` itself rather than folded into that filter/sort so the
  // viewer's `list` type (card + count) stays specific to what it actually
  // needs, not a general-purpose shape every other reader of `visible` has
  // to see too.
  const peekList = useMemo(
    () => visible.map((card) => ({ card, count: owned[card.id] ?? 0 })),
    [visible, owned],
  )

  const toggleType = (t: EnergyType) =>
    setTypes((prev) => (prev.includes(t) ? prev.filter((x) => x !== t) : [...prev, t]))

  // Shared between the grid tile and the list row, so opening a card does the
  // same thing — peek it, feed it the same swipe-through list, mark it seen —
  // regardless of which layout it was tapped from.
  const openCard = (card: CardData, count: number, index: number) => {
    peek(card, {
      count,
      list: peekList,
      index,
      // Swiping to a card marks it seen too, same as tapping it directly
      // already does — a card you paged past without pausing on it was
      // still shown to you.
      onStep: (item) => {
        if (item.count) markSeen([item.card.id])
      },
    })
    if (count) markSeen([card.id])
  }

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

            {/* Grid and list share one pill rather than two separate toggles —
                exactly one of the two is ever meaningful, so this reads as a
                single choice instead of two independent switches that happen
                to disagree when a player taps both. */}
            <div className="flex rounded-pill p-0.5 shadow-raised-sm" style={{ background: 'var(--surface)' }}>
              {(
                [
                  { mode: 'grid', Icon: GridIcon, label: 'Grid view' },
                  { mode: 'list', Icon: ListIcon, label: 'List view' },
                ] as const
              ).map(({ mode, Icon, label }) => (
                <button
                  key={mode}
                  onClick={() => {
                    setView(mode)
                    saveView(mode)
                  }}
                  aria-pressed={view === mode}
                  aria-label={label}
                  className={cx('rounded-pill p-1.5 transition-all duration-200', view === mode && 'shadow-pressed')}
                  style={{ background: view === mode ? 'var(--bg-sunk)' : undefined }}
                >
                  <Icon size={16} className={view === mode ? 'text-ink' : 'text-ink-muted'} />
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* -------------------------------------------------------- grid/list */}
        {visible.length === 0 ? (
          <EmptyState icon={<BinderIcon size={40} />} title="Nothing matches">
            {ownedOnly
              ? 'You do not own any cards matching these filters yet. Open a pack, or turn off "Owned only" to see what there is to find.'
              : 'No card in the Genesis set matches these filters.'}
          </EmptyState>
        ) : view === 'grid' ? (
          <div className="grid grid-cols-3 gap-2.5 mt-3">
            {visible.map((card, index) => {
              const count = owned[card.id] ?? 0
              return (
                <CollectionTile
                  key={card.id}
                  card={card}
                  count={count}
                  isNew={isUnseen(card.id)}
                  onOpen={() => openCard(card, count, index)}
                />
              )
            })}
          </div>
        ) : (
          <div className="flex flex-col gap-1.5 mt-3">
            {visible.map((card, index) => {
              const count = owned[card.id] ?? 0
              return (
                <CollectionRow
                  key={card.id}
                  card={card}
                  count={count}
                  isNew={isUnseen(card.id)}
                  onOpen={() => openCard(card, count, index)}
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

/**
 * One card per row: a thumbnail the size of a grid tile's own art, name and
 * rarity beside it, owned count trailing. Same tap target, same data, same
 * `onOpen` — the whole point of a list view next to the grid is scanning many
 * names at once rather than recognising many pictures at once, not a second
 * way to pick a card.
 */
function CollectionRow({
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
  const figure = isFigure(card) ? card : null

  return (
    <motion.button
      whileTap={{ scale: 0.98 }}
      onClick={onOpen}
      className="relative flex items-center gap-3 w-full text-left rounded-lg p-1.5"
      style={{ background: 'var(--surface)' }}
      aria-label={locked ? `${card.name}, not collected` : `${card.name}, ${count} owned`}
    >
      {/* Fixed width rather than a fraction of the row, so the thumbnail reads
          at the same size on every row regardless of how long the name next
          to it runs. */}
      <div
        className="w-12 shrink-0"
        style={
          locked
            ? { filter: 'grayscale(1) contrast(0.85) brightness(1.15)', opacity: 0.34 }
            : undefined
        }
      >
        <PressableCard card={card} compact noHolo={locked} count={count} />
      </div>

      <span className="flex-1 min-w-0">
        <span className="flex items-center gap-1.5">
          <span className="font-display text-sm text-ink-strong truncate">{card.name}</span>
          {isNew && !locked && (
            <span
              className="shrink-0 rounded-pill px-1.5 py-0.5 text-[9px] font-bold tracking-wide"
              style={{ background: 'var(--negative)', color: '#fff' }}
            >
              NEW
            </span>
          )}
        </span>
        <span className="flex items-center gap-1 mt-0.5 text-xs text-ink-muted">
          {figure && <EnergyOrb type={figure.type} size={13} />}
          {figure ? `${figure.hp} HP · ` : ''}
          {RARITY_LABEL[card.rarity]}
        </span>
      </span>

      <span className="shrink-0 text-xs font-bold tabular-nums text-ink-muted">
        {locked ? 'Not collected' : `×${count}`}
      </span>
    </motion.button>
  )
}
