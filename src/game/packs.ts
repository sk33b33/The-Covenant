import { CARDS } from '@/data/cards'
import { ALL_PACKS } from '@/data/sets'
import { ECONOMY } from './config'
import { weightedPick, type Rng } from './rng'
import { RARITY_ORDER, type Card, type Rarity } from '@/game/types'

/**
 * Opening a pack.
 *
 * Five cards. The first three are always Common, so the pack has a floor and
 * the reveal has somewhere to build from; the fourth and fifth carry the
 * excitement, with the fifth weighted most generously. This is the structure
 * the reference game uses, and it exists because a flat rate per slot makes
 * every pack feel identical.
 *
 * Pure and seeded, so the rate tables can be asserted over tens of thousands of
 * simulated packs in a test rather than eyeballed.
 */

type Weights = Record<Rarity, number>

/** Slot 4: an uncommon floor, with a real chance at the chase tiers. */
const SLOT_4: Weights = {
  common: 0,
  uncommon: 68,
  rare: 22,
  anointed: 7,
  illustration: 2.2,
  sacred: 0.65,
  crown: 0.15,
}

/** Slot 5: the same floor, roughly double the odds above it. */
const SLOT_5: Weights = {
  common: 0,
  uncommon: 44,
  rare: 33,
  anointed: 15,
  illustration: 5.4,
  sacred: 2.0,
  crown: 0.6,
}

/** What the pity rule pays out when it fires. */
const PITY: Weights = {
  common: 0,
  uncommon: 0,
  rare: 74,
  anointed: 19,
  illustration: 5,
  sacred: 1.6,
  crown: 0.4,
}

export interface PullResult {
  cards: Card[]
  /** True if the pack contained a Rare or better, which resets the pity counter. */
  hitRareOrBetter: boolean
  /** True if the pity rule had to fire to make that happen. */
  pityFired: boolean
}

const isRareOrBetter = (r: Rarity) => RARITY_ORDER[r] >= RARITY_ORDER.rare

/**
 * Cards a given pack can produce: everything in its set, minus the cards
 * exclusive to the set's *other* packs.
 */
function poolFor(packId: string): Card[] {
  const pack = ALL_PACKS.find((p) => p.id === packId)
  if (!pack) throw new Error(`Unknown pack id: ${packId}`)

  const otherExclusives = new Set(
    ALL_PACKS.filter((p) => p.set === pack.set && p.id !== pack.id).flatMap((p) => p.exclusives),
  )

  return CARDS.filter((c) => c.set === pack.set && !otherExclusives.has(c.id))
}

function pickOfRarity(rng: Rng, pool: Card[], rarity: Rarity): Card | null {
  const matching = pool.filter((c) => c.rarity === rarity)
  return matching.length ? rng.pick(matching) : null
}

/**
 * Picks a card at the given rarity, stepping down through lower tiers if the
 * set has none at that rarity. Without the fallback a thin tier would make
 * openPack return fewer than five cards.
 */
function pickAtOrBelow(rng: Rng, pool: Card[], rarity: Rarity): Card {
  const tiers = (Object.keys(RARITY_ORDER) as Rarity[])
    .filter((r) => RARITY_ORDER[r] <= RARITY_ORDER[rarity])
    .sort((a, b) => RARITY_ORDER[b] - RARITY_ORDER[a])

  for (const tier of tiers) {
    const card = pickOfRarity(rng, pool, tier)
    if (card) return card
  }

  throw new Error(`Pack pool has no cards at or below ${rarity}`)
}

/**
 * @param sincePity Packs opened since the last Rare or better.
 */
export function openPack(packId: string, rng: Rng, sincePity: number): PullResult {
  const pool = poolFor(packId)
  const cards: Card[] = []

  for (let slot = 0; slot < ECONOMY.CARDS_PER_PACK - 2; slot++) {
    cards.push(pickAtOrBelow(rng, pool, 'common'))
  }

  cards.push(pickAtOrBelow(rng, pool, weightedPick(rng, SLOT_4)))

  // The fifth slot is where pity applies, so a guaranteed hit still lands in
  // the position the reveal treats as the finale.
  const owed = sincePity + 1 >= ECONOMY.PITY_INTERVAL
  const alreadyHit = cards.some((c) => isRareOrBetter(c.rarity))

  let pityFired = false
  if (owed && !alreadyHit) {
    cards.push(pickAtOrBelow(rng, pool, weightedPick(rng, PITY)))
    pityFired = true
  } else {
    cards.push(pickAtOrBelow(rng, pool, weightedPick(rng, SLOT_5)))
  }

  return {
    cards,
    hitRareOrBetter: cards.some((c) => isRareOrBetter(c.rarity)),
    pityFired,
  }
}

/** Talents paid for a card the player already owns. */
export const duplicateValue = (rarity: Rarity): number => ECONOMY.DUPLICATE_TALENTS[rarity]

/** A pack whose finale is Illustration or better gets the full-screen treatment. */
export const isGodPack = (cards: Card[]): boolean =>
  cards.some((c) => RARITY_ORDER[c.rarity] >= RARITY_ORDER.illustration)
