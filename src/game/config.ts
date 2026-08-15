/**
 * Every tunable number in The Covenant.
 *
 * The rules doc marks these with ⚙. Nothing elsewhere should hardcode a rule
 * value — balance passes happen here and nowhere else.
 */

export const RULES = {
  /* Deck construction */
  DECK_SIZE: 20,
  MAX_COPIES: 2,
  MIN_BASIC_FIGURES: 1,
  MIN_ENERGY_TYPES: 1,
  MAX_ENERGY_TYPES: 2,

  /* Board */
  BENCH_SIZE: 3,
  OPENING_HAND: 5,

  /* Turn economy */
  ENERGY_PER_TURN: 1,
  ATTACHES_PER_TURN: 1,
  COVENANTS_PER_TURN: 1,
  RETREATS_PER_TURN: 1,

  /* Combat */
  WEAKNESS_BONUS: 20,
  BLESSED_BONUS: 20,
  AFFLICTED_DAMAGE: 10,

  /* Victory */
  POINTS_TO_WIN: 3,
  POINTS_FIGURE: 1,
  POINTS_ANOINTED: 2,

  /* Clocks, in seconds */
  TURN_SECONDS: 60,
  MATCH_SECONDS: 20 * 60,
} as const

export const ECONOMY = {
  /* Free packs */
  PACK_SLOTS: 2,
  /** Milliseconds for one pack slot to refill. */
  SLOT_REFILL_MS: 12 * 60 * 60 * 1000,

  /* Packs */
  CARDS_PER_PACK: 5,
  /** A Rare or better is guaranteed at least this often. */
  PITY_INTERVAL: 10,
  /** Grace needed to instantly refill one pack slot. */
  GRACE_PER_SLOT: 6,
  /** Talents to buy one pack outright. */
  TALENTS_PER_PACK: 200,

  /** Talents refunded when a pull duplicates a card you already own. */
  DUPLICATE_TALENTS: {
    common: 10,
    uncommon: 25,
    rare: 60,
    anointed: 150,
    illustration: 300,
    sacred: 600,
    crown: 1500,
  },

  /* Rewards */
  TALENTS_PER_WIN: 60,
  TALENTS_PER_LOSS: 20,
  XP_PER_WIN: 45,
  XP_PER_LOSS: 15,
  XP_PER_PACK: 10,
} as const

/** XP required to advance from the given level to the next. */
export const xpForLevel = (level: number): number => 80 + (level - 1) * 25

/** Starting purse, enough for one bought pack after the two free ones. */
export const STARTING_TALENTS = 250
export const STARTING_GRACE = 6
