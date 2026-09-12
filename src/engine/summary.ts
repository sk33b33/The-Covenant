import type { EnergyType } from '@/game/types'
import { OPPONENT, type LogEntry, type MatchState, type PlayerId } from './types'

/**
 * Everything the post-match screens read off a finished match — the reveal's
 * dominant card and the breakdown screen's timeline, stats and card strips —
 * computed once here from `state.log`'s structured events rather than each
 * screen re-walking the log its own way.
 */

interface FigureTally {
  cardId: string
  player: PlayerId
  damageDealt: number
  knockouts: number
}

/**
 * The Figure to feature in the win/loss reveal: most damage dealt across the
 * match, ties broken by knockouts caused, then by belonging to the winner —
 * the deciding vote goes to whoever the match actually turned on, not merely
 * whoever happened to still be standing at the end.
 *
 * Grouped by uid rather than cardId, since one Figure can attack under more
 * than one cardId across a match — an ascension mid-fight would otherwise
 * split its own damage between "Abram" and "Abraham" as if they were two
 * separate contenders. The reported `cardId` is whichever one that uid was
 * wearing on its *last* counted attack, so a Figure that ascended mid-match
 * is shown at its most-evolved rather than as it stood on its first swing.
 */
export function pickMvp(state: MatchState): { cardId: string; player: PlayerId } | null {
  const tallies = new Map<string, FigureTally>()

  for (const entry of state.log) {
    const event = entry.event
    if (!event || event.kind !== 'attack' || event.missed || !event.uid) continue

    const existing = tallies.get(event.uid)
    if (existing) {
      existing.cardId = event.cardId
      existing.damageDealt += event.damage ?? 0
      if (event.knockedOut) existing.knockouts += 1
    } else {
      tallies.set(event.uid, {
        cardId: event.cardId,
        player: entry.player,
        damageDealt: event.damage ?? 0,
        knockouts: event.knockedOut ? 1 : 0,
      })
    }
  }

  if (tallies.size === 0) return fallbackMvp(state)

  const winner = state.winner
  const ranked = [...tallies.values()].sort((a, b) => {
    if (b.damageDealt !== a.damageDealt) return b.damageDealt - a.damageDealt
    if (b.knockouts !== a.knockouts) return b.knockouts - a.knockouts
    return (b.player === winner ? 1 : 0) - (a.player === winner ? 1 : 0)
  })

  const best = ranked[0]!
  return { cardId: best.cardId, player: best.player }
}

/**
 * No attack landed at all — a concede, a deck-out on an early turn, a match
 * that never got moving. The reveal still needs something to show, so this
 * falls back to the winner's own final Active Figure, then anything else of
 * theirs still findable on the board or in their hand or deck. `null` only
 * for the case that should be impossible outside a test rigging bare state:
 * a winner with no cards anywhere.
 */
function fallbackMvp(state: MatchState): { cardId: string; player: PlayerId } | null {
  const player = state.winner ?? 'you'
  const side = state.players[player]
  const figure = side.active ?? side.bench.find((f) => f !== null)
  if (figure) return { cardId: figure.cardId, player }

  const anyCard = side.hand[0] ?? side.deck[0] ?? side.discard[0]
  return anyCard ? { cardId: anyCard, player } : null
}

export interface PlayerStats {
  damageDealt: number
  damageTaken: number
  knockouts: number
  cardsPlayed: number
  energyAttached: Partial<Record<EnergyType, number>>
}

export interface MatchBreakdown {
  stats: Record<PlayerId, PlayerStats>
  /** Every distinct card id each side put into play, first-seen order. */
  cardsUsed: Record<PlayerId, string[]>
  /** `state.log`, filtered to the entries a screen would actually chart —
   *  turn order preserved, since the log is already append-only in turn
   *  order (attacks are spliced earlier than their own knockout, never
   *  earlier than an unrelated prior turn). */
  timeline: LogEntry[]
}

const emptyStats = (): PlayerStats => ({
  damageDealt: 0,
  damageTaken: 0,
  knockouts: 0,
  cardsPlayed: 0,
  energyAttached: {},
})

/** Card-bearing event kinds that count as "played" for the stat line and
 *  belong in the "cards used" strip. `attack`, `attach` and `knockout` touch
 *  a card without the owner having *played* it this match — an ascension's
 *  own "from" card is the one exception, added separately below, since a
 *  Figure that ascended did have both cards played onto the board in turn. */
const PLAYED: ReadonlySet<string> = new Set(['play', 'ascend', 'covenant', 'relic'])

export function buildBreakdown(state: MatchState): MatchBreakdown {
  const stats: Record<PlayerId, PlayerStats> = { you: emptyStats(), foe: emptyStats() }
  const cardsUsed: Record<PlayerId, string[]> = { you: [], foe: [] }
  const seen: Record<PlayerId, Set<string>> = { you: new Set(), foe: new Set() }
  const timeline: LogEntry[] = []

  const use = (player: PlayerId, cardId: string) => {
    if (seen[player].has(cardId)) return
    seen[player].add(cardId)
    cardsUsed[player].push(cardId)
  }

  for (const entry of state.log) {
    const event = entry.event
    // `draw` carries no "what did this player choose to do" signal — it
    // happens every turn regardless of either side's play — so it stays out
    // of the play-by-play and everything counted from it (cards played,
    // cards used) the same way it stays out of MVP scoring above. `coinFlip`
    // is a rider on the attack that triggered it, not a choice of its own —
    // the attack's own row already tells that story.
    if (!event || event.kind === 'draw' || event.kind === 'coinFlip') continue
    timeline.push(entry)

    const mine = stats[entry.player]
    // Every kind but `knockout` names its `player` as the card's own owner —
    // a knockout instead credits the *opponent*, the side that earned the
    // points (see `knockOut` in reducer.ts), so charting it here would file
    // the knocked-out Figure under the wrong side's "cards used". It needs
    // no entry of its own regardless: whatever stood in that slot already
    // has a `play`/`ascend` entry under its real owner.
    if (event.kind !== 'knockout') {
      use(entry.player, event.cardId)
      if (event.otherCardId && event.kind === 'ascend') use(entry.player, event.otherCardId)
    }

    if (PLAYED.has(event.kind)) mine.cardsPlayed += 1

    if (event.kind === 'attach' && event.energyType) {
      mine.energyAttached[event.energyType] = (mine.energyAttached[event.energyType] ?? 0) + 1
    }

    if (event.kind === 'attack' && !event.missed) {
      mine.damageDealt += event.damage ?? 0
      stats[OPPONENT[entry.player]].damageTaken += event.damage ?? 0
    }

    if (event.kind === 'knockout') mine.knockouts += 1
  }

  return { stats, cardsUsed, timeline }
}
