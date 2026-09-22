import { useMemo } from 'react'
import { DIFFICULTY, type AiConfig } from '@/engine/ai'
import { Button } from '@/components/ui'
import { CARDS } from '@/data/cards'
import { ENERGY_TYPES, isFigure, type Card, type EnergyType } from '@/game/types'
import { RULES } from '@/game/config'
import { createRng, randomSeed, type Rng } from '@/game/rng'
import { useDecks, validateDeck } from '@/store/decks'
import { useNav, type TrainingDifficulty } from '@/store/nav'
import { Battle } from './Battle'

/** What each Training tier actually changes: how forgiving the AI's own
 *  play is (`DIFFICULTY`, the same dial every opponent in the game already
 *  uses) and what to call it on the coin-flip banner and turn chips. The
 *  deck it's handed is built separately — see `buildTrainingOpponentDeck` —
 *  since every tier plays a single-element deck; only the mind behind it
 *  gets sharper as the tiers climb. */
const TRAINING_TIER: Record<TrainingDifficulty, { config: AiConfig; label: string }> = {
  standard: { config: DIFFICULTY.gentle, label: 'Standard Training' },
  advanced: { config: DIFFICULTY.steady, label: 'Advanced Training' },
  master: { config: DIFFICULTY.hard, label: 'Master Training' },
}

/**
 * Chooses the decks a match is played with, then hands off to the board.
 *
 * Separated from `Battle` so the board never has to know where its decks came
 * from — a quick battle, a story encounter and a future online match all supply
 * the same shape.
 */
export function BattleRoute({ deckId, training }: { deckId?: string; training?: TrainingDifficulty }) {
  const back = useNav((s) => s.back)
  const decks = useDecks((s) => s.decks)
  const activeDeckId = useDecks((s) => s.activeDeckId)

  const deck = decks.find((d) => d.id === deckId) ?? decks.find((d) => d.id === activeDeckId) ?? decks[0]
  const seed = useMemo(() => randomSeed(), [])
  const opponent = useMemo(
    () => (training ? buildTrainingOpponentDeck(seed) : buildOpponentDeck(seed)),
    [seed, training],
  )

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

  const tier = training ? TRAINING_TIER[training] : null

  return (
    <Battle
      playerDeck={{ cards: deck.cards, energy: deck.energy }}
      opponentDeck={opponent}
      difficulty={tier?.config ?? DIFFICULTY.steady}
      seed={seed}
      opponentName={tier?.label ?? 'Wanderer'}
      themeType={opponent.energy[0] ?? 'earth'}
      onExit={back}
    />
  )
}

/**
 * Fills `cards` from `pool`, shuffled, until it holds `target` — respecting
 * the copy limit via the shared `copies` tally.
 *
 * Exhaustive rather than "try N times". An earlier version of this (inline
 * in `buildOpponentDeck`, before a second deck builder needed the identical
 * cascade) sampled a fixed number of positions and skipped any that had
 * already hit the copy limit, which silently produced decks of 14 or 16
 * cards — and a short deck loses to deck-out around turn nine, which looks
 * like a rules bug rather than a data one. Walking the *whole* shuffled pool
 * makes "no room left" the only way this can stop short.
 */
function fillDeck(rng: Rng, cards: string[], copies: Map<string, number>, pool: Card[], target: number) {
  for (const card of rng.shuffle(pool)) {
    if (cards.length >= target) return
    const used = copies.get(card.id) ?? 0
    if (used >= RULES.MAX_COPIES) continue
    copies.set(card.id, used + 1)
    cards.push(card.id)
  }
}

/**
 * A legal opponent deck for a quick battle.
 *
 * Built from the full card pool rather than from the player's collection — a
 * quick battle is practice, and drawing its opponent from what you happen to
 * own would make it easier exactly when you least need it to be.
 * `buildOpponentDeck` is covered by a test that asserts the result passes
 * `validateDeck` for hundreds of seeds.
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

  // Basics first and in quantity: the opening hand must contain one, and an
  // Ascended-heavy deck bricks.
  fillDeck(rng, cards, copies, basics, 10)
  fillDeck(rng, cards, copies, ascended, 14)
  fillDeck(rng, cards, copies, support, 18)

  // Two passes over the Basics will always close a gap of four, since every
  // Basic may appear twice.
  fillDeck(rng, cards, copies, basics, RULES.DECK_SIZE)
  fillDeck(rng, cards, copies, basics, RULES.DECK_SIZE)
  fillDeck(rng, cards, copies, onColour, RULES.DECK_SIZE)
  fillDeck(rng, cards, copies, support, RULES.DECK_SIZE)

  return { cards, energy }
}

/**
 * A legal, single-element opponent deck for Training.
 *
 * The same exhaustive-fill shape as `buildOpponentDeck`, but declaring one
 * energy type instead of two and drawing its Figures from that one type
 * alone — every element in the set prints enough on-colour Figures (eleven
 * at the thinnest) to fill a legal deck by itself with room to spare, so
 * this never has to fall back to a second colour the way a two-element deck
 * might. Training decks single-element on purpose: what a difficulty tier
 * changes is how well the AI plays, not how varied an opponent it fields —
 * see `TRAINING_TIER` for the difficulty half of that.
 */
export function buildTrainingOpponentDeck(seed: number): { cards: string[]; energy: EnergyType[] } {
  const rng = createRng(seed ^ 0x8c3f19a4)

  const type = rng.pick(ENERGY_TYPES)
  const energy: EnergyType[] = [type]

  const onColour = CARDS.filter(
    (card) => isFigure(card) && card.type === type && card.rarity !== 'crown',
  )
  const basics = onColour.filter((card) => isFigure(card) && card.stage === 'basic')
  const ascended = onColour.filter((card) => isFigure(card) && card.stage !== 'basic')
  const support = CARDS.filter((card) => card.kind === 'covenant' || card.kind === 'relic')

  const cards: string[] = []
  const copies = new Map<string, number>()

  fillDeck(rng, cards, copies, basics, 10)
  fillDeck(rng, cards, copies, ascended, 14)
  fillDeck(rng, cards, copies, support, 18)

  fillDeck(rng, cards, copies, basics, RULES.DECK_SIZE)
  fillDeck(rng, cards, copies, basics, RULES.DECK_SIZE)
  fillDeck(rng, cards, copies, onColour, RULES.DECK_SIZE)
  fillDeck(rng, cards, copies, support, RULES.DECK_SIZE)

  return { cards, energy }
}
