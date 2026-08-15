import { getCard, requireCard } from '@/data/cards'
import { RULES } from '@/game/config'
import { createRng, type Rng } from '@/game/rng'
import { isFigure, type EnergyType, type FigureCard } from '@/game/types'
import type { FigureInPlay, MatchState, PlayerId, PlayerState, StatusKind } from './types'

/**
 * Building and inspecting match state.
 *
 * All mutation happens on drafts inside the reducer; these are the constructors
 * and the read-only queries both the reducer and the AI rely on.
 */

export interface MatchSetup {
  seed: number
  you: { deck: string[]; energy: EnergyType[] }
  foe: { deck: string[]; energy: EnergyType[] }
  /** Forces the coin flip, for tests and scripted story encounters. */
  forceFirst?: PlayerId
}

let uidCounter = 0
export const nextUid = () => `f${++uidCounter}`
/** Test hook, so uids are stable across runs. */
export const resetUids = () => {
  uidCounter = 0
}

export function makeFigure(cardId: string, turn: number): FigureInPlay {
  return {
    uid: nextUid(),
    cardId,
    beneath: [],
    damage: 0,
    energy: [],
    statuses: [],
    enteredOnTurn: turn,
    armor: 0,
    attackBonus: 0,
    retreatDiscount: 0,
    attachments: [],
  }
}

/**
 * Shuffles until the opening hand holds at least one Basic Figure.
 *
 * The alternative — a mulligan with a penalty — punishes a player for variance
 * they did not choose. Guaranteeing a legal opening removes the worst
 * non-game in the format at no cost to anyone's decisions. Bounded so a deck
 * that somehow cannot produce one fails loudly instead of hanging.
 */
export function dealOpeningHand(deck: string[], rng: Rng): { hand: string[]; rest: string[] } {
  const hasBasic = (ids: string[]) =>
    ids.some((id) => {
      const card = getCard(id)
      return card && isFigure(card) && card.stage === 'basic'
    })

  if (!hasBasic(deck)) {
    throw new Error('Deck contains no Basic Figure, so no legal opening hand exists')
  }

  for (let attempt = 0; attempt < 200; attempt++) {
    const shuffled = rng.shuffle(deck)
    const hand = shuffled.slice(0, RULES.OPENING_HAND)
    if (hasBasic(hand)) {
      return { hand, rest: shuffled.slice(RULES.OPENING_HAND) }
    }
  }

  throw new Error('Could not deal an opening hand containing a Basic Figure')
}

function makePlayer(id: PlayerId, deck: string[], energy: EnergyType[], rng: Rng): PlayerState {
  const { hand, rest } = dealOpeningHand(deck, rng)

  return {
    id,
    deck: rest,
    hand,
    discard: [],
    active: null,
    bench: Array(RULES.BENCH_SIZE).fill(null),
    energyTypes: energy,
    altar: null,
    points: 0,
    attachedThisTurn: 0,
    covenantsThisTurn: 0,
    retreatsThisTurn: 0,
    attackedThisTurn: false,
    covenantsLocked: false,
    extraCovenant: false,
  }
}

export function createMatch(setup: MatchSetup): MatchState {
  const rng = createRng(setup.seed)

  // The flip happens before anything is dealt, so the same seed always
  // produces the same flip regardless of deck contents.
  const first: PlayerId = setup.forceFirst ?? (rng.chance(0.5) ? 'you' : 'foe')

  const players = {
    you: makePlayer('you', setup.you.deck, setup.you.energy, rng),
    foe: makePlayer('foe', setup.foe.deck, setup.foe.energy, rng),
  }

  return {
    seed: setup.seed,
    rngState: rng.state(),
    turn: 1,
    current: first,
    first,
    phase: 'setup',
    promoting: null,
    players,
    winner: null,
    endReason: null,
    log: [
      {
        turn: 0,
        player: first,
        text: `The coin falls ${first === 'you' ? 'heads' : 'tails'}. ${
          first === 'you' ? 'You go' : 'Your opponent goes'
        } first.`,
      },
    ],
  }
}

/* ------------------------------------------------------------------ queries */

export const figureCard = (figure: FigureInPlay): FigureCard => {
  const card = requireCard(figure.cardId)
  if (!isFigure(card)) throw new Error(`${figure.cardId} is in play but is not a Figure`)
  return card
}

export const remainingHp = (figure: FigureInPlay): number =>
  Math.max(0, figureCard(figure).hp - figure.damage)

export const isKnockedOut = (figure: FigureInPlay): boolean =>
  figure.damage >= figureCard(figure).hp

/** Active plus every occupied bench slot. */
export function figuresInPlay(player: PlayerState): FigureInPlay[] {
  const out: FigureInPlay[] = []
  if (player.active) out.push(player.active)
  for (const slot of player.bench) if (slot) out.push(slot)
  return out
}

export function findFigure(state: MatchState, uid: string): FigureInPlay | null {
  for (const id of ['you', 'foe'] as PlayerId[]) {
    for (const figure of figuresInPlay(state.players[id])) {
      if (figure.uid === uid) return figure
    }
  }
  return null
}

export const benchCount = (player: PlayerState): number =>
  player.bench.filter(Boolean).length

export const firstEmptyBenchSlot = (player: PlayerState): number =>
  player.bench.findIndex((s) => s === null)

/**
 * The turn-1 handicap. The player who went first receives no energy and may
 * not attack on their opening turn: they trade tempo for board position, and
 * become the first to Ascend on round two.
 */
export const isFirstPlayersOpeningTurn = (state: MatchState): boolean =>
  state.turn === 1 && state.current === state.first

/** Energy costs are satisfied by matching types first, then colourless. */
export function canPayCost(figure: FigureInPlay, cost: (EnergyType | null)[]): boolean {
  const pool = [...figure.energy]

  // Typed requirements must be met exactly, so consume them before the
  // colourless ones can eat a matching orb.
  for (const requirement of cost) {
    if (requirement === null) continue
    const index = pool.indexOf(requirement)
    if (index === -1) return false
    pool.splice(index, 1)
  }

  const colourless = cost.filter((c) => c === null).length
  return pool.length >= colourless
}

/** Retreat cost after any Relic discount. */
export const retreatCost = (figure: FigureInPlay): number =>
  Math.max(0, figureCard(figure).retreat - figure.retreatDiscount)

export const hasStatus = (figure: FigureInPlay, kind: StatusKind): boolean =>
  figure.statuses.some((s) => s.kind === kind)

/** Adds a status, extending rather than duplicating one already present. */
export function applyStatus(figure: FigureInPlay, kind: StatusKind, until: number): void {
  const existing = figure.statuses.find((s) => s.kind === kind)
  if (existing) existing.until = Math.max(existing.until, until)
  else figure.statuses.push({ kind, until })
}

export const removeStatus = (figure: FigureInPlay, kind: StatusKind): void => {
  figure.statuses = figure.statuses.filter((s) => s.kind !== kind)
}

/** Drops statuses whose expiry turn has passed. */
export const expireStatuses = (figure: FigureInPlay, turn: number): void => {
  figure.statuses = figure.statuses.filter((s) => s.until >= turn)
}

/** Deep copy, so the reducer can hand back a new value without aliasing. */
export const cloneMatch = (state: MatchState): MatchState =>
  structuredClone(state) as MatchState
