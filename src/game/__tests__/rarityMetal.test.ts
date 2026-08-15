import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { METALS, METAL_LABEL, RARITIES, RARITY_METAL, RARITY_ORDER } from '../types'

/**
 * The rarity ladder, struck in metal.
 *
 * Two failures this guards against, both silent. Add a rarity and forget its
 * metal, and the card falls back to copper — it renders, it just quietly lies
 * about being Common. Rename or drop a metal token, and `var(--metal-x)`
 * resolves to nothing, which paints a transparent rim rather than throwing.
 * Neither shows up in a type error and neither looks broken enough to notice.
 */

const TOKENS = readFileSync(resolve(__dirname, '../../styles/tokens.css'), 'utf8')

describe('rarity metals', () => {
  it('gives every rarity a metal', () => {
    const unmapped = RARITIES.filter((rarity) => !RARITY_METAL[rarity])
    expect(unmapped, 'add entries to RARITY_METAL in src/game/types.ts').toEqual([])
  })

  it('climbs with rarity rather than crossing it', () => {
    // A silver Crown beside a gold Rare would make the rim actively misleading:
    // worse than no rim at all, because a player would learn the wrong ladder.
    const byRarity = [...RARITIES].sort((a, b) => RARITY_ORDER[a] - RARITY_ORDER[b])
    const metalRanks = byRarity.map((rarity) => METALS.indexOf(RARITY_METAL[rarity]))

    expect(metalRanks).toEqual([...metalRanks].sort((a, b) => a - b))
    expect(metalRanks.every((rank) => rank >= 0)).toBe(true)
  })

  it('uses a distinct metal per rarity', () => {
    expect(new Set(Object.values(RARITY_METAL)).size).toBe(RARITIES.length)
  })

  it('names every metal', () => {
    expect(METALS.filter((metal) => !METAL_LABEL[metal])).toEqual([])
  })

  it('defines every metal token the card frame and pips reach for', () => {
    // card.css sets --metal-rim from --metal-<name>; RarityMark reads the three
    // pip stops. A missing one paints nothing rather than failing loudly.
    const missing = METALS.flatMap((metal) =>
      [`--metal-${metal}:`, `--metal-${metal}-hi:`, `--metal-${metal}-mid:`, `--metal-${metal}-lo:`]
        .filter((token) => !TOKENS.includes(token))
        .map((token) => `${token} (${metal})`),
    )

    expect(missing, 'add the missing tokens to src/styles/tokens.css').toEqual([])
  })
})
