import { requireCard } from '@/data/cards'
import { miracleFor } from '@/game/miracles'
import { RULES } from '@/game/config'
import { createRng, type Rng } from '@/game/rng'
import { WEAKNESS, isFigure, pointsFor } from '@/game/types'
import { runEffect, type EffectContext } from './effects'
import {
  applyStatus,
  benchCount,
  canPayCost,
  cloneMatch,
  expireStatuses,
  figureCard,
  figuresInPlay,
  hasStatus,
  isFirstPlayersOpeningTurn,
  isKnockedOut,
  makeFigure,
  removeStatus,
  retreatCost,
} from './state'
import type { Action } from './actions'
import {
  OPPONENT,
  type FigureInPlay,
  type MatchEvent,
  type MatchState,
  type PlayerId,
} from './types'

/**
 * The rules.
 *
 * `reduce(state, action)` returns a new state or throws. It never mutates its
 * input, never reaches outside itself, and consumes randomness only through the
 * RNG seeded into the state — so a match is fully determined by its seed and
 * its action list, and can be replayed or verified anywhere.
 *
 * Legality is checked here rather than trusted from the caller. `legalActions`
 * in legal.ts offers the same answers to the UI and the AI, but this is the
 * authority: an illegal action throws rather than silently doing nothing.
 */

export class IllegalAction extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'IllegalAction'
  }
}

/* ------------------------------------------------------------------ helpers */

/** Advances the state's RNG cursor so randomness stays part of the value. */
function withRng<T>(state: MatchState, fn: (rng: Rng) => T): T {
  const rng = createRng(state.rngState)
  const result = fn(rng)
  state.rngState = rng.state()
  return result
}

/*
 * Phase is read through these rather than compared inline.
 *
 * TypeScript narrows `state.phase` to 'main' after the guards at the top of
 * normal play, and cannot see that resolving an attack or an effect may end the
 * match or open a promotion. Taking the state as a parameter defeats the
 * narrowing, so these checks stay honest.
 */
const isEnded = (s: MatchState) => s.phase === 'ended'
const isPromoting = (s: MatchState) => s.phase === 'promote'

function log(state: MatchState, player: PlayerId, text: string, event?: MatchEvent) {
  state.log.push({ turn: state.turn, player, text, event })
}

const name = (cardId: string) => requireCard(cardId).name

function endMatch(state: MatchState, winner: PlayerId, reason: MatchState['endReason']) {
  state.phase = 'ended'
  state.winner = winner
  state.endReason = reason
  state.promoting = null
  log(state, winner, `${winner === 'you' ? 'You win' : 'Your opponent wins'} — ${reason}.`)
}

function checkPoints(state: MatchState, player: PlayerId) {
  if (state.players[player].points >= RULES.POINTS_TO_WIN) {
    endMatch(state, player, 'points')
  }
}

/** Moves a knocked-out Figure, everything under it and everything on it, to the discard. */
function discardFigure(state: MatchState, owner: PlayerId, figure: FigureInPlay) {
  const player = state.players[owner]
  player.discard.push(figure.cardId, ...figure.beneath, ...figure.attachments)
}

/**
 * Recomputes who owes a promotion, from the board rather than from memory.
 *
 * A single `promoting` field cannot describe two simultaneous vacancies, and
 * they do happen: a recoil attack such as Fratricide can knock out its own
 * Figure and the defender in one resolution. Setting the field twice used to
 * leave the first player with no Active and no pending promotion — the match
 * then limped on with an empty Active spot, unable to attack, until it timed
 * out. Deriving it means the state cannot disagree with the board.
 *
 * A player with no Active and no Bench has nothing to promote and loses.
 */
function refreshPromotion(state: MatchState) {
  if (state.phase === 'ended' || state.phase === 'setup') return

  // The current player is offered the promotion first, so a chain of them
  // resolves in a predictable order.
  for (const id of [state.current, OPPONENT[state.current]]) {
    const player = state.players[id]
    if (player.active) continue

    if (benchCount(player) > 0) {
      state.phase = 'promote'
      state.promoting = id
      return
    }

    endMatch(state, OPPONENT[id], 'no-figures')
    return
  }

  state.phase = 'main'
  state.promoting = null
}

/**
 * Resolves a knockout: awards points, clears the slot, and either ends the
 * match or hands the defender a promotion.
 */
function knockOut(state: MatchState, owner: PlayerId, figure: FigureInPlay, denyPoints = false) {
  const attacker = OPPONENT[owner]
  const card = figureCard(figure)
  const points = denyPoints ? 0 : pointsFor(card)

  const player = state.players[owner]
  if (player.active?.uid === figure.uid) player.active = null
  else {
    const index = player.bench.findIndex((s) => s?.uid === figure.uid)
    if (index >= 0) player.bench[index] = null
  }

  discardFigure(state, owner, figure)

  if (points > 0) {
    state.players[attacker].points += points
    log(
      state,
      attacker,
      `${card.name} is knocked out. ${points} point${points > 1 ? 's' : ''}.`,
      { kind: 'knockout', cardId: card.id, points },
    )
  } else {
    log(state, attacker, `${card.name} is knocked out, but no points are taken.`, {
      kind: 'knockout',
      cardId: card.id,
      points: 0,
    })
  }

  checkPoints(state, attacker)
  if (state.phase === 'ended') return

  refreshPromotion(state)
}

/** Applies damage and resolves a knockout if it lands. */
export function damageFigure(
  state: MatchState,
  owner: PlayerId,
  figure: FigureInPlay,
  amount: number,
  opts: { pierce?: boolean } = {},
) {
  if (amount <= 0) return

  let dealt = amount

  if (!opts.pierce) {
    if (hasStatus(figure, 'shielded')) {
      log(state, owner, `${name(figure.cardId)} is shielded; the damage is prevented.`)
      return
    }
    if (hasStatus(figure, 'guarded')) dealt = Math.max(0, dealt - 30)
    dealt = Math.max(0, dealt - figure.armor)
  }

  figure.damage += dealt

  if (isKnockedOut(figure)) {
    if (hasStatus(figure, 'enduring')) {
      // Survives on 10 HP rather than being knocked out this turn.
      figure.damage = figureCard(figure).hp - 10
      removeStatus(figure, 'enduring')
      log(state, owner, `${name(figure.cardId)} endures the blow.`)
      return
    }
    knockOut(state, owner, figure)
  }
}

/**
 * Draws one card. A hand already at RULES.MAX_HAND simply doesn't draw — the
 * card stays in the deck rather than being drawn only to be discarded
 * straight back out — and nor does an empty deck.
 *
 * Running out of cards used to hand the match to the opponent on the spot.
 * It no longer ends anything: a match is won by taking RULES.POINTS_TO_WIN
 * points, and a player who has stopped drawing is already playing a losing
 * game without being handed the loss outright. They keep whatever is on the
 * board and in hand, and can still take the points they need with it.
 *
 * Nothing can stall on this. The board still empties — a side with no
 * Figures left to send out loses by `no-figures` — and the match clock is
 * still overhead, so a game neither side can close out on points is decided
 * on points by `timeout` rather than running forever.
 */
function draw(state: MatchState, playerId: PlayerId, count = 1) {
  const player = state.players[playerId]

  for (let i = 0; i < count; i++) {
    if (player.hand.length >= RULES.MAX_HAND) return

    const card = player.deck.shift()
    if (card === undefined) return
    player.hand.push(card)
    // Every path that actually deals a card — the turn draw, draw-1/draw-2
    // and everything else that routes through `ctx.draw` — is this one
    // function, so this is the single place a `draw` event needs logging to
    // cover all of them. Search and dig effects land in the hand a different
    // way (see effects.ts) and log their own.
    log(state, playerId, `${name(card)} is drawn.`, { kind: 'draw', cardId: card })
  }
}

function beginTurn(state: MatchState) {
  const playerId = state.current
  const player = state.players[playerId]

  player.attachedThisTurn = 0
  player.covenantsThisTurn = 0
  player.retreatsThisTurn = 0
  player.attackedThisTurn = false
  player.ascendedThisTurn = []
  player.miraclesThisTurn = []
  player.extraCovenant = false

  // Statuses lapse by turn number, not at the end of the owner's turn, so a
  // shield raised on turn 3 still stops the attack that lands on turn 4.
  for (const id of ['you', 'foe'] as PlayerId[]) {
    for (const figure of figuresInPlay(state.players[id])) expireStatuses(figure, state.turn)
  }

  draw(state, playerId)

  // The turn-1 handicap: the player who went first gets no energy and cannot
  // attack, trading tempo for the first Ascension on round two. `nextAltar`
  // is left untouched here — it was rolled for this player's first *real*
  // turn, which this skipped one is not.
  if (isFirstPlayersOpeningTurn(state)) {
    player.altar = null
    log(state, playerId, 'Going first: no energy this turn, and no attack.')
  } else {
    // Hand off the value already promised, then roll the next one — a
    // player who has been shown what's coming can never have that answer
    // change out from under them once it's their turn to receive it.
    player.altar = player.nextAltar
    player.nextAltar = withRng(state, (rng) => rng.pick(player.energyTypes))
  }
}

function endTurn(state: MatchState) {
  const playerId = state.current
  const player = state.players[playerId]
  const active = player.active

  if (active) {
    if (hasStatus(active, 'afflicted')) {
      log(state, playerId, `${name(active.cardId)} suffers from affliction.`)
      damageFigure(state, playerId, active, RULES.AFFLICTED_DAMAGE, { pierce: true })
      if (state.phase === 'ended') return
    }

    // Re-read: the Figure may have been knocked out by affliction.
    if (player.active && hasStatus(player.active, 'slumber')) {
      const woke = withRng(state, (rng) => rng.chance(0.5))
      if (woke) {
        removeStatus(player.active, 'slumber')
        log(state, playerId, `${name(player.active.cardId)} wakes.`)
      }
    }
  }

  // A knockout from affliction leaves a promotion outstanding; the turn does
  // not pass until it is resolved.
  if (state.phase === 'promote') return

  player.altar = null
  state.turn += 1
  state.current = OPPONENT[playerId]
  beginTurn(state)
}

/* ------------------------------------------------------------------ reducer */

export function reduce(input: MatchState, action: Action): MatchState {
  const state = cloneMatch(input)

  if (state.phase === 'ended' && action.type !== 'CONCEDE') {
    throw new IllegalAction('The match has ended')
  }

  switch (action.type) {
    /* ------------------------------------------------------------- setup */
    case 'SETUP': {
      if (state.phase !== 'setup') throw new IllegalAction('Setup is already complete')

      const player = state.players[action.player]
      if (player.active) throw new IllegalAction('This player has already set up')

      const indices = [action.active, ...action.bench]
      if (new Set(indices).size !== indices.length) {
        throw new IllegalAction('The same card cannot be placed twice')
      }
      if (action.bench.length > RULES.BENCH_SIZE) {
        throw new IllegalAction(`The Bench holds at most ${RULES.BENCH_SIZE} Figures`)
      }

      for (const index of indices) {
        const cardId = player.hand[index]
        if (cardId === undefined) throw new IllegalAction(`No card at hand index ${index}`)
        const card = requireCard(cardId)
        if (!isFigure(card) || card.stage !== 'basic') {
          throw new IllegalAction(`${card.name} is not a Basic Figure`)
        }
      }

      // Read the ids first, then remove by descending index so that removing
      // one card cannot shift the position of another still to be removed.
      const activeCardId = player.hand[action.active]!
      const benchCardIds = action.bench.map((i) => player.hand[i]!)
      ;[...indices]
        .sort((a, b) => b - a)
        .forEach((i) => {
          player.hand.splice(i, 1)
        })

      player.active = makeFigure(activeCardId, state.turn)
      benchCardIds.forEach((cardId, i) => {
        player.bench[i] = makeFigure(cardId, state.turn)
      })

      log(state, action.player, `${name(activeCardId)} takes the Active spot.`, {
        kind: 'play',
        cardId: activeCardId,
        uid: player.active.uid,
      })
      benchCardIds.forEach((cardId, i) => {
        const figure = player.bench[i]
        log(state, action.player, `${name(cardId)} joins the Bench.`, {
          kind: 'play',
          cardId,
          uid: figure?.uid,
        })
      })

      if (state.players.you.active && state.players.foe.active) {
        state.phase = 'main'
        beginTurn(state)
      }
      return state
    }

    /* ------------------------------------------------------------ promote */
    case 'PROMOTE': {
      if (state.phase !== 'promote' || !state.promoting) {
        throw new IllegalAction('No promotion is pending')
      }

      const owner = state.promoting
      const player = state.players[owner]
      const figure = player.bench[action.benchIndex]
      if (!figure) throw new IllegalAction('That Bench slot is empty')

      player.bench[action.benchIndex] = null
      player.active = figure
      // Affliction is left behind when a Figure leaves the Active spot.
      removeStatus(figure, 'afflicted')
      removeStatus(figure, 'slumber')

      state.promoting = null
      state.phase = 'main'
      log(state, owner, `${name(figure.cardId)} steps up.`)

      // A second vacancy may still be outstanding — one attack can empty both
      // Active spots — so the turn does not pass until every one is filled.
      refreshPromotion(state)
      if (isPromoting(state) || isEnded(state)) return state

      // Every promotion arises during attack resolution or the end phase, and
      // both of those end the turn. Neither could finish while a spot was
      // empty, so the turn is passed here instead.
      endTurn(state)
      return state
    }

    /* --------------------------------------------------------- concede */
    case 'CONCEDE': {
      endMatch(state, OPPONENT[action.player], 'concede')
      return state
    }

    case 'TIMEOUT': {
      // Decided on points, then on the smaller remaining board. A draw is not
      // a possible result, so something has to break the tie.
      const them = OPPONENT[action.player]
      const a = state.players[action.player].points
      const b = state.players[them].points
      endMatch(state, a > b ? action.player : them, 'timeout')
      return state
    }

    default:
      break
  }

  /* Everything below is a normal-play action by the player whose turn it is. */
  if (state.phase === 'promote') {
    throw new IllegalAction('A Figure must be promoted first')
  }
  if (state.phase !== 'main') {
    throw new IllegalAction('The match is not in play')
  }

  const me = state.current
  const player = state.players[me]
  const foe = state.players[OPPONENT[me]]

  switch (action.type) {
    case 'PLAY_FIGURE': {
      const cardId = player.hand[action.hand]
      if (cardId === undefined) throw new IllegalAction('No such card in hand')

      const card = requireCard(cardId)
      if (!isFigure(card) || card.stage !== 'basic') {
        throw new IllegalAction(`${card.name} is not a Basic Figure`)
      }
      if (action.slot < 0 || action.slot >= RULES.BENCH_SIZE) {
        throw new IllegalAction('No such Bench slot')
      }
      if (player.bench[action.slot]) throw new IllegalAction('That Bench slot is taken')

      player.hand.splice(action.hand, 1)
      const figure = makeFigure(cardId, state.turn)
      player.bench[action.slot] = figure
      log(state, me, `${card.name} joins the Bench.`, {
        kind: 'play',
        cardId,
        uid: figure.uid,
      })
      return state
    }

    case 'ATTACH': {
      if (player.altar === null) throw new IllegalAction('The Altar has no energy this turn')
      if (player.attachedThisTurn >= RULES.ATTACHES_PER_TURN) {
        throw new IllegalAction('Energy has already been attached this turn')
      }

      const figure = figuresInPlay(player).find((f) => f.uid === action.uid)
      if (!figure) throw new IllegalAction('That Figure is not yours or not in play')

      const energyType = player.altar
      figure.energy.push(energyType)
      player.altar = null
      player.attachedThisTurn += 1
      log(state, me, `Energy is attached to ${name(figure.cardId)}.`, {
        kind: 'attach',
        cardId: figure.cardId,
        uid: figure.uid,
        energyType,
      })
      return state
    }

    case 'ASCEND': {
      const cardId = player.hand[action.hand]
      if (cardId === undefined) throw new IllegalAction('No such card in hand')

      const card = requireCard(cardId)
      if (!isFigure(card) || card.stage === 'basic') {
        throw new IllegalAction(`${card.name} does not ascend from anything`)
      }

      const figure = figuresInPlay(player).find((f) => f.uid === action.uid)
      if (!figure) throw new IllegalAction('That Figure is not yours or not in play')
      if (figure.cardId !== card.ascendsFrom) {
        throw new IllegalAction(`${card.name} ascends from ${card.ascendsFrom}`)
      }
      if (figure.enteredOnTurn >= state.turn) {
        throw new IllegalAction('A Figure cannot ascend on the turn it entered play')
      }
      if (player.ascendedThisTurn.includes(figure.uid)) {
        throw new IllegalAction('That slot has already ascended this turn')
      }

      player.hand.splice(action.hand, 1)
      const fromCardId = figure.cardId
      figure.beneath.push(figure.cardId)
      figure.cardId = cardId
      // Ascension is a fresh start: damage and energy carry, conditions do not.
      figure.statuses = []
      player.ascendedThisTurn.push(figure.uid)
      log(state, me, `${card.name} ascends.`, {
        kind: 'ascend',
        cardId,
        uid: figure.uid,
        otherCardId: fromCardId,
      })
      return state
    }

    case 'PLAY_COVENANT': {
      const cardId = player.hand[action.hand]
      if (cardId === undefined) throw new IllegalAction('No such card in hand')

      const card = requireCard(cardId)
      if (card.kind !== 'covenant') throw new IllegalAction(`${card.name} is not a Covenant`)
      if (player.covenantsLocked) throw new IllegalAction('Covenants are locked this turn')
      if (player.covenantsThisTurn >= RULES.COVENANTS_PER_TURN && !player.extraCovenant) {
        throw new IllegalAction('Only one Covenant may be played each turn')
      }

      player.hand.splice(action.hand, 1)
      if (player.covenantsThisTurn >= RULES.COVENANTS_PER_TURN) player.extraCovenant = false
      player.covenantsThisTurn += 1
      player.discard.push(cardId)

      log(state, me, `${card.name}.`, { kind: 'covenant', cardId })
      applyEffect(state, me, card.effect, action.targetUid)
      return state
    }

    case 'PLAY_RELIC': {
      const cardId = player.hand[action.hand]
      if (cardId === undefined) throw new IllegalAction('No such card in hand')

      const card = requireCard(cardId)
      if (card.kind !== 'relic') throw new IllegalAction(`${card.name} is not a Relic`)

      player.hand.splice(action.hand, 1)
      log(state, me, `${card.name}.`, { kind: 'relic', cardId })

      // Attaching Relics stay with the Figure; the rest resolve and discard.
      const attaches = card.effect.startsWith('attach-')
      if (attaches) {
        const target =
          figuresInPlay(player).find((f) => f.uid === action.targetUid) ?? player.active
        if (!target) throw new IllegalAction('No Figure to attach to')
        target.attachments.push(cardId)
        applyEffect(state, me, card.effect, target.uid)
      } else {
        player.discard.push(cardId)
        applyEffect(state, me, card.effect, action.targetUid)
      }
      return state
    }

    case 'MIRACLE': {
      const figure = figuresInPlay(player).find((f) => f.uid === action.uid)
      if (!figure) throw new IllegalAction('That Figure is not in play')

      // The board is the whole requirement. A miracle belongs to a Figure
      // standing on the mat — Active or Bench, it makes no difference — and
      // `figuresInPlay` is exactly that set, so a card still in hand, in the
      // deck or in the discard pile can never reach here.
      const miracle = miracleFor(figure.cardId)
      if (!miracle) throw new IllegalAction('That Figure has no miracle')

      if (player.miraclesThisTurn.includes(figure.uid)) {
        throw new IllegalAction('That Figure has already called its miracle this turn')
      }

      player.miraclesThisTurn.push(figure.uid)
      log(state, me, `${requireCard(figure.cardId).name}: ${miracle.name}.`, {
        kind: 'miracle',
        cardId: figure.cardId,
        uid: figure.uid,
        label: miracle.name,
      })
      // `attacker` is the effects file's name for "the Figure this is
      // happening from", not a claim that anything is being attacked — it is
      // what lets a self-targeting miracle (a shield, an extra energy) land
      // on the Figure that called it rather than on whoever is Active.
      applyEffect(state, me, miracle.effect, figure.uid, { attacker: figure })
      return state
    }

    case 'RETREAT': {
      if (player.retreatsThisTurn >= RULES.RETREATS_PER_TURN) {
        throw new IllegalAction('Already retreated this turn')
      }

      const active = player.active
      if (!active) throw new IllegalAction('No Active Figure to retreat')
      if (hasStatus(active, 'bound')) throw new IllegalAction('This Figure is Bound')
      if (hasStatus(active, 'slumber')) throw new IllegalAction('This Figure is asleep')

      const incoming = player.bench[action.benchIndex]
      if (!incoming) throw new IllegalAction('That Bench slot is empty')

      const cost = retreatCost(active)
      if (active.energy.length < cost) throw new IllegalAction('Not enough energy to retreat')

      active.energy.splice(0, cost)
      removeStatus(active, 'afflicted')
      removeStatus(active, 'slumber')

      player.bench[action.benchIndex] = active
      player.active = incoming
      player.retreatsThisTurn += 1
      log(state, me, `${name(active.cardId)} retreats; ${name(incoming.cardId)} steps up.`, {
        kind: 'retreat',
        cardId: incoming.cardId,
        uid: incoming.uid,
        otherCardId: active.cardId,
      })
      return state
    }

    case 'ATTACK': {
      const attacker = player.active
      if (!attacker) throw new IllegalAction('No Active Figure to attack with')
      if (player.attackedThisTurn) throw new IllegalAction('Already attacked this turn')
      if (isFirstPlayersOpeningTurn(state)) {
        throw new IllegalAction('The player going first cannot attack on turn 1')
      }
      if (hasStatus(attacker, 'slumber')) throw new IllegalAction('This Figure is asleep')

      const card = figureCard(attacker)
      const attack = card.attacks[action.attackIndex]
      if (!attack) throw new IllegalAction('No such attack')
      if (!canPayCost(attacker, attack.cost)) throw new IllegalAction('Not enough energy')

      player.attackedThisTurn = true
      log(state, me, `${card.name} uses ${attack.name}.`)

      if (hasStatus(attacker, 'blinded')) {
        const hit = withRng(state, (rng) => rng.chance(0.5))
        if (!hit) {
          log(state, me, 'Blinded — the attack misses.', {
            kind: 'attack',
            cardId: attacker.cardId,
            uid: attacker.uid,
            missed: true,
          })
          state.lastAttack = {
            id: state.log.length,
            by: me,
            attackerCardId: attacker.cardId,
            type: card.type,
            damage: 0,
            weakness: false,
            knockedOut: false,
            missed: true,
          }
          endTurn(state)
          return state
        }
      }

      const defender = foe.active
      let dealt = 0
      let weakness = false

      if (defender && attack.damage > 0) {
        dealt = attack.damage + attacker.attackBonus
        if (hasStatus(attacker, 'blessed')) dealt += RULES.BLESSED_BONUS

        const defenderCard = figureCard(defender)
        if (WEAKNESS[defenderCard.type] === card.type && !hasStatus(defender, 'unweak')) {
          dealt += RULES.WEAKNESS_BONUS
          weakness = true
          log(state, me, 'It strikes a weakness.')
        }
      }

      // The effect runs before damage so that modifiers which scale the hit —
      // bench count, damage already taken — see the state the attack was
      // declared in, and so a self-knockout effect cannot be pre-empted.
      const context = applyEffect(state, me, attack.effect, undefined, {
        attacker,
        baseDamage: dealt,
      })
      if (isEnded(state)) return state

      const finalDamage = context?.damageOverride ?? dealt
      // Captured before the hit lands so the event can report what actually
      // got through — a shield, Guarded or armor can all shrink this well
      // below `finalDamage`, and a shield stops it outright.
      const damageBefore = defender?.damage ?? 0
      // Where the outcome row belongs in the log — before whatever
      // `damageFigure` is about to append (a shield fizzling, an Enduring
      // save, a knockout) so the timeline reads "hits for N" *then* "is
      // knocked out", the order the exchange actually happened in, rather
      // than the knockout's own entry landing first just because
      // `damageFigure` resolves and logs it before this line runs.
      const outcomeAt = state.log.length

      if (defender && finalDamage > 0 && foe.active) {
        damageFigure(state, OPPONENT[me], foe.active, finalDamage, {
          pierce: attack.effect === 'pierce',
        })
      }

      const dealtDamage = defender ? defender.damage - damageBefore : 0
      const wasKnockedOut = defender ? isKnockedOut(defender) : false

      state.lastAttack = {
        id: state.log.length,
        by: me,
        attackerCardId: attacker.cardId,
        targetCardId: defender?.cardId,
        type: card.type,
        damage: dealtDamage,
        weakness,
        // `defender` is the reference captured before the hit, so its own
        // `.damage` still reads correctly even once knocked out and moved to
        // discard — `isKnockedOut` already accounts for Enduring saving it.
        knockedOut: wasKnockedOut,
        missed: false,
      }
      // One structured row per attack, carrying the full outcome — the
      // breakdown screen's play-by-play and its per-Figure damage stats both
      // read this rather than `lastAttack`, which only ever holds the most
      // recent one. The text mirrors what `lastAttack` already means, not the
      // earlier "uses X" line above: this is what happened, not what was
      // declared. Spliced in at `outcomeAt` rather than pushed, for the
      // ordering reasoning above.
      state.log.splice(outcomeAt, 0, {
        turn: state.turn,
        player: me,
        text: defender
          ? `${card.name} hits ${name(defender.cardId)} for ${dealtDamage}.`
          : `${card.name} finds nothing to strike.`,
        event: {
          kind: 'attack',
          cardId: attacker.cardId,
          uid: attacker.uid,
          otherCardId: defender?.cardId,
          energyType: card.type,
          damage: dealtDamage,
          weakness,
          knockedOut: wasKnockedOut,
          missed: false,
        },
      })

      if (isEnded(state)) return state
      if (isPromoting(state)) return state

      endTurn(state)
      return state
    }

    case 'END_TURN': {
      endTurn(state)
      return state
    }

    default:
      throw new IllegalAction(`Unhandled action: ${(action as Action).type}`)
  }
}

/* ------------------------------------------------------------------ effects */

function applyEffect(
  state: MatchState,
  me: PlayerId,
  effect: string | undefined,
  targetUid?: string,
  extra?: { attacker?: FigureInPlay; baseDamage?: number },
) {
  if (!effect) return null

  const context: EffectContext = {
    state,
    me,
    targetUid,
    attacker: extra?.attacker,
    baseDamage: extra?.baseDamage ?? 0,
    damageOverride: null,
    rng: (fn) => withRng(state, fn),
    draw: (count) => draw(state, me, count),
    damage: (owner, figure, amount, opts) => damageFigure(state, owner, figure, amount, opts),
    knockOut: (owner, figure, denyPoints) => knockOut(state, owner, figure, denyPoints),
    // `forPlayer` exists for the one effect (Laban's) that draws into the
    // *opponent's* hand rather than its own owner's — everywhere else it's
    // omitted and the entry is attributed to `me`, same as before.
    log: (text, event, forPlayer) => log(state, forPlayer ?? me, text, event),
    applyStatus,
  }

  runEffect(effect, context)
  return context
}

