import type { PlayerId } from './types'

/**
 * Every move a player can make.
 *
 * The interface and the AI both choose from this one union, and both go through
 * the same legality check — there is no path by which the AI can do something a
 * human could not, or vice versa.
 */
export type Action =
  /** Place the opening board. Both players do this during `setup`. */
  | {
      type: 'SETUP'
      player: PlayerId
      /** Hand index of the Basic Figure to make Active. */
      active: number
      /** Hand indices of Basic Figures to bench, in order. */
      bench: number[]
    }
  /** Play a Basic Figure from hand to an empty bench slot. */
  | { type: 'PLAY_FIGURE'; hand: number; slot: number }
  /** Attach the Altar's energy to a Figure in play. */
  | { type: 'ATTACH'; uid: string }
  /** Ascend: place an ascended card from hand on top of a Figure in play. */
  | { type: 'ASCEND'; hand: number; uid: string }
  | { type: 'PLAY_COVENANT'; hand: number; targetUid?: string }
  | { type: 'PLAY_RELIC'; hand: number; targetUid?: string }
  /** Swap the Active Figure with a benched one, paying its retreat cost. */
  | { type: 'RETREAT'; benchIndex: number }
  | { type: 'ATTACK'; attackIndex: number }
  | { type: 'END_TURN' }
  /** Move a benched Figure into an empty Active spot after a knockout. */
  | { type: 'PROMOTE'; benchIndex: number }
  | { type: 'CONCEDE'; player: PlayerId }
  /** A player's match clock expired. */
  | { type: 'TIMEOUT'; player: PlayerId }

export type ActionType = Action['type']
