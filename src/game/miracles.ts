import { getCard } from '@/data/cards'
import { isFigure } from './types'

/**
 * Miracles — the one thing an Anointed Figure can do that is not an attack.
 *
 * Which Figures carry one is not a new idea invented here: the card pool
 * already marks its seven rarest Figures `anointed`, the tier the game itself
 * treats as set apart (they are worth two points when knocked out). Those are
 * the special characters, so those are the ones with a miracle.
 *
 * **Which miracle each one gets is not designed yet.** The pairing below is
 * arbitrary — a stable hash of the card's own id picks from the table — and is
 * meant to be replaced by an authored miracle per character. What it must be,
 * even while arbitrary, is *stable*: the description printed on the card face
 * has to be the same ability the menu later offers, on both sides of the
 * board, in the binder, and across reloads. Rolling a real die anywhere would
 * break that, so the roll is the card's own name instead.
 *
 * Every effect named here is one the engine already implements (see
 * `src/engine/effects.ts`), so a miracle does something real rather than
 * standing as a button that only looks like a move.
 */

export interface Miracle {
  name: string
  /** Printed under the badge, and shown beneath the ability in the menu. */
  text: string
  /** Key into the engine's own effect table. */
  effect: string
}

const MIRACLES: Miracle[] = [
  {
    name: 'Balm of Gilead',
    text: 'Restore 40 HP to your Active Figure.',
    effect: 'heal-active-40',
  },
  {
    name: 'Manna from Heaven',
    text: 'Draw two cards.',
    effect: 'draw-2',
  },
  {
    name: 'Pillar of Cloud',
    text: 'This Figure is shielded until your next turn.',
    effect: 'shield-next-turn',
  },
  {
    name: 'Widow’s Oil',
    text: 'Draw one more energy from the Altar onto this Figure.',
    effect: 'extra-energy',
  },
  {
    name: 'Valley of Dry Bones',
    text: 'Return a Basic Figure from your discard pile to an empty Bench slot.',
    effect: 'revive-basic',
  },
  {
    name: 'Call of the Twelve',
    text: 'Search your deck for a Basic Figure and put it on your Bench.',
    effect: 'search-basic-to-bench',
  },
  {
    name: 'Bread and Fishes',
    text: 'Restore 30 HP to every Figure you have in play.',
    effect: 'heal-all-30',
  },
]

/**
 * A small, stable hash of a string.
 *
 * The same shape the effects file already uses for scattering particles: a
 * sine of the accumulated char codes, taken for its fractional part. It only
 * has to spread seven ids across seven entries without clustering, not to be
 * cryptographic — and it has to give the same answer every time it is asked,
 * which is the whole point of using it here rather than an Rng.
 */
function hash(text: string): number {
  let sum = 0
  for (let i = 0; i < text.length; i++) sum += text.charCodeAt(i) * (i + 1)
  const v = Math.sin(sum) * 43758.5453
  return v - Math.floor(v)
}

/** The miracle a card carries, if it carries one at all. */
export function miracleFor(cardId: string): Miracle | null {
  const card = getCard(cardId)
  if (!card || !isFigure(card) || !card.anointed) return null
  return MIRACLES[Math.floor(hash(cardId) * MIRACLES.length)] ?? null
}

/** Exposed so a test can assert every miracle names an effect the engine
 *  actually implements, rather than one that would quietly do nothing. */
export const ALL_MIRACLES: readonly Miracle[] = MIRACLES
