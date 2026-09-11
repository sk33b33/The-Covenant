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
  /**
   * The type the Altar will supply on this player's *next* turn — rolled one
   * turn ahead of when it's actually granted, rather than at the moment it's
   * needed, so the screen can show it in advance. `energyTypes` is the only
   * other source that decides one, and it never runs out: `beginTurn` always
   * refills this the instant it hands the current value off to `altar`.
   */
  nextAltar: EnergyType
  points: number

  /* Per-turn counters, reset at the start of each of this player's turns. */
  attachedThisTurn: number
  covenantsThisTurn: number
  retreatsThisTurn: number
  attackedThisTurn: boolean
  /**
   * Uids that have already ascended this turn — one ascension per slot per
   * turn, not per Figure across its whole time in play. A Figure's own uid
   * survives its own ascension (`cardId` changes, the object doesn't), so
   * the uid already identifies the *slot* for exactly as long as the
   * enteredOnTurn rule already allows an ascension to be considered at all;
   * nothing can occupy that slot mid-turn and reach this list too, since a
   * freshly entered Figure is blocked from ascending by that same rule.
   */
  ascendedThisTurn: string[]

  /**
   * Uids that have already called a miracle this turn. Same shape and same
   * reasoning as `ascendedThisTurn` above: one per Figure per turn, so a
   * miracle is a move you spend rather than a button you can hold down —
   * without a limit, healing to full is free and endless within one turn.
   */
  miraclesThisTurn: string[]
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

export type EndReason = 'points' | 'no-figures' | 'concede' | 'timeout'

export interface LogEntry {
  turn: number
  player: PlayerId
  /** Human-readable, shown in the battle log. */
  text: string
  /**
   * Structured detail for the post-match breakdown screen, alongside the
   * prose above rather than replacing it — the same one-entry-per-happening
   * cadence this file already keeps, just with enough shape for a screen to
   * build a timeline, a stat line and a "cards used" strip from it instead
   * of only ever printing it.
   *
   * Optional: a hand-off banner, a shield fizzling, the closing "X wins" line
   * are all real log entries with nothing under them worth charting.
   */
  event?: MatchEvent
}

export interface MatchEvent {
  kind:
    | 'play'
    | 'ascend'
    | 'attach'
    | 'retreat'
    | 'covenant'
    | 'relic'
    | 'miracle'
    | 'attack'
    | 'knockout'
  /** The card the event is centred on — the Figure played, the attacker, the
   *  Figure knocked out, whatever a screen would put a thumbnail of. */
  cardId: string
  /** The attacking Figure's own identity, for `attack` — a Figure's cardId
   *  changes on ascension, but its uid doesn't, so this is what lets damage
   *  dealt before and after an ascension still be credited to one Figure. */
  uid?: string
  /** A second card the event involves, where there is one: what an
   *  ascension climbed from, who a retreating Figure hands off to, what an
   *  attack landed on. */
  otherCardId?: string
  /** The energy type attached, for `attach`. */
  energyType?: EnergyType
  /** Damage actually applied, for `attack` — after shields, Guarded and
   *  armor, the same figure `AttackEvent.damage` reports. */
  damage?: number
  weakness?: boolean
  knockedOut?: boolean
  /** A Blinded Figure's coin-flip miss. */
  missed?: boolean
  /** Points earned, for `knockout` — 0 when a deny-points effect withheld
   *  them. */
  points?: number
  /** Overrides the card name as the row's headline — a miracle is the
   *  ability that was called, not merely a fact about the card that has one. */
  label?: string
}

/**
 * A structured record of the most recent attack, for the UI to animate —
 * `log` only ever carries prose, which is fine for the battle log but not
 * enough to drive an effect keyed to the attacker's element or the exact
 * damage that landed. `id` only ever increases, so a screen can tell a fresh
 * attack from the one it already animated without the engine needing to
 * "clear" this field on its behalf.
 */
export interface AttackEvent {
  id: number
  by: PlayerId
  attackerCardId: string
  /** Absent if there was nothing in the Active spot to strike. */
  targetCardId?: string
  type: EnergyType
  /** Damage actually applied, after shields, guard and armor. */
  damage: number
  weakness: boolean
  /** Whether this hit is what took the target down. */
  knockedOut: boolean
  /** A Blinded Figure's coin-flip miss — nothing else in `AttackEvent` is
   *  meaningful when this is set. */
  missed: boolean
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
  /** The most recent attack, for the UI to animate. Null until the first one. */
  lastAttack: AttackEvent | null
}
