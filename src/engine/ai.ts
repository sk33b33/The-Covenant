import { requireCard } from '@/data/cards'
import { RULES } from '@/game/config'
import { createRng, type Rng } from '@/game/rng'
import { WEAKNESS, isFigure } from '@/game/types'
import { legalActions, setupOptions } from './legal'
import { reduce } from './reducer'
import { canPayCost, figureCard, figuresInPlay, hasStatus, remainingHp } from './state'
import type { Action } from './actions'
import { OPPONENT, type MatchState, type PlayerId } from './types'

/**
 * The opponent.
 *
 * Heuristic, not learned. Each turn it scores every action `legalActions`
 * offers — the same list the interface offers a human — and takes the best one,
 * repeatedly, until it ends its turn. Nothing here reads hidden information:
 * it sees its own hand and the visible board, exactly as a player does.
 *
 * `mistakeRate` is what makes early story encounters winnable. At 0 it always
 * takes its best line; at 0.5 it discards the best option half the time and
 * takes a lesser one. That is a more honest difficulty dial than giving it
 * extra energy or letting it peek.
 */

export interface AiConfig {
  /** 0 = perfect play, 1 = ignores its own evaluation entirely. */
  mistakeRate: number
}

export const DIFFICULTY: Record<'gentle' | 'steady' | 'hard', AiConfig> = {
  gentle: { mistakeRate: 0.42 },
  steady: { mistakeRate: 0.2 },
  hard: { mistakeRate: 0.04 },
}

/* ------------------------------------------------------------------ scoring */

/** Damage `attackIndex` would deal to the current defender, weakness included. */
function projectedDamage(state: MatchState, me: PlayerId, attackIndex: number): number {
  const attacker = state.players[me].active
  const defender = state.players[OPPONENT[me]].active
  if (!attacker || !defender) return 0

  const card = figureCard(attacker)
  const attack = card.attacks[attackIndex]
  if (!attack) return 0

  let damage = attack.damage + attacker.attackBonus
  if (hasStatus(attacker, 'blessed')) damage += RULES.BLESSED_BONUS

  const defenderCard = figureCard(defender)
  if (WEAKNESS[defenderCard.type] === card.type && !hasStatus(defender, 'unweak')) {
    damage += RULES.WEAKNESS_BONUS
  }

  if (hasStatus(defender, 'shielded')) return 0
  if (hasStatus(defender, 'guarded')) damage = Math.max(0, damage - 30)
  return Math.max(0, damage - defender.armor)
}

function score(state: MatchState, me: PlayerId, action: Action): number {
  const player = state.players[me]
  const them = state.players[OPPONENT[me]]

  switch (action.type) {
    case 'ATTACK': {
      const defender = them.active
      if (!defender) return 0

      const damage = projectedDamage(state, me, action.attackIndex)
      const kills = damage >= remainingHp(defender)
      const worth = figureCard(defender).anointed ? 2 : 1

      // Winning the match outranks everything.
      if (kills && player.points + worth >= RULES.POINTS_TO_WIN) return 10_000
      if (kills) return 1_000 + worth * 200 + damage
      return 100 + damage
    }

    case 'ASCEND': {
      // Ascending is a large stat gain and gates the better attacks.
      return 420
    }

    case 'ATTACH': {
      const figure = figuresInPlay(player).find((f) => f.uid === action.uid)
      if (!figure) return 0

      // Prefer the Active, and prefer a Figure that an extra energy actually
      // unlocks an attack for.
      const isActive = player.active?.uid === figure.uid
      const card = figureCard(figure)

      const unlocks = card.attacks.some((attack) => {
        if (canPayCost(figure, attack.cost)) return false
        const speculative = { ...figure, energy: [...figure.energy, player.altar!] }
        return canPayCost(speculative, attack.cost)
      })

      return 300 + (isActive ? 90 : 0) + (unlocks ? 160 : 0)
    }

    case 'PLAY_FIGURE': {
      // A bench is insurance against a knockout ending the match outright, so
      // the first one or two matter far more than the third.
      const occupied = player.bench.filter(Boolean).length
      return 260 - occupied * 70
    }

    case 'PLAY_COVENANT':
    case 'PLAY_RELIC': {
      const card = requireCard(player.hand[action.hand]!)
      const effect = 'effect' in card ? card.effect : ''

      // Healing is only worth it on a damaged Figure; drawing is always fine.
      if (effect.startsWith('heal') && (player.active?.damage ?? 0) === 0) return 20
      if (effect.startsWith('attach-')) return 190
      if (effect.startsWith('draw') || effect.startsWith('search') || effect === 'tutor-any') {
        return 210
      }
      return 150
    }

    case 'RETREAT': {
      const active = player.active
      const incoming = player.bench[action.benchIndex]
      if (!active || !incoming) return 0

      const defender = them.active
      if (!defender) return 0

      // Retreat to save a Figure about to be knocked out, or to bring in one
      // that hits the current defender's weakness.
      const activeAtRisk = remainingHp(active) <= 30 ? 220 : 0
      const defenderCard = figureCard(defender)
      const incomingIsFavourable =
        WEAKNESS[defenderCard.type] === figureCard(incoming).type ? 180 : 0

      const cost = active.energy.length > 0 ? 60 : 0
      return activeAtRisk + incomingIsFavourable - cost
    }

    case 'PROMOTE': {
      const figure = player.bench[action.benchIndex]
      if (!figure) return 0
      // Promote the healthiest, most developed Figure.
      return remainingHp(figure) + figure.energy.length * 25
    }

    case 'END_TURN':
      // Always available, always last resort.
      return 1

    default:
      return 0
  }
}

/* -------------------------------------------------------------------- play */

function chooseAction(state: MatchState, me: PlayerId, config: AiConfig, rng: Rng): Action | null {
  const options = legalActions(state)
  if (options.length === 0) return null

  const scored = options
    .map((action) => ({ action, value: score(state, me, action) }))
    .sort((a, b) => b.value - a.value)

  // A mistake takes a random legal action instead of the best one — but never
  // one scored at zero, so the AI still looks like it is trying.
  if (rng.chance(config.mistakeRate) && scored.length > 1) {
    const viable = scored.filter((s) => s.value > 0)
    if (viable.length > 1) return rng.pick(viable).action
  }

  return scored[0]!.action
}

/** The AI's opening placement: the Basic with the most HP as Active, rest benched. */
export function aiSetup(state: MatchState, me: PlayerId, rng: Rng): Action {
  const options = setupOptions(state, me)
  if (options.length === 0) throw new Error('AI has no legal opening placement')

  const player = state.players[me]
  const best = options
    .map((option) => {
      const card = requireCard(player.hand[option.active]!)
      const hp = isFigure(card) ? card.hp : 0
      return { option, hp }
    })
    .sort((a, b) => b.hp - a.hp)

  // A small chance of a worse opener, so the AI does not always lead perfectly.
  const chosen = rng.chance(0.15) && best.length > 1 ? rng.pick(best) : best[0]!
  return { type: 'SETUP', player: me, ...chosen.option }
}

/**
 * Plays the AI's entire turn.
 *
 * Bounded: an effect that hands the AI another action every time it acts would
 * otherwise loop forever. Hitting the cap ends the turn, which is always legal.
 */
export function playAiTurn(
  state: MatchState,
  me: PlayerId,
  config: AiConfig = DIFFICULTY.steady,
  maxActions = 40,
): MatchState {
  const rng = createRng(state.rngState ^ 0x9e3779b9)
  let next = state

  for (let i = 0; i < maxActions; i++) {
    if (next.phase === 'ended') return next

    // A promotion may be owed by either side; only act on our own.
    if (next.phase === 'promote') {
      if (next.promoting !== me) return next
    } else if (next.current !== me) {
      return next
    }

    const action = chooseAction(next, me, config, rng)
    if (!action) return next

    next = reduce(next, action)
    if (action.type === 'END_TURN' || action.type === 'ATTACK') {
      // Both pass the turn, unless a promotion is now owed.
      if (next.phase !== 'promote' || next.promoting !== me) return next
    }
  }

  return next.phase === 'main' && next.current === me ? reduce(next, { type: 'END_TURN' }) : next
}
