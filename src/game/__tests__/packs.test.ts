import { describe, expect, it } from 'vitest'
import { ALL_PACKS } from '@/data/sets'
import { CARDS } from '@/data/cards'
import { ECONOMY } from '../config'
import { isGodPack, openPack } from '../packs'
import { createRng } from '../rng'
import { RARITY_ORDER, type Rarity } from '../types'

const rareOrBetter = (r: Rarity) => RARITY_ORDER[r] >= RARITY_ORDER.rare

/** Opens n packs from a fixed seed, threading the pity counter as the app does. */
function simulate(packId: string, n: number, seed = 12345) {
  const rng = createRng(seed)
  const results = []
  let sincePity = 0

  for (let i = 0; i < n; i++) {
    const result = openPack(packId, rng, sincePity)
    sincePity = result.hitRareOrBetter ? 0 : sincePity + 1
    results.push(result)
  }

  return results
}

describe('openPack', () => {
  it('always returns exactly the configured pack size', () => {
    for (const result of simulate('creation', 500)) {
      expect(result.cards).toHaveLength(ECONOMY.CARDS_PER_PACK)
    }
  })

  it('fills the first three slots with Commons', () => {
    for (const result of simulate('the-promise', 300)) {
      expect(result.cards.slice(0, 3).map((c) => c.rarity)).toEqual([
        'common',
        'common',
        'common',
      ])
    }
  })

  it('never puts a Common in the last two slots', () => {
    for (const result of simulate('the-flood', 300)) {
      expect(result.cards[3]!.rarity).not.toBe('common')
      expect(result.cards[4]!.rarity).not.toBe('common')
    }
  })

  it('is deterministic for a given seed', () => {
    const a = simulate('creation', 20, 999).map((r) => r.cards.map((c) => c.id))
    const b = simulate('creation', 20, 999).map((r) => r.cards.map((c) => c.id))
    expect(a).toEqual(b)
  })

  it('produces different results for different seeds', () => {
    const a = simulate('creation', 10, 1).map((r) => r.cards.map((c) => c.id))
    const b = simulate('creation', 10, 2).map((r) => r.cards.map((c) => c.id))
    expect(a).not.toEqual(b)
  })

  it('only pulls cards this pack is allowed to contain', () => {
    for (const pack of ALL_PACKS) {
      const forbidden = new Set(
        ALL_PACKS.filter((p) => p.set === pack.set && p.id !== pack.id).flatMap(
          (p) => p.exclusives,
        ),
      )

      for (const result of simulate(pack.id, 200)) {
        for (const card of result.cards) {
          expect(forbidden.has(card.id), `${card.id} should not appear in ${pack.id}`).toBe(false)
          expect(card.set).toBe(pack.set)
        }
      }
    }
  })

  it('rejects an unknown pack id rather than returning an empty pack', () => {
    expect(() => openPack('no-such-pack', createRng(1), 0)).toThrow(/Unknown pack id/)
  })
})

describe('the pity rule', () => {
  it('never lets the drought exceed the configured interval', () => {
    let drought = 0
    let worst = 0

    for (const result of simulate('creation', 4000, 7)) {
      drought = result.hitRareOrBetter ? 0 : drought + 1
      worst = Math.max(worst, drought)
    }

    expect(worst).toBeLessThan(ECONOMY.PITY_INTERVAL)
  })

  it('guarantees a Rare or better on the pack where it fires', () => {
    for (const result of simulate('the-promise', 3000, 42)) {
      if (result.pityFired) {
        expect(result.cards.some((c) => rareOrBetter(c.rarity))).toBe(true)
      }
    }
  })

  it('does not fire when the pack already contained a hit', () => {
    for (const result of simulate('the-flood', 3000, 3)) {
      if (result.pityFired) {
        // The first four slots must have been dry, or pity was unnecessary.
        expect(result.cards.slice(0, 4).some((c) => rareOrBetter(c.rarity))).toBe(false)
      }
    }
  })
})

describe('pull rates', () => {
  // Rates are asserted as bands rather than exact values: they are the product
  // of two weight tables plus the pity rule, so an exact figure would be a
  // change-detector test. The bands are wide enough to be stable and tight
  // enough to catch a table edited by an order of magnitude.
  const SAMPLE = 20_000

  it('lands within the intended bands over a large sample', () => {
    const seen: Record<string, number> = {}
    let packsWithChase = 0

    for (const result of simulate('creation', SAMPLE, 2024)) {
      for (const card of result.cards) seen[card.rarity] = (seen[card.rarity] ?? 0) + 1
      if (isGodPack(result.cards)) packsWithChase++
    }

    const perPack = (r: Rarity) => (seen[r] ?? 0) / SAMPLE

    expect(perPack('common')).toBeCloseTo(3, 1)
    expect(perPack('uncommon')).toBeGreaterThan(0.9)
    expect(perPack('uncommon')).toBeLessThan(1.3)
    expect(perPack('rare')).toBeGreaterThan(0.5)
    expect(perPack('rare')).toBeLessThan(0.8)
    expect(perPack('anointed')).toBeGreaterThan(0.15)
    expect(perPack('anointed')).toBeLessThan(0.3)

    // A chase card should feel like an event: rare, but not unreachable.
    const chaseRate = packsWithChase / SAMPLE
    expect(chaseRate).toBeGreaterThan(0.04)
    expect(chaseRate).toBeLessThan(0.14)
  })

  it('can eventually pull every card in a pack pool', () => {
    const pulled = new Set<string>()
    for (const result of simulate('the-promise', 8000, 5)) {
      result.cards.forEach((c) => pulled.add(c.id))
    }

    const forbidden = new Set(
      ALL_PACKS.filter((p) => p.set === 'genesis' && p.id !== 'the-promise').flatMap(
        (p) => p.exclusives,
      ),
    )
    const reachable = CARDS.filter((c) => c.set === 'genesis' && !forbidden.has(c.id))

    const missed = reachable.filter((c) => !pulled.has(c.id)).map((c) => c.id)
    expect(missed, 'every reachable card should be obtainable').toEqual([])
  })
})
