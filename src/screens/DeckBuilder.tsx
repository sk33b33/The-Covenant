import { useMemo, useState } from 'react'
import { motion } from 'framer-motion'
import { EnergyOrb } from '@/art/EnergyOrb'
import { BackIcon, CheckIcon, CloseIcon, MinusIcon, PlusIcon, SearchIcon } from '@/art/icons'
import { PressableCard } from '@/components/card/PressableCard'
import { usePeek } from '@/store/peek'
import { Button, Panel, Progress } from '@/components/ui'
import { CARDS, getCard, requireCard } from '@/data/cards'
import { RULES } from '@/game/config'
import {
  ENERGY_TYPES,
  RARITY_ORDER,
  isFigure,
  type Card as CardData,
  type EnergyType,
  type FigureCard,
} from '@/game/types'
import { useCollection } from '@/store/collection'
import { useDecks, validateDeck } from '@/store/decks'
import { useNav } from '@/store/nav'
import { cx } from '@/lib/cx'

/**
 * The deck builder.
 *
 * Legality is checked by `validateDeck`, the same function the Battle tab uses
 * to decide whether a deck may be taken into a match — so what this screen says
 * and what the game allows can never drift apart.
 *
 * Only cards you own can be added, and only as many copies as you hold, because
 * a deck you cannot actually field is worse than no deck at all.
 */
export function DeckBuilder({ deckId }: { deckId?: string }) {
  const back = useNav((s) => s.back)
  const peek = usePeek((s) => s.peek)
  const owned = useCollection((s) => s.owned)
  const decks = useDecks((s) => s.decks)
  const upsert = useDecks((s) => s.upsert)
  const setActive = useDecks((s) => s.setActive)

  const existing = decks.find((d) => d.id === deckId)

  const [name, setName] = useState(existing?.name ?? 'New Deck')
  const [cards, setCards] = useState<string[]>(existing?.cards ?? [])
  const [energy, setEnergy] = useState<EnergyType[]>(existing?.energy ?? [])
  const [query, setQuery] = useState('')
  const [autoMode, setAutoMode] = useState<'single' | 'multiple'>('single')

  const hasCollection = useMemo(() => Object.values(owned).some((n) => n > 0), [owned])

  const validation = useMemo(() => validateDeck({ cards, energy }), [cards, energy])

  /** How many copies of a card the deck already holds. */
  const inDeck = useMemo(() => {
    const tally = new Map<string, number>()
    cards.forEach((id) => tally.set(id, (tally.get(id) ?? 0) + 1))
    return tally
  }, [cards])

  const collection = useMemo(() => {
    const q = query.trim().toLowerCase()
    return CARDS.filter((card) => (owned[card.id] ?? 0) > 0)
      .filter((card) => !q || card.name.toLowerCase().includes(q))
      .sort((a, b) => {
        const kind = (c: CardData) => (isFigure(c) ? 0 : c.kind === 'covenant' ? 1 : 2)
        return (
          kind(a) - kind(b) ||
          RARITY_ORDER[b.rarity] - RARITY_ORDER[a.rarity] ||
          a.name.localeCompare(b.name)
        )
      })
  }, [owned, query])

  const add = (cardId: string) => {
    const held = owned[cardId] ?? 0
    const already = inDeck.get(cardId) ?? 0
    if (cards.length >= RULES.DECK_SIZE) return
    if (already >= Math.min(RULES.MAX_COPIES, held)) return
    setCards((prev) => [...prev, cardId])
  }

  const remove = (cardId: string) => {
    setCards((prev) => {
      const index = prev.lastIndexOf(cardId)
      if (index === -1) return prev
      return [...prev.slice(0, index), ...prev.slice(index + 1)]
    })
  }

  const toggleEnergy = (type: EnergyType) =>
    setEnergy((prev) => {
      if (prev.includes(type)) return prev.filter((t) => t !== type)
      if (prev.length >= RULES.MAX_ENERGY_TYPES) return prev
      return [...prev, type]
    })

  /**
   * Replaces the deck with one drafted entirely from what's owned, built
   * around one Altar type (`single`) or the two best-supported ones
   * (`multiple`) instead of whatever is currently declared.
   */
  const autoBuild = () => {
    // Whether a Figure has at least one attack the given types can actually
    // pay for — the exact inverse of `validateDeck`'s "stranded" check, so a
    // card drafted here can never trigger that warning on its own.
    const payable = (card: FigureCard, types: EnergyType[]) => {
      const declared = new Set(types)
      return card.attacks.some((a) => a.cost.every((c) => c === null || declared.has(c)))
    }

    const ownedFigures = CARDS.filter(isFigure).filter((c) => (owned[c.id] ?? 0) > 0)

    // Score each type by how many owned copies could attack with it alone,
    // then take the best one (or two) as the Altar's declared types.
    const scoreOf = (type: EnergyType) =>
      ownedFigures
        .filter((c) => payable(c, [type]))
        .reduce((sum, c) => sum + Math.min(RULES.MAX_COPIES, owned[c.id] ?? 0), 0)

    const ranked = [...ENERGY_TYPES].sort((a, b) => scoreOf(b) - scoreOf(a))
    const slots = autoMode === 'single' ? 1 : RULES.MAX_ENERGY_TYPES
    const supported = ranked.slice(0, slots).filter((t) => scoreOf(t) > 0)
    const declaredTypes = supported.length ? supported : ranked.slice(0, 1)

    // An ascended Figure is dead weight unless its whole lineage back to a
    // Basic is owned and payable too — nothing ever gets it onto the board
    // otherwise, since ascending replaces a Figure already in play.
    const chainIsPlayable = (card: FigureCard): boolean => {
      let current = card
      const seen = new Set<string>()
      while (current.stage !== 'basic') {
        const fromId = current.ascendsFrom
        if (!fromId || seen.has(fromId)) return false
        seen.add(fromId)
        const prev = getCard(fromId)
        if (!prev || !isFigure(prev)) return false
        if ((owned[prev.id] ?? 0) <= 0 || !payable(prev, declaredTypes)) return false
        current = prev
      }
      return true
    }

    const stageOrder: Record<FigureCard['stage'], number> = {
      basic: 0,
      'ascended-1': 1,
      'ascended-2': 2,
    }
    const figureCandidates = ownedFigures
      .filter((c) => payable(c, declaredTypes) && chainIsPlayable(c))
      .sort(
        (a, b) =>
          stageOrder[a.stage] - stageOrder[b.stage] ||
          RARITY_ORDER[b.rarity] - RARITY_ORDER[a.rarity] ||
          b.hp - a.hp,
      )

    // Covenants and Relics are colourless, so every owned copy is a candidate
    // regardless of which Altar types just got chosen.
    const utilityCandidates = CARDS.filter((c) => !isFigure(c) && (owned[c.id] ?? 0) > 0).sort(
      (a, b) => RARITY_ORDER[b.rarity] - RARITY_ORDER[a.rarity] || a.name.localeCompare(b.name),
    )

    const deck: string[] = []
    const added = new Map<string, number>()
    const fill = (pool: CardData[], upTo: number) => {
      for (const card of pool) {
        if (deck.length >= upTo) break
        const max = Math.min(RULES.MAX_COPIES, owned[card.id] ?? 0)
        for (let have = added.get(card.id) ?? 0; have < max && deck.length < upTo; have++) {
          deck.push(card.id)
          added.set(card.id, have + 1)
        }
      }
    }

    // Figures first, reserving a handful of slots for Covenants/Relics when
    // there are any worth spending them on — then, if the collection came up
    // short on utility cards (or figures), each pass tops up from where the
    // last one left off rather than leaving the deck under size.
    const utilityBudget =
      utilityCandidates.length > 0 ? Math.min(4, utilityCandidates.length * RULES.MAX_COPIES) : 0
    fill(figureCandidates, RULES.DECK_SIZE - utilityBudget)
    fill(utilityCandidates, RULES.DECK_SIZE)
    fill(figureCandidates, RULES.DECK_SIZE)

    setCards(deck)
    setEnergy(declaredTypes)
  }

  const save = () => {
    // The cover is the deck's most striking Figure — the rarest, then the
    // toughest — so a deck list reads at a glance.
    const cover = [...new Set(cards)]
      .map(requireCard)
      .filter(isFigure)
      .sort(
        (a, b) => RARITY_ORDER[b.rarity] - RARITY_ORDER[a.rarity] || b.hp - a.hp,
      )[0]

    const id = existing?.id ?? `deck-${Date.now().toString(36)}`
    upsert({
      id,
      name: name.trim() || 'New Deck',
      cards,
      energy,
      ...(cover ? { coverCardId: cover.id } : {}),
    })
    setActive(id)
    back()
  }

  return (
    <div className="h-full flex flex-col">
      {/* ---------------------------------------------------------- header */}
      <div className="px-4 pt-safe shrink-0">
        <div className="flex items-center gap-2 pt-2">
          <button
            onClick={back}
            className="neu w-10 h-10 rounded-pill grid place-items-center text-ink-muted shrink-0"
            aria-label="Back"
          >
            <BackIcon size={20} />
          </button>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="flex-1 min-w-0 neu-sunk rounded-pill px-4 py-2 text-sm font-medium bg-transparent outline-none"
            aria-label="Deck name"
            maxLength={24}
          />
        </div>

        {/* -------------------------------------------------------- status */}
        <Panel className="mt-3 p-3">
          <div className="flex items-baseline justify-between">
            <span className="text-sm font-semibold tabular-nums">
              {cards.length} / {RULES.DECK_SIZE}
            </span>
            <span className="text-xs text-ink-muted">
              {validation.counts.basics} Basic · {validation.counts.figures} Figures
            </span>
          </div>
          <Progress value={cards.length / RULES.DECK_SIZE} className="mt-2" label="Deck size" />

          {/* Auto build: pick how many Altar elements to draft around, then
              fill the rest of the deck from what's owned. Replaces whatever
              is currently in the deck outright — the same as re-picking
              everything below by hand. */}
          <div className="flex items-center gap-2 mt-3">
            <span className="text-xs text-ink-muted shrink-0">Auto build</span>
            <div className="flex gap-1.5">
              {(['single', 'multiple'] as const).map((mode) => (
                <button
                  key={mode}
                  onClick={() => setAutoMode(mode)}
                  aria-pressed={autoMode === mode}
                  className={cx(
                    'rounded-pill px-2.5 py-1 text-[11px] font-medium capitalize transition-all duration-200',
                    autoMode === mode ? 'shadow-pressed scale-95' : 'shadow-raised-sm',
                  )}
                  style={{
                    background: autoMode === mode ? 'var(--gold-pale)' : 'var(--surface)',
                    opacity: autoMode === mode ? 1 : 0.7,
                  }}
                >
                  {mode}
                </button>
              ))}
            </div>
            <Button
              variant="raised"
              className="!px-3 !py-1.5 text-xs ml-auto shrink-0"
              disabled={!hasCollection}
              onClick={autoBuild}
            >
              Auto Build
            </Button>
          </div>

          {/* Energy declaration. */}
          <div className="flex items-center gap-2 mt-3">
            <span className="text-xs text-ink-muted shrink-0">Altar</span>
            <div className="flex gap-1.5 flex-wrap">
              {ENERGY_TYPES.map((type) => (
                <button
                  key={type}
                  onClick={() => toggleEnergy(type)}
                  aria-pressed={energy.includes(type)}
                  className={cx(
                    'rounded-pill p-1 transition-all duration-200',
                    energy.includes(type) ? 'shadow-pressed scale-95' : 'shadow-raised-sm',
                  )}
                  style={{
                    background: energy.includes(type) ? 'var(--gold-pale)' : 'var(--surface)',
                    opacity: energy.includes(type) ? 1 : 0.55,
                  }}
                >
                  <EnergyOrb type={type} size={20} />
                </button>
              ))}
            </div>
          </div>

          {validation.errors.length === 0 && (
            <p className="mt-2.5 text-xs text-[var(--positive)] flex items-center gap-1.5">
              <CheckIcon size={14} /> Ready to battle
            </p>
          )}

          {/* Errors block saving; warnings are advice and never do. */}
          {(validation.errors.length > 0 || validation.warnings.length > 0) && (
            <ul className="mt-2.5 space-y-1">
              {validation.errors.map((error) => (
                <li key={error} className="text-xs text-[var(--negative)] leading-snug">
                  {error}
                </li>
              ))}
              {validation.warnings.map((warning) => (
                <li key={warning} className="text-xs text-[var(--warning)] leading-snug">
                  {warning}
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>

      {/* ------------------------------------------------------ in the deck */}
      <div className="px-4 mt-3 shrink-0">
        <h2 className="text-xs text-ink-muted mb-1.5">In this deck</h2>
        {cards.length === 0 ? (
          <p className="text-xs text-ink-faint py-3">
            Nothing yet. Tap a card below to add it.
          </p>
        ) : (
          <div className="scroll-x flex gap-1.5 pb-1">
            {[...inDeck.entries()].map(([cardId, count]) => (
              <button
                key={cardId}
                onClick={() => remove(cardId)}
                className="relative shrink-0 w-[52px]"
                aria-label={`Remove ${requireCard(cardId).name}`}
              >
                <PressableCard card={requireCard(cardId)} compact noHolo />
                <span
                  className="absolute -top-1 -right-1 rounded-pill w-5 h-5 grid place-items-center text-[10px] font-bold"
                  style={{ background: 'var(--gold)', color: '#241a0e' }}
                >
                  {count}
                </span>
                <span
                  className="absolute bottom-0.5 left-1/2 -translate-x-1/2 rounded-pill w-5 h-5 grid place-items-center"
                  style={{ background: 'rgba(10,7,3,.85)', color: 'var(--gold-bright)' }}
                >
                  <MinusIcon size={12} />
                </span>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* ------------------------------------------------------- collection */}
      <div className="px-4 mt-3 shrink-0">
        <label className="flex items-center gap-2.5 neu-sunk rounded-pill px-3.5 py-2">
          <SearchIcon size={16} className="text-ink-faint shrink-0" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search your cards"
            className="flex-1 min-w-0 bg-transparent outline-none text-sm placeholder:text-ink-faint"
            aria-label="Search your cards"
          />
          {query && (
            <button onClick={() => setQuery('')} aria-label="Clear search">
              <CloseIcon size={14} className="text-ink-faint" />
            </button>
          )}
        </label>
      </div>

      <div className="scroll-y flex-1 px-4 pt-3 min-h-0 pb-tabbar">
        <div className="grid grid-cols-4 gap-2 pb-4">
          {collection.map((card) => {
            const held = owned[card.id] ?? 0
            const used = inDeck.get(card.id) ?? 0
            const max = Math.min(RULES.MAX_COPIES, held)
            const full = used >= max || cards.length >= RULES.DECK_SIZE

            return (
              <motion.button
                key={card.id}
                whileTap={full ? undefined : { scale: 0.94 }}
                // A full tile has nothing left to add, so tapping it shows the
                // card instead of doing nothing. Holding any tile does the
                // same, full or not.
                onClick={() => (full ? peek(card) : add(card.id))}
                className="relative"
                aria-label={`${card.name}, ${used} of ${max} in deck`}
              >
                <div style={{ opacity: used >= max ? 0.4 : 1 }}>
                  <PressableCard card={card} compact noHolo />
                </div>

                <span
                  className="absolute -top-1 -right-1 rounded-pill px-1.5 h-5 grid place-items-center text-[10px] font-bold tabular-nums"
                  style={{
                    background: used > 0 ? 'var(--gold)' : 'rgba(10,7,3,.8)',
                    color: used > 0 ? '#241a0e' : 'var(--gold-bright)',
                  }}
                >
                  {used}/{max}
                </span>

                {!full && (
                  <span
                    className="absolute bottom-0.5 left-1/2 -translate-x-1/2 rounded-pill w-5 h-5 grid place-items-center"
                    style={{ background: 'rgba(10,7,3,.85)', color: 'var(--gold-bright)' }}
                  >
                    <PlusIcon size={12} />
                  </span>
                )}
              </motion.button>
            )
          })}
        </div>

        {collection.length === 0 && (
          <p className="text-sm text-ink-muted text-center py-8 px-6">
            {query
              ? 'No card you own matches that name.'
              : 'You do not own any cards yet. Open a pack to start building.'}
          </p>
        )}
      </div>

      {/* ------------------------------------------------------------ save */}
      <div className="px-4 pb-safe pb-3 pt-2 shrink-0" style={{ background: 'var(--bg)' }}>
        <Button variant="gold" block disabled={!validation.legal} onClick={save}>
          {validation.legal
            ? 'Save deck'
            : cards.length < RULES.DECK_SIZE
              ? `${RULES.DECK_SIZE - cards.length} more cards needed`
              : /* The deck is full but still illegal for some other reason —
                   too few Basics, no energy declared. That reason is already
                   spelled out above; repeating "0 more cards needed" here
                   would just be wrong. */
                'Deck not ready'}
        </Button>
      </div>
    </div>
  )
}
