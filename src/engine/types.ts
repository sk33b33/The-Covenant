import type { EnergyType } from '@/game/types'

/**
 * Match state.
 *
 * Everything the rules need and nothing they do not — no React, no DOM, no
 * timers. The whole match is a value: given the same starting state and the
 * same action sequence, the result is identical, which is what makes the rules
 * testable and a match replayable from its seed.
 */

export type PlayerId = 'you' | 'foe'

export const OPPONENT: Record<PlayerId, PlayerId> = { you: 'foe', foe: 'you' }

export type StatusKind =
  | 'blessed'
  | 'bound'
  | 'blinded'
  | 'afflicted'
  | 'slumber'
  /** Cannot be knocked out this turn (The Covenant Rainbow, The Ram). */
  | 'enduring'
  /** All damage prevented until the end of the opponent's next turn. */
  | 'shielded'
  /** Damage reduced by a flat amount. */
  | 'guarded'
  /** No weakness applied against this Figure. */
  | 'unweak'

/**
 * A status and when it lapses.
 *
 * Every temporary effect in the game is worded "until the end of your next
 * turn" or similar, which spans the opponent's turn in between. Storing an
 * explicit expiry turn is the only model that gets that right — clearing
 * statuses at the end of the owner's turn would drop a shield before the attack
 * it was raised against ever lands.
 *
 * `until` is a turn number, inclusive: the status is purged once `state.turn`
 * has moved past it. `Infinity` means it lasts until something removes it,
 * which is how Afflicted works — it stays until the Figure leaves the Active
 * spot.
 */
export interface Status {
  kind: StatusKind
  until: number
}

/** A Figure on the board, with everything stacked on and attached to it. */
export interface FigureInPlay {
  /** Stable identity across ascensions, so the UI can animate one object. */
  uid: string
  /** The card currently on top — the one whose stats apply. */
  cardId: string
  /** Cards underneath, oldest first. Discarded together on a knockout. */
  beneath: string[]
  damage: number
  energy: EnergyType[]
  statuses: Status[]
  /** Turn number this Figure entered play; it cannot ascend on that turn. */
  enteredOnTurn: number
  /** Flat damage reduction from attached Relics. */
  armor: number
  /** Flat damage bonus from attached Relics. */
  attackBonus: number
  /** Retreat cost reduction from attached Relics. */
  retreatDiscount: number
  /** Relic card ids attached, so they discard with the Figure. */
  attachments: string[]
}

export interface PlayerState {
  id: PlayerId
  /** Draw pile, top of deck first. */
  deck: string[]
  hand: string[]
  discard: string[]
  active: FigureInPlay | null
  /** Fixed-length; a null is an empty bench slot. */
  bench: (FigureInPlay | null)[]
  /** Types the Altar may supply. Declared by the deck. */
  energyTypes: EnergyType[]
  /** Energy generated this turn and not yet attached. */
  altar: EnergyType | null
  points: number

  /* Per-turn counters, reset at the start of each of this player's turns. */
  attachedThisTurn: number
  covenantsThisTurn: number
  retreatsThisTurn: number
  attackedThisTurn: boolean
  /** Set by Babel: this player may not play Covenants on their next turn. */
  covenantsLocked: boolean
  /** Set by The Signet Ring: one Covenant this turn is free of the limit. */
  extraCovenant: boolean
}

export type Phase =
  /** The coin has been flipped; both players are placing their opening board. */
  | 'setup'
  /** Normal play. */
  | 'main'
  /** A Figure was knocked out and its owner must promote from the bench. */
  | 'promote'
  | 'ended'

export type EndReason = 'points' | 'deckout' | 'no-figures' | 'concede' | 'timeout'

export interface LogEntry {
  turn: number
  player: PlayerId
  /** Human-readable, shown in the battle log. */
  text: string
}

export interface MatchState {
  seed: number
  /** RNG cursor, advanced in place so the match stays replayable. */
  rngState: number

  /** 1-based; increments on every player's turn, not every round. */
  turn: number
  current: PlayerId
  /** Who won the coin flip and took the first turn. */
  first: PlayerId
  phase: Phase
  /** Whose bench we are waiting on during `promote`. */
  promoting: PlayerId | null

  players: Record<PlayerId, PlayerState>

  winner: PlayerId | null
  endReason: EndReason | null

  log: LogEntry[]
}
