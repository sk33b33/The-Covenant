import { readdirSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
// The direction map is production tooling that imports nothing at runtime, so
// it is safe to pull into a test without dragging the toolchain along with it.
import { ART_DIRECTION } from '../../../scripts/art-direction'
import { CARDS } from '../cards'

/**
 * Art coverage.
 *
 * The failure this guards against is quiet: add a card, forget to write art
 * direction for it, and the prompt sheet simply never mentions it. Nothing
 * breaks, nothing warns, and the card sits on a placeholder forever. The same
 * shape of bug as the story decks, which shipped two content errors before a
 * test caught them.
 */

const ART_DIR = resolve(__dirname, '../../../public/art/cards')

const illustrated = new Set(
  existsSync(ART_DIR)
    ? readdirSync(ART_DIR)
        .filter((file) => file.endsWith('.webp'))
        .map((file) => file.replace('.webp', ''))
    : [],
)

const awaitingArt = CARDS.filter((card) => !illustrated.has(card.id))

describe('art direction', () => {
  it('covers every card that has no artwork yet', () => {
    const undirected = awaitingArt.filter((card) => !ART_DIRECTION[card.id]).map((c) => c.id)
    expect(undirected, 'add entries to scripts/art-direction.ts').toEqual([])
  })

  it('carries no entries for cards that do not exist or already have art', () => {
    const ids = new Set(CARDS.map((c) => c.id))
    const orphans = Object.keys(ART_DIRECTION).filter(
      (id) => !ids.has(id) || illustrated.has(id),
    )
    expect(orphans, 'remove stale entries from scripts/art-direction.ts').toEqual([])
  })

  it('gives every entry a usable shape and a scene with real detail', () => {
    const shapes = new Set(['portrait', 'creature', 'scene', 'object'])

    for (const [id, direction] of Object.entries(ART_DIRECTION)) {
      expect(shapes.has(direction.shape), `${id} has shape "${direction.shape}"`).toBe(true)

      // A one-liner produces a generic image. The whole point of authoring
      // these by hand is that they name what is actually in the frame.
      expect(direction.scene.length, `${id} scene is too thin`).toBeGreaterThan(80)
      expect(direction.scene.trim().endsWith('.'), `${id} scene should end in a full stop`).toBe(
        true,
      )
    }
  })

  it('gives typeless cards their own lighting', () => {
    // Covenants and Relics have no energy type, so nothing else can supply it.
    const typeless = awaitingArt.filter((card) => !('type' in card))

    for (const card of typeless) {
      expect(ART_DIRECTION[card.id]?.light, `${card.id} needs its own light direction`).toBeTruthy()
    }
  })

  it('does not reuse the same scene for two cards', () => {
    const seen = new Map<string, string>()

    for (const [id, direction] of Object.entries(ART_DIRECTION)) {
      const key = direction.scene.slice(0, 60)
      const previous = seen.get(key)
      expect(previous, `${id} shares an opening with ${previous}`).toBeUndefined()
      seen.set(key, id)
    }
  })
})
