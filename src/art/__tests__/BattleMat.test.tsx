import { describe, expect, it } from 'vitest'
import { render } from '@testing-library/react'
import { BattleMat, MAT_TINT } from '../BattleMat'

/** First `<stop>` of the mat's own radial "clash" gradient — the strongest,
 *  purest hit of the theme colour, so it's the one element whose colour
 *  should read as exactly `MAT_TINT[theme]` rather than a blend toward gold. */
function clashStopColor(container: HTMLElement): string | null {
  const clashGradient = container.querySelector('radialGradient[id*="clash"]')
  return clashGradient?.querySelector('stop')?.getAttribute('stop-color') ?? null
}

describe('BattleMat', () => {
  it('tints the clash ring with the given theme', () => {
    const { container } = render(<BattleMat theme="fire" />)
    expect(clashStopColor(container)).toBe(MAT_TINT.fire)
  })

  it('renders a different tint for a different theme', () => {
    const { container: waterMat } = render(<BattleMat theme="water" />)
    const { container: shadowMat } = render(<BattleMat theme="shadow" />)
    expect(clashStopColor(waterMat)).toBe(MAT_TINT.water)
    expect(clashStopColor(shadowMat)).toBe(MAT_TINT.shadow)
    expect(clashStopColor(waterMat)).not.toBe(clashStopColor(shadowMat))
  })

  it('defaults to the earth theme when none is given', () => {
    const { container } = render(<BattleMat />)
    expect(clashStopColor(container)).toBe(MAT_TINT.earth)
  })

  it('gives each instance its own gradient ids, so two mats on one page never collide', () => {
    const { container } = render(
      <>
        <BattleMat theme="light" />
        <BattleMat theme="light" />
      </>,
    )
    const ids = [...container.querySelectorAll('radialGradient[id*="clash"]')].map((el) =>
      el.getAttribute('id'),
    )
    expect(ids).toHaveLength(2)
    expect(new Set(ids).size).toBe(2)
  })
})
