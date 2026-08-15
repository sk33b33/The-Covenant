import type { Deck } from '@/game/types'

/**
 * The starter grant.
 *
 * A player who opens the app owning nothing cannot battle, cannot build a deck,
 * and sees an empty binder — three dead ends before the game has said anything.
 * So first entry hands over one complete, legal, playable Light/Earth deck plus
 * a handful of cards around it to make deck-building feel like a choice rather
 * than a formality.
 *
 * These are all Common and Uncommon on purpose: the starter should be beatable
 * and worth upgrading, not a shortcut past the packs.
 */

export const STARTER_CARD_IDS: string[] = [
  // The deck itself, duplicates included.
  'abram',
  'abram',
  'abraham',
  'abraham',
  'isaac',
  'seth',
  'seth',
  'abel',
  'abel',
  'sarah',
  'esau',
  'esau',
  'lot',
  'terah',
  'the-well-of-beersheba',
  'the-well-of-beersheba',
  'jacobs-blessing',
  'the-sabbath',
  'the-staff',
  'the-censer',

  // Spares, so the deck builder has something to swap in.
  'the-still-small-voice',
  'the-raven',
  'the-outer-darkness',
  'the-altar-fire',
  'shem',
  'japheth',
  'the-tent-of-meeting',
  'the-scattering',
]

/** The pre-built deck, ready to battle with. */
export const STARTER_DECK: Omit<Deck, 'updatedAt'> = {
  id: 'starter',
  name: 'The Promise',
  coverCardId: 'abraham',
  energy: ['light', 'earth'],
  cards: [
    'abram',
    'abram',
    'abraham',
    'abraham',
    'isaac',
    'seth',
    'seth',
    'abel',
    'abel',
    'sarah',
    'esau',
    'esau',
    'lot',
    'terah',
    'the-well-of-beersheba',
    'the-well-of-beersheba',
    'jacobs-blessing',
    'the-sabbath',
    'the-staff',
    'the-censer',
  ],
}
