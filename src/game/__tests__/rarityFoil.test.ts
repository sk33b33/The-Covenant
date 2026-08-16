import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { FOILS, RARITIES, RARITY_FOIL, RARITY_METAL, RARITY_ORDER } from '../types'

/**
 * The foil ladder.
 *
 * Same class of silent failure the metals have: add a rarity and forget its
 * finish and the card renders perfectly, just without the shine it earned.
 * Rename a foil and the CSS selector matches nothing — no error, no warning,
 * only a card that quietly stops being special.
 */

const CARD_CSS = readFileSync(resolve(__dirname, '../../components/card/card.css'), 'utf8')

describe('rarity foils', () => {
  it('gives every rarity a finish', () => {
    const unmapped = RARITIES.filter((rarity) => !RARITY_FOIL[rarity])
    expect(unmapped, 'add entries to RARITY_FOIL in src/game/types.ts').toEqual([])
  })

  it('never steps back down the ladder', () => {
    // A Crown may share a finish with a Sacred, but it must never wear a
    // plainer one than a Rare — the shine has to agree with the rarity it is
    // meant to signal.
    const byRarity = [...RARITIES].sort((a, b) => RARITY_ORDER[a] - RARITY_ORDER[b])
    const ranks = byRarity.map((rarity) => FOILS.indexOf(RARITY_FOIL[rarity]))

    expect(ranks).toEqual([...ranks].sort((a, b) => a - b))
    expect(ranks.every((rank) => rank >= 0)).toBe(true)
  })

  it('leaves the bottom of the ladder plain', () => {
    // If everything shines, nothing does.
    expect(RARITY_FOIL.common).toBe('none')
    expect(RARITY_FOIL.uncommon).toBe('none')
  })

  it('reaches the top of the ladder', () => {
    expect(RARITY_FOIL[RARITIES[RARITIES.length - 1]!]).toBe('cosmos')
  })

  it('has a rule behind every finish it uses', () => {
    // A [data-foil] selector that matches no rule is invisible rather than
    // broken, which is exactly why it needs asserting.
    const used = [...new Set(Object.values(RARITY_FOIL))].filter((foil) => foil !== 'none')
    const missing = used.filter((foil) => !CARD_CSS.includes(`[data-foil='${foil}']`))

    expect(missing, 'add the missing rules to src/components/card/card.css').toEqual([])
  })

  it('stays independent of the metal ladder', () => {
    // Two systems reading the same rarity, deliberately at different
    // resolutions: seven metals so every tier is distinct, four finishes so
    // the steps that matter are felt rather than counted.
    const metals = new Set(Object.values(RARITY_METAL)).size
    const foils = new Set(Object.values(RARITY_FOIL)).size
    expect(metals).toBeGreaterThan(foils)
  })
})
