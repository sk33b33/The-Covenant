import type { SetDefinition } from '@/game/types'

/**
 * Sets and packs.
 *
 * Genesis ships with three packs that share one card pool but hold different
 * exclusives — the same structure the reference game uses, where one set is
 * sold as several themed wrappers. It means a player chooses which chase cards
 * to hunt without the set having to be three times the size. It also means
 * completing the binder is never a single-pack grind: every exclusive card
 * below is reachable from exactly one of the three, so all of them have to be
 * opened at some point to own everything the set holds.
 *
 * The set's first 74 cards founded each pack on one narrow story — Eden and
 * the fall, the flood, the patriarchs' covenant — and each pack's five
 * original exclusives are drawn from that one story alone. The sixteen cards
 * added after launch range far wider across scripture, too wide to keep that
 * narrowness without a fourth pack nobody asked for. Rather than leave them
 * all in the shared pool, where a single pack could eventually yield the
 * whole set, each pack claims a share along the nearest thread already
 * running through it: Creation keeps the light-and-heaven's-host figures
 * closest to its own Eden cast; the Flood extends its water-judgment story to
 * the fire-judgment figures Scripture itself pairs with it (2 Peter 3:5-7);
 * the Promise takes on the covenant line's rivals and its betrayal, set
 * against the patriarchs it already holds.
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
      exclusives: [
        'adam',
        'eve',
        'the-serpent',
        'archangel-michael',
        'let-there-be-light',
        // Light and heaven's host, added post-launch.
        'job',
        'hannah',
        'gabriel',
        'the-four-living-creatures',
        'balaams-donkey',
      ],
    },
    {
      id: 'the-flood',
      set: 'genesis',
      name: 'The Flood',
      tagline: 'Forty days of rain, and one ark riding it out.',
      theme: 'water',
      exclusives: [
        'noah',
        'the-deluge',
        'the-ark',
        'the-raven',
        'the-dove',
        // Water and fire, both judgment and both deliverance, added
        // post-launch.
        'miriam',
        'the-red-sea',
        'elijah',
        'nadab-and-abihu',
        'the-refiners-fire',
        'phinehas',
      ],
    },
    {
      id: 'the-promise',
      set: 'genesis',
      name: 'The Promise',
      tagline: 'A covenant cut with one family, kept for all of them.',
      theme: 'earth',
      exclusives: [
        'abraham',
        'isaac',
        'jacob',
        'sarah',
        'the-ram-in-the-thicket',
        // The covenant line's own women, its rival lineage, and the
        // betrayal of its fulfilment, added post-launch.
        'rebekah',
        'rachel',
        'goliath',
        'lamech',
        'judas-iscariot',
      ],
    },
  ],
}

export const SETS: SetDefinition[] = [GENESIS]

export const ALL_PACKS = SETS.flatMap((s) => s.packs)

export const getPack = (id: string) => ALL_PACKS.find((p) => p.id === id)

export const getSet = (id: string) => SETS.find((s) => s.id === id)
