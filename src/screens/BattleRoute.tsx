import { useMemo } from 'react'
import { DIFFICULTY } from '@/engine/ai'
import { Button } from '@/components/ui'
import { CARDS } from '@/data/cards'
import { ENERGY_TYPES, isFigure, type EnergyType } from '@/game/types'
import { RULES } from '@/game/config'
import { createRng, randomSeed } from '@/game/rng'
import { useDecks, validateDeck } from '@/store/decks'
import { useNav } from '@/store/nav'
import { Battle } from './Battle'

/**
 * Chooses the decks a match is played with, then hands off to the board.
 *
 * Separated from `Battle` so the board never has to know where its decks came
 * from — a quick battle, a story encounter and a future online match all supply
 * the same shape.
 */
export function BattleRoute({ deckId }: { deckId?: string }) {
  const back = useNav((s) => s.back)
  const decks = useDecks((s) => s.decks)
  const activeDeckId = useDecks((s) => s.activeDeckId)

  const deck = decks.find((d) => d.id === deckId) ?? decks.find((d) => d.id === activeDeckId) ?? decks[0]
  const seed = useMemo(() => randomSeed(), [])
  const opponent = useMemo(() => buildOpponentDeck(seed), [seed])

  if (!deck || !validateDeck(deck).legal) {
    return (
      <div className="h-full grid place-items-center px-8 text-center">
        <div>
          <p className="text-ink-muted text-sm">
            This deck cannot be taken into a battle yet.
          </p>
          <Button className="mt-4" onClick={back}>
            Go back
          </Button>
        </div>
      </div>
    )
  }

  return (
    <Battle
      playerDeck={{ cards: deck.cards, energy: deck.energy }}
      opponentDeck={opponent}
      difficulty={DIFFICULTY.steady}
      seed={seed}
      opponentName="Wanderer"
      themeType={opponent.energy[0] ?? 'earth'}
      onExit={back}
    />
  )
}

/**
 * A legal opponent deck for a quick battle.
 *
 * Built from the full card pool rather than from the player's collection — a
 * quick battle is practice, and drawing its opponent from what you happen to
 * own would make it easier exactly when you least need it to be.
 *
 * Filling has to be exhaustive rather than "try N times". An earlier version
 * sampled a fixed number of positions and skipped any that had already hit the
 * copy limit, which silently produced decks of 14 or 16 cards — and a short
 * deck loses to deck-out around turn nine, which looks like a rules bug rather
 * than a data one. `buildOpponentDeck` is covered by a test that asserts the
 * result passes `validateDeck` for hundreds of seeds.
 */
export function buildOpponentDeck(seed: number): { cards: string[]; energy: EnergyType[] } {
  const rng = createRng(seed ^ 0x51ed270b)

  const primary = rng.pick(ENERGY_TYPES)
  const rest = ENERGY_TYPES.filter((t) => t !== primary)
  const energy: EnergyType[] = [primary, rng.pick(rest)]

  const onColour = CARDS.filter(
    // Crown is the set's single rarest card; the practice opponent does not
    // get to open with it.
    (card) => isFigure(card) && energy.includes(card.type) && card.rarity !== 'crown',
  )
  const basics = onColour.filter((card) => isFigure(card) && card.stage === 'basic')
  const ascended = onColour.filter((card) => isFigure(card) && card.stage !== 'basic')
  const support = CARDS.filter((card) => card.kind === 'covenant' || card.kind === 'relic')

  const cards: string[] = []
  const copies = new Map<string, number>()

  /** Walks the whole shuffled pool, so "no room left" is the only way to stop. */
  const fill = (pool: typeof CARDS, target: number) => {
    for (const card of rng.shuffle(pool)) {
      if (cards.length >= target) return
      const used = copies.get(card.id) ?? 0
      if (used >= RULES.MAX_COPIES) continue
      copies.set(card.id, used + 1)
      cards.push(card.id)
    }
  }

  // Basics first and in quantity: the opening hand must contain one, and an
  // Ascended-heavy deck bricks.
  fill(basics, 10)
  fill(ascended, 14)
  fill(support, 18)

  // Two passes over the Basics will always close a gap of four, since every
  // Basic may appear twice.
  fill(basics, RULES.DECK_SIZE)
  fill(basics, RULES.DECK_SIZE)
  fill(onColour, RULES.DECK_SIZE)
  fill(support, RULES.DECK_SIZE)

  return { cards, energy }
}
