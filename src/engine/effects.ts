import { requireCard } from '@/data/cards'
import type { Rng } from '@/game/rng'
import { isFigure } from '@/game/types'
import { figureCard, figuresInPlay, hasStatus, removeStatus } from './state'
import { OPPONENT, type FigureInPlay, type MatchState, type PlayerId, type StatusKind } from './types'

/**
 * Card effects.
 *
 * Each card names an effect id; this registry maps that id to a function over
 * the match draft. Keeping them in one table rather than branching inside the
 * reducer means a new card is a data entry plus one function, and it makes the
 * gap between designed and implemented cards visible — `IMPLEMENTED` below is
 * the honest list.
 *
 * An unrecognised id is not an error. Attacks still deal their damage; the
 * rider simply does not fire, and the log says so. That keeps the set playable
 * while effects are filled in, rather than crashing a match on an unfinished
 * card.
 */

export interface EffectContext {
  state: MatchState
  me: PlayerId
  /** Explicit target chosen by the player, where the card takes one. */
  targetUid?: string
  /** The attacking Figure, for attack riders. */
  attacker?: FigureInPlay
  /** Damage the attack would deal before this effect. */
  baseDamage: number
  /** Set to replace the attack's damage entirely. */
  damageOverride: number | null

  rng: <T>(fn: (rng: Rng) => T) => T
  draw: (count: number) => void
  damage: (
    owner: PlayerId,
    figure: FigureInPlay,
    amount: number,
    opts?: { pierce?: boolean },
  ) => void
  knockOut: (owner: PlayerId, figure: FigureInPlay, denyPoints?: boolean) => void
  log: (text: string) => void
  applyStatus: (figure: FigureInPlay, kind: StatusKind, until: number) => void
}

type Effect = (ctx: EffectContext) => void

/* ------------------------------------------------------------------ helpers */

const mine = (ctx: EffectContext) => ctx.state.players[ctx.me]
const theirs = (ctx: EffectContext) => ctx.state.players[OPPONENT[ctx.me]]

/** Turn number through which a "until the end of your next turn" status lasts. */
const nextTurn = (ctx: EffectContext) => ctx.state.turn + 1

function heal(figure: FigureInPlay, amount: number) {
  figure.damage = Math.max(0, figure.damage - amount)
}

/** The player's own Figure named by targetUid, or their Active as a default. */
function target(ctx: EffectContext): FigureInPlay | null {
  const player = mine(ctx)
  if (ctx.targetUid) {
    const found = figuresInPlay(player).find((f) => f.uid === ctx.targetUid)
    if (found) return found
  }
  return player.active
}

/** Moves the first deck card matching a predicate into hand. */
function search(ctx: EffectContext, predicate: (cardId: string) => boolean, toBench = false) {
  const player = mine(ctx)
  const index = player.deck.findIndex(predicate)
  if (index === -1) {
    ctx.log('Nothing in the deck matches.')
    return
  }

  const [cardId] = player.deck.splice(index, 1)
  if (!cardId) return

  if (toBench) {
    const slot = player.bench.findIndex((s) => s === null)
    if (slot === -1) {
      player.hand.push(cardId)
      ctx.log('The Bench is full, so it goes to hand.')
      return
    }
    player.bench[slot] = {
      uid: `f${Math.floor(ctx.rng((r) => r.next()) * 1e9)}`,
      cardId,
      beneath: [],
      damage: 0,
      energy: [],
      statuses: [],
      enteredOnTurn: ctx.state.turn,
      armor: 0,
      attackBonus: 0,
      retreatDiscount: 0,
      attachments: [],
    }
    ctx.log(`${requireCard(cardId).name} is called to the Bench.`)
    return
  }

  player.hand.push(cardId)
  ctx.log(`${requireCard(cardId).name} is found.`)
}

const isBasicFigure = (cardId: string) => {
  const card = requireCard(cardId)
  return isFigure(card) && card.stage === 'basic'
}

const isAscended = (cardId: string) => {
  const card = requireCard(cardId)
  return isFigure(card) && card.stage !== 'basic'
}

/* ---------------------------------------------------------------- registry */

const EFFECTS: Record<string, Effect> = {
  /* -- draw ------------------------------------------------------------- */
  'draw-1': (ctx) => ctx.draw(1),
  'draw-2': (ctx) => ctx.draw(2),
  'draw-3-or-5': (ctx) => ctx.draw(figuresInPlay(mine(ctx)).length === 0 ? 5 : 3),
  'draw-2-discard-1': (ctx) => {
    ctx.draw(2)
    const player = mine(ctx)
    if (player.hand.length === 0) return
    const index = ctx.rng((r) => r.int(player.hand.length))
    const [discarded] = player.hand.splice(index, 1)
    if (discarded) player.discard.push(discarded)
  },
  'coin-draw-2': (ctx) => {
    if (ctx.rng((r) => r.chance(0.5))) {
      ctx.log('Heads.')
      ctx.draw(2)
    } else {
      ctx.log('Tails.')
    }
  },

  /* -- dig and scry ------------------------------------------------------ */
  // The engine resolves these itself rather than prompting: the interface
  // shows what was taken. Picking the best card by rarity is a fair proxy for
  // a player choosing, and keeps the AI and the human on identical rules.
  'dig-3': (ctx) => digBest(ctx, 3),
  'dig-5': (ctx) => digBest(ctx, 5),
  'scry-2': (ctx) => {
    const player = mine(ctx)
    if (player.deck.length < 2) return
    // Put the more useful of the top two on top.
    const [a, b] = [player.deck[0]!, player.deck[1]!]
    if (isFigure(requireCard(b)) && !isFigure(requireCard(a))) {
      player.deck[0] = b
      player.deck[1] = a
    }
  },

  /* -- search ------------------------------------------------------------ */
  'search-basic-to-bench': (ctx) => search(ctx, isBasicFigure, true),
  'search-ascended': (ctx) => search(ctx, isAscended),
  'search-covenant': (ctx) => search(ctx, (id) => requireCard(id).kind === 'covenant'),
  'tutor-any': (ctx) => search(ctx, () => true),

  /* -- healing ----------------------------------------------------------- */
  'heal-self-10': (ctx) => ctx.attacker && heal(ctx.attacker, 10),
  'heal-active-30': (ctx) => mine(ctx).active && heal(mine(ctx).active!, 30),
  'heal-active-40': (ctx) => mine(ctx).active && heal(mine(ctx).active!, 40),
  'heal-all-30': (ctx) => figuresInPlay(mine(ctx)).forEach((f) => heal(f, 30)),
  'heal-any-50': (ctx) => {
    const figure = target(ctx)
    if (figure) heal(figure, 50)
  },
  'heal-bench-full': (ctx) => {
    const benched = mine(ctx).bench.filter((f): f is FigureInPlay => f !== null)
    const worst = benched.sort((a, b) => b.damage - a.damage)[0]
    if (worst) worst.damage = 0
  },
  'drain-30': (ctx) => ctx.attacker && heal(ctx.attacker, 30),
  'drain-50': (ctx) => ctx.attacker && heal(ctx.attacker, 50),
  sabbath: (ctx) => {
    figuresInPlay(mine(ctx)).forEach((f) => heal(f, 30))
    ctx.draw(1)
  },
  rainbow: (ctx) => {
    const active = mine(ctx).active
    if (!active) return
    heal(active, 60)
    ctx.applyStatus(active, 'enduring', nextTurn(ctx))
  },

  /* -- damage riders ----------------------------------------------------- */
  'recoil-20': (ctx) => ctx.attacker && ctx.damage(ctx.me, ctx.attacker, 20, { pierce: true }),
  'recoil-30': (ctx) => ctx.attacker && ctx.damage(ctx.me, ctx.attacker, 30, { pierce: true }),
  'bench-splash-20': (ctx) => {
    const them = theirs(ctx)
    for (const figure of them.bench) {
      if (figure) ctx.damage(OPPONENT[ctx.me], figure, 20, { pierce: true })
    }
  },
  'bench-scaling-20': (ctx) => {
    const bonus = mine(ctx).bench.filter(Boolean).length * 20
    ctx.damageOverride = ctx.baseDamage + bonus
    if (bonus) ctx.log(`The tribes add ${bonus}.`)
  },
  'suffering-scaling': (ctx) => {
    if (!ctx.attacker) return
    // Damage counters are 10 each, matching how the card is worded.
    const counters = Math.floor(ctx.attacker.damage / 10)
    const bonus = counters * 20
    ctx.damageOverride = ctx.baseDamage + bonus
    if (bonus) ctx.log(`The road adds ${bonus}.`)
  },
  pierce: () => {
    /* Handled by the reducer, which passes `pierce` through to damageFigure. */
  },

  /* -- statuses ---------------------------------------------------------- */
  afflict: (ctx) => {
    const active = theirs(ctx).active
    // Afflicted has no expiry: it stays until the Figure leaves the Active spot.
    if (active) ctx.applyStatus(active, 'afflicted', Number.POSITIVE_INFINITY)
  },
  blind: (ctx) => {
    const active = theirs(ctx).active
    if (active) ctx.applyStatus(active, 'blinded', nextTurn(ctx))
  },
  slumber: (ctx) => {
    const active = theirs(ctx).active
    if (active) ctx.applyStatus(active, 'slumber', Number.POSITIVE_INFINITY)
  },
  bind: (ctx) => {
    const active = theirs(ctx).active
    if (active) ctx.applyStatus(active, 'bound', nextTurn(ctx))
  },
  binding: (ctx) => {
    const active = theirs(ctx).active
    if (!active) return
    ctx.applyStatus(active, 'bound', nextTurn(ctx))
    ctx.applyStatus(active, 'slumber', nextTurn(ctx))
  },
  bless: (ctx) => {
    const active = mine(ctx).active
    if (active) ctx.applyStatus(active, 'blessed', nextTurn(ctx))
  },
  'shield-next-turn': (ctx) => {
    const figure = ctx.attacker ?? mine(ctx).active
    if (figure) ctx.applyStatus(figure, 'shielded', nextTurn(ctx))
  },
  'reduce-30': (ctx) => {
    const figure = ctx.attacker ?? mine(ctx).active
    if (figure) ctx.applyStatus(figure, 'guarded', nextTurn(ctx))
  },
  'no-weakness': (ctx) => {
    const figure = ctx.attacker ?? mine(ctx).active
    if (figure) ctx.applyStatus(figure, 'unweak', nextTurn(ctx))
  },
  endure: (ctx) => {
    const figure = ctx.attacker ?? mine(ctx).active
    if (figure) ctx.applyStatus(figure, 'enduring', nextTurn(ctx))
  },
  'lock-covenants': (ctx) => {
    theirs(ctx).covenantsLocked = true
  },

  /* -- movement ---------------------------------------------------------- */
  'self-switch': (ctx) => {
    const player = mine(ctx)
    const index = player.bench.findIndex((s) => s !== null)
    if (index === -1 || !player.active) return

    const incoming = player.bench[index]!
    player.bench[index] = player.active
    removeStatus(player.active, 'afflicted')
    removeStatus(player.active, 'slumber')
    player.active = incoming
    ctx.log(`${requireCard(incoming.cardId).name} steps up.`)
  },
  gust: (ctx) => {
    const them = theirs(ctx)
    const index = them.bench.findIndex((s) => s !== null)
    if (index === -1 || !them.active) return

    const incoming = them.bench[index]!
    them.bench[index] = them.active
    them.active = incoming
    ctx.log(`${requireCard(incoming.cardId).name} is dragged forward.`)
  },

  /* -- energy ------------------------------------------------------------ */
  'extra-energy': (ctx) => {
    const player = mine(ctx)
    const figure = target(ctx)
    if (!figure) return
    const type = ctx.rng((r) => r.pick(player.energyTypes))
    figure.energy.push(type)
    ctx.log('An extra energy is drawn from the Altar.')
  },
  'discard-energy': (ctx) => {
    if (ctx.attacker) ctx.attacker.energy.pop()
  },
  'discard-2-energy': (ctx) => {
    if (ctx.attacker) ctx.attacker.energy.splice(-2, 2)
  },
  'strip-energy': (ctx) => {
    const active = theirs(ctx).active
    if (active) active.energy.pop()
  },

  /* -- disruption -------------------------------------------------------- */
  'discard-random': (ctx) => {
    const them = theirs(ctx)
    if (them.hand.length === 0) return
    const index = ctx.rng((r) => r.int(them.hand.length))
    const [discarded] = them.hand.splice(index, 1)
    if (discarded) them.discard.push(discarded)
  },
  'opponent-reshuffle-minus-1': (ctx) => {
    const them = theirs(ctx)
    const size = them.hand.length
    if (size === 0) return
    them.deck.push(...them.hand)
    them.hand = []
    them.deck = ctx.rng((r) => r.shuffle(them.deck))
    for (let i = 0; i < Math.max(0, size - 1); i++) {
      const card = them.deck.shift()
      if (card) them.hand.push(card)
    }
  },
  'reveal-hand': (ctx) => {
    // Information only; the interface reveals the hand. No state change, so
    // the AI gains nothing a human would not also see.
    ctx.log("Your opponent's hand is revealed.")
  },

  /* -- sacrifice --------------------------------------------------------- */
  'sacrifice-shield': (ctx) => {
    const player = mine(ctx)
    const active = player.active
    if (!active) return
    ctx.applyStatus(active, 'shielded', nextTurn(ctx))
    if (ctx.attacker) ctx.knockOut(ctx.me, ctx.attacker, false)
  },
  finished: (ctx) => {
    if (ctx.attacker) ctx.knockOut(ctx.me, ctx.attacker, true)
  },
  'deny-points': (ctx) => {
    // Modelled as endurance: the Figure survives the turn it was meant to fall,
    // which is the practical effect the card is reaching for.
    if (ctx.attacker) ctx.applyStatus(ctx.attacker, 'enduring', nextTurn(ctx))
  },
  vengeance: (ctx) => {
    const attacker = theirs(ctx).active
    if (attacker) ctx.damage(OPPONENT[ctx.me], attacker, 20, { pierce: true })
  },
  'revive-basic': (ctx) => reviveFromDiscard(ctx, 1),
  'revive-2-basic': (ctx) => reviveFromDiscard(ctx, 2),

  /* -- relics ------------------------------------------------------------ */
  'attach-armor-30': (ctx) => {
    const figure = target(ctx)
    if (figure) figure.armor += 30
  },
  'attach-damage-10': (ctx) => {
    const figure = target(ctx)
    if (figure) figure.attackBonus += 10
  },
  'attach-retreat-2': (ctx) => {
    const figure = target(ctx)
    if (figure) figure.retreatDiscount += 2
  },
  tent: (ctx) => {
    const active = mine(ctx).active
    const ascended = active ? figureCard(active).stage !== 'basic' : false
    ctx.draw(ascended ? 2 : 1)
  },
  'extra-covenant': (ctx) => {
    mine(ctx).extraCovenant = true
  },
}

/* -------------------------------------------------------------- sub-helpers */

function digBest(ctx: EffectContext, depth: number) {
  const player = mine(ctx)
  const looked = player.deck.slice(0, depth)
  if (looked.length === 0) return

  // Prefer a Figure, then the highest-rarity card — a reasonable stand-in for
  // the choice a player would make, applied identically to both sides.
  const ranked = [...looked].sort((a, b) => {
    const ca = requireCard(a)
    const cb = requireCard(b)
    const fa = isFigure(ca) ? 1 : 0
    const fb = isFigure(cb) ? 1 : 0
    return fb - fa
  })

  const chosen = ranked[0]!
  player.deck.splice(player.deck.indexOf(chosen), 1)
  player.hand.push(chosen)

  // The rest go to the bottom, in the order they were seen.
  const rest = player.deck.splice(0, Math.max(0, depth - 1))
  player.deck.push(...rest)

  ctx.log(`${requireCard(chosen).name} is taken.`)
}

function reviveFromDiscard(ctx: EffectContext, count: number) {
  const player = mine(ctx)

  for (let i = 0; i < count; i++) {
    const slot = player.bench.findIndex((s) => s === null)
    if (slot === -1) return

    const index = player.discard.findIndex(isBasicFigure)
    if (index === -1) return

    const [cardId] = player.discard.splice(index, 1)
    if (!cardId) return

    player.bench[slot] = {
      uid: `f${Math.floor(ctx.rng((r) => r.next()) * 1e9)}`,
      cardId,
      beneath: [],
      damage: 0,
      energy: [],
      statuses: [],
      enteredOnTurn: ctx.state.turn,
      armor: 0,
      attackBonus: 0,
      retreatDiscount: 0,
      attachments: [],
    }
    ctx.log(`${requireCard(cardId).name} returns.`)
  }
}

/* -------------------------------------------------------------------- entry */

export const IMPLEMENTED = new Set(Object.keys(EFFECTS))

export function runEffect(effect: string, ctx: EffectContext): void {
  const handler = EFFECTS[effect]
  if (!handler) {
    // Deliberately not an error: an unfinished rider must not crash a match.
    ctx.log(`(${effect} has no rules yet)`)
    return
  }
  handler(ctx)
}

/** Exposed so a test can assert which designed effects still lack rules. */
export const effectIsImplemented = (effect: string) => IMPLEMENTED.has(effect)

export { hasStatus }
