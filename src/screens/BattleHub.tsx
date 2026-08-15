import { BattleIcon, ScrollIcon } from '@/art/icons'
import { Card } from '@/components/card/Card'
import { Button, EmptyState, Panel } from '@/components/ui'
import { getCard } from '@/data/cards'
import { RULES } from '@/game/config'
import { useDecks, validateDeck } from '@/store/decks'
import { useNav } from '@/store/nav'

/**
 * The Battle tab.
 *
 * Its whole job is to make sure you arrive at a match with a legal deck, and to
 * say plainly what is wrong when you do not. `validateDeck` is the same
 * function the deck builder shows live, so the two can never disagree about
 * whether a deck may be played.
 */
export function BattleHub() {
  const go = useNav((s) => s.go)
  const decks = useDecks((s) => s.decks)
  const activeDeckId = useDecks((s) => s.activeDeckId)
  const setActive = useDecks((s) => s.setActive)

  const deck = decks.find((d) => d.id === activeDeckId) ?? decks[0]
  const validation = deck ? validateDeck(deck) : null

  if (!deck || !validation) {
    return (
      <div className="scroll-y h-full mb-tabbar">
        <EmptyState icon={<BattleIcon size={44} />} title="No deck yet">
          Build a deck of {RULES.DECK_SIZE} cards before entering a battle.
        </EmptyState>
        <div className="px-6">
          <Button variant="gold" block onClick={() => go({ name: 'deck-builder' })}>
            Build a deck
          </Button>
        </div>
      </div>
    )
  }

  const cover = deck.coverCardId ? getCard(deck.coverCardId) : undefined

  return (
    <div className="scroll-y h-full mb-tabbar">
      <div className="mx-auto max-w-app px-4 pt-safe pb-6">
        <div className="text-center pt-2 pb-4">
          <h1 className="font-display text-xl tracking-wide">Battle</h1>
        </div>

        {/* --------------------------------------------------- active deck */}
        <Panel className="p-4">
          <div className="flex items-center gap-4">
            {cover && (
              <div className="w-[74px] shrink-0">
                <Card card={cover} compact noHolo />
              </div>
            )}
            <div className="flex-1 min-w-0">
              <p className="text-xs text-ink-muted">Your deck</p>
              <h2 className="font-display text-md truncate">{deck.name}</h2>
              <p className="text-xs text-ink-muted mt-1 tabular-nums">
                {validation.counts.total}/{RULES.DECK_SIZE} cards ·{' '}
                {validation.counts.basics} Basic
              </p>
              <div className="flex gap-1.5 mt-2">
                {deck.energy.map((type) => (
                  <span
                    key={type}
                    className="w-4 h-4 rounded-pill"
                    style={{ background: `var(--energy-${type})` }}
                    title={type}
                  />
                ))}
              </div>
            </div>
          </div>

          {(validation.errors.length > 0 || validation.warnings.length > 0) && (
            <ul className="mt-3 space-y-1">
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

          <div className="flex gap-2 mt-3">
            <Button
              className="!px-4 !py-2.5 text-sm"
              onClick={() => go({ name: 'deck-builder', deckId: deck.id })}
            >
              Edit
            </Button>
            <Button
              variant="gold"
              className="flex-1 !py-2.5"
              disabled={!validation.legal}
              onClick={() => go({ name: 'battle', deckId: deck.id })}
            >
              {validation.legal ? 'Quick Battle' : 'Deck is not legal'}
            </Button>
          </div>
        </Panel>

        {/* -------------------------------------------------------- story */}
        <button
          onClick={() => go({ name: 'story-map' })}
          className="neu rounded-lg w-full p-4 mt-3 flex items-center gap-4 text-left"
        >
          <span
            className="grid place-items-center w-12 h-12 rounded-pill shrink-0"
            style={{ background: 'var(--gold-pale)', color: 'var(--gold-deep)' }}
          >
            <ScrollIcon size={24} />
          </span>
          <span className="flex-1 min-w-0">
            <span className="block font-display text-md">Story</span>
            <span className="block text-xs text-ink-muted mt-0.5">
              Genesis — five encounters, from the Garden to the Covenant
            </span>
          </span>
        </button>

        {/* ---------------------------------------------------- other decks */}
        {decks.length > 1 && (
          <>
            <h2 className="font-display text-md mt-6 mb-2 px-1">Your decks</h2>
            <div className="space-y-2">
              {decks.map((entry) => {
                const check = validateDeck(entry)
                return (
                  <button
                    key={entry.id}
                    onClick={() => setActive(entry.id)}
                    className="neu rounded-lg w-full px-4 py-3 flex items-center gap-3 text-left"
                    style={{
                      outline: entry.id === deck.id ? '1.5px solid var(--gold)' : undefined,
                    }}
                  >
                    <span className="flex-1 min-w-0">
                      <span className="block text-sm font-medium truncate">{entry.name}</span>
                      <span className="block text-xs text-ink-muted tabular-nums">
                        {entry.cards.length}/{RULES.DECK_SIZE}
                        {!check.legal && ' · not legal'}
                      </span>
                    </span>
                    <span className="flex gap-1 shrink-0">
                      {entry.energy.map((type) => (
                        <span
                          key={type}
                          className="w-3 h-3 rounded-pill"
                          style={{ background: `var(--energy-${type})` }}
                        />
                      ))}
                    </span>
                  </button>
                )
              })}
            </div>
          </>
        )}

        <div className="mt-4">
          <Button block onClick={() => go({ name: 'deck-builder' })}>
            New deck
          </Button>
        </div>
      </div>
    </div>
  )
}
