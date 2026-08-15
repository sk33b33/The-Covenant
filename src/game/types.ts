/**
 * Domain types shared by the card data, the rules engine, the stores and the
 * UI. Deliberately dependency-free so the engine can stay pure.
 */

/* ------------------------------------------------------------------ energy */

export const ENERGY_TYPES = ['light', 'fire', 'water', 'earth', 'spirit', 'shadow'] as const
export type EnergyType = (typeof ENERGY_TYPES)[number]

export const ENERGY_LABEL: Record<EnergyType, string> = {
  light: 'Light',
  fire: 'Fire',
  water: 'Water',
  earth: 'Earth',
  spirit: 'Spirit',
  shadow: 'Shadow',
}

/**
 * What each type is weak to. Light and Shadow answer each other, so neither is
 * ever safe; the other four form a cycle.
 */
export const WEAKNESS: Record<EnergyType, EnergyType> = {
  light: 'shadow',
  shadow: 'light',
  water: 'spirit',
  fire: 'water',
  earth: 'fire',
  spirit: 'earth',
}

/* ------------------------------------------------------------------ rarity */

export const RARITIES = [
  'common',
  'uncommon',
  'rare',
  'anointed',
  'illustration',
  'sacred',
  'crown',
] as const
export type Rarity = (typeof RARITIES)[number]

export const RARITY_LABEL: Record<Rarity, string> = {
  common: 'Common',
  uncommon: 'Uncommon',
  rare: 'Rare',
  anointed: 'Anointed',
  illustration: 'Illustration',
  sacred: 'Sacred Art',
  crown: 'Crown',
}

/** Diamonds for the ordinary tiers, stars for the chase tiers, a crown at the top. */
export const RARITY_MARK: Record<Rarity, { shape: 'diamond' | 'star' | 'crown'; count: number }> = {
  common: { shape: 'diamond', count: 1 },
  uncommon: { shape: 'diamond', count: 2 },
  rare: { shape: 'diamond', count: 3 },
  anointed: { shape: 'diamond', count: 4 },
  illustration: { shape: 'star', count: 1 },
  sacred: { shape: 'star', count: 2 },
  crown: { shape: 'crown', count: 1 },
}

/** Rarity order, low to high. Used for sorting and for pull-rate tables. */
export const RARITY_ORDER: Record<Rarity, number> = {
  common: 0,
  uncommon: 1,
  rare: 2,
  anointed: 3,
  illustration: 4,
  sacred: 5,
  crown: 6,
}

/* ------------------------------------------------------------------- cards */

export type CardKind = 'figure' | 'covenant' | 'relic'
export type Stage = 'basic' | 'ascended-1' | 'ascended-2'

export interface Attack {
  name: string
  /** Energy required, as a list of types. `null` means any type will do. */
  cost: (EnergyType | null)[]
  damage: number
  /** Rules text shown on the card. */
  text?: string
  /** Identifier the engine matches to an effect implementation. */
  effect?: string
}

interface CardBase {
  id: string
  name: string
  rarity: Rarity
  /** Set this card belongs to, e.g. 'genesis'. */
  set: string
  /** Scripture reference shown in the card footer. */
  verse?: string
  /** Italic flavour line. */
  flavor?: string
}

export interface FigureCard extends CardBase {
  kind: 'figure'
  type: EnergyType
  stage: Stage
  /** Card id this Figure ascends from. Required unless the stage is `basic`. */
  ascendsFrom?: string
  /** Whether the ascension is a renaming or a generation passing. */
  ascension?: 'calling' | 'lineage'
  hp: number
  attacks: Attack[]
  /** Colourless energy needed to retreat. */
  retreat: number
  /** Anointed Figures are worth 2 points when knocked out. */
  anointed?: boolean
}

export interface CovenantCard extends CardBase {
  kind: 'covenant'
  text: string
  effect: string
}

export interface RelicCard extends CardBase {
  kind: 'relic'
  text: string
  effect: string
}

export type Card = FigureCard | CovenantCard | RelicCard

export const isFigure = (c: Card): c is FigureCard => c.kind === 'figure'

/** Points scored for knocking this Figure out. */
export const pointsFor = (c: FigureCard): number => (c.anointed ? 2 : 1)

/* -------------------------------------------------------------------- sets */

export interface PackDefinition {
  id: string
  /** Set this pack draws from. */
  set: string
  name: string
  /** One-line description shown on the pack detail sheet. */
  tagline: string
  /** Card ids only obtainable from this pack. */
  exclusives: string[]
  /** Type that themes the wrapper art. */
  theme: EnergyType
}

export interface SetDefinition {
  id: string
  name: string
  code: string
  packs: PackDefinition[]
}

/* ------------------------------------------------------------------- decks */

export interface Deck {
  id: string
  name: string
  /** Card ids, with duplicates repeated. Length must be DECK_SIZE to be legal. */
  cards: string[]
  /** The one or two types the Altar draws from. */
  energy: EnergyType[]
  /** Card id whose art represents the deck in lists. */
  coverCardId?: string
  updatedAt: number
}
