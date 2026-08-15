import type { SetDefinition } from '@/game/types'

/**
 * Sets and packs.
 *
 * Genesis ships with three packs that share one card pool but hold different
 * exclusives — the same structure the reference game uses, where one set is
 * sold as several themed wrappers. It means a player chooses which chase cards
 * to hunt without the set having to be three times the size.
 */

export const GENESIS: SetDefinition = {
  id: 'genesis',
  name: 'Genesis',
  code: 'GE1',
  packs: [
    {
      id: 'creation',
      set: 'genesis',
      name: 'Creation',
      tagline: 'The first light, the first breath, the first fall.',
      theme: 'light',
      exclusives: ['adam', 'eve', 'the-serpent', 'archangel-michael', 'let-there-be-light'],
    },
    {
      id: 'the-flood',
      set: 'genesis',
      name: 'The Flood',
      tagline: 'Forty days of rain, and one ark riding it out.',
      theme: 'water',
      exclusives: ['noah', 'the-deluge', 'the-ark', 'the-raven', 'the-dove'],
    },
    {
      id: 'the-promise',
      set: 'genesis',
      name: 'The Promise',
      tagline: 'A covenant cut with one family, kept for all of them.',
      theme: 'earth',
      exclusives: ['abraham', 'isaac', 'jacob', 'sarah', 'the-ram-in-the-thicket'],
    },
  ],
}

export const SETS: SetDefinition[] = [GENESIS]

export const ALL_PACKS = SETS.flatMap((s) => s.packs)

export const getPack = (id: string) => ALL_PACKS.find((p) => p.id === id)

export const getSet = (id: string) => SETS.find((s) => s.id === id)
