import { requireCard } from '@/data/cards'
import { RULES } from '@/game/config'
import { isFigure } from '@/game/types'
import {
  canPayCost,
  figureCard,
  figuresInPlay,
  hasStatus,
  isFirstPlayersOpeningTurn,
  retreatCost,
} from './state'
import type { Action } from './actions'
import type { MatchState, PlayerId } from './types'

/**
 * Every action the player to move may legally take.
 *
 * One enumerator serves both the interface (which greys out what is not here)
 * and the AI (which chooses from exactly this list). Sharing it is what
 * guarantees the AI cannot make a move a human could not, and that a button the
 * interface offers will not be rejected by the reducer.
 *
 * The reducer still validates independently — this is a convenience, not the
 * authority.
 */
export function legalActions(state: MatchState): Action[] {
  if (state.phase === 'ended') return []

  if (state.phase === 'promote') {
    const owner = state.promoting
    if (!owner) return []
    return state.players[owner].bench
      .map((figure, benchIndex) => ({ figure, benchIndex }))
      .filter(({ figure }) => figure !== null)
      .map(({ benchIndex }) => ({ type: 'PROMOTE', benchIndex }) as Action)
  }

  if (state.phase === 'setup') {
    // Setup is enumerated separately: the combinatorics of choosing an Active
    // plus up to three benched Figures from a five-card hand are large, and the
    // interface drives it directly. `setupOptions` covers the AI's needs.
    return []
  }

  const me = state.current
  const player = state.players[me]
  const actions: Action[] = []

  /* Play Basic Figures to empty bench slots. */
  player.hand.forEach((cardId, hand) => {
    const card = requireCard(cardId)
    if (!isFigure(card) || card.stage !== 'basic') return

    const slot = player.bench.findIndex((s) => s === null)
    if (slot >= 0) actions.push({ type: 'PLAY_FIGURE', hand, slot })
  })

  /* Attach the Altar's energy. */
  if (player.altar !== null && player.attachedThisTurn < RULES.ATTACHES_PER_TURN) {
    for (const figure of figuresInPlay(player)) {
      actions.push({ type: 'ATTACH', uid: figure.uid })
    }
  }

  /* Ascend. */
  player.hand.forEach((cardId, hand) => {
    const card = requireCard(cardId)
    if (!isFigure(card) || card.stage === 'basic' || !card.ascendsFrom) return

    for (const figure of figuresInPlay(player)) {
      if (figure.cardId !== card.ascendsFrom) continue
      if (figure.enteredOnTurn >= state.turn) continue
      actions.push({ type: 'ASCEND', hand, uid: figure.uid })
    }
  })

  /* Covenants and Relics. */
  const covenantAllowed =
    !player.covenantsLocked &&
    (player.covenantsThisTurn < RULES.COVENANTS_PER_TURN || player.extraCovenant)

  player.hand.forEach((cardId, hand) => {
    const card = requireCard(cardId)
    if (card.kind === 'covenant' && covenantAllowed) {
      actions.push({ type: 'PLAY_COVENANT', hand })
    }
    if (card.kind === 'relic') {
      if (card.effect.startsWith('attach-')) {
        for (const figure of figuresInPlay(player)) {
          actions.push({ type: 'PLAY_RELIC', hand, targetUid: figure.uid })
        }
      } else {
        actions.push({ type: 'PLAY_RELIC', hand })
      }
    }
  })

  /* Retreat. */
  const active = player.active
  if (
    active &&
    player.retreatsThisTurn < RULES.RETREATS_PER_TURN &&
    !hasStatus(active, 'bound') &&
    !hasStatus(active, 'slumber') &&
    active.energy.length >= retreatCost(active)
  ) {
    player.bench.forEach((figure, benchIndex) => {
      if (figure) actions.push({ type: 'RETREAT', benchIndex })
    })
  }

  /* Attack. */
  if (active && !player.attackedThisTurn && !isFirstPlayersOpeningTurn(state)) {
    if (!hasStatus(active, 'slumber')) {
      figureCard(active).attacks.forEach((attack, attackIndex) => {
        if (canPayCost(active, attack.cost)) actions.push({ type: 'ATTACK', attackIndex })
      })
    }
  }

  actions.push({ type: 'END_TURN' })
  return actions
}

/* -------------------------------------------------------------------- setup */

export interface SetupOption {
  active: number
  bench: number[]
}

/**
 * Reasonable opening placements for a hand.
 *
 * Not exhaustive — the full set is every ordered choice of one Active and up to
 * three benched Figures, which explodes combinatorially for no benefit. This
 * offers each Basic as the Active with the remaining Basics benched, which is
 * what a player almost always wants: a full board.
 */
export function setupOptions(state: MatchState, playerId: PlayerId): SetupOption[] {
  const player = state.players[playerId]

  const basics = player.hand
    .map((cardId, index) => ({ cardId, index }))
    .filter(({ cardId }) => {
      const card = requireCard(cardId)
      return isFigure(card) && card.stage === 'basic'
    })

  return basics.map(({ index }) => ({
    active: index,
    bench: basics
      .filter((b) => b.index !== index)
      .slice(0, RULES.BENCH_SIZE)
      .map((b) => b.index),
  }))
}
