import { beforeEach, describe, expect, it } from 'vitest'
import { act, fireEvent, render, screen } from '@testing-library/react'
import { CardViewer } from '../CardViewer'
import { usePeek } from '@/store/peek'
import { CARDS } from '@/data/cards'

const card = CARDS[0]!

/** A 200x280 card frame, centred at (100, 140) — `track`'s own normalisation
 *  (`(clientX - left) / width`) needs a real rect or it divides by zero,
 *  which jsdom's all-zero default `getBoundingClientRect` would do. */
function mockFrameRect() {
  const rect = { left: 0, top: 0, width: 200, height: 280, right: 200, bottom: 280 } as DOMRect
  Element.prototype.getBoundingClientRect = () => rect
}

/** Framer-motion writes `rotateX`/`rotateY` to the DOM `transform` on its own
 *  render loop (one animation frame after the motion value changes), never
 *  synchronously inside the event handler that moved it — so every assertion
 *  below has to let at least one frame pass first. */
async function nextFrame() {
  await act(async () => {
    await new Promise((resolve) => requestAnimationFrame(resolve))
  })
}

/** The rotateY component the card is currently sitting at, read straight off
 *  the inline `transform`. A term framer-motion omits (exactly at 0deg)
 *  reads as flat, same as an explicit `rotateY(0deg)` would. */
function rotateYDeg(el: Element): number {
  const style = el.getAttribute('style') ?? ''
  const match = style.match(/rotateY\(([-\d.]+)deg\)/)
  return match ? parseFloat(match[1]!) : 0
}

function renderOpenCard() {
  const { container } = render(<CardViewer />)
  act(() => {
    usePeek.getState().peek(card)
  })
  // .cov-card (the article Card.tsx renders) -> the rotateX/rotateY
  // motion.div -> the stage div -> frameRef's motion.div, which owns the
  // pointer handlers under test.
  const tilted = container.querySelector('.cov-card')!.parentElement!
  const frame = tilted.parentElement!.parentElement!
  return { frame, tilted }
}

describe('CardViewer tilt engage', () => {
  beforeEach(() => {
    mockFrameRect()
    usePeek.setState({
      card: null,
      actions: [],
      actionsNote: undefined,
      count: undefined,
      list: undefined,
      index: undefined,
      onStep: undefined,
    })
  })

  it('opens on peek() and renders the card as a dialog', () => {
    render(<CardViewer />)
    act(() => {
      usePeek.getState().peek(card)
    })
    expect(screen.getByRole('dialog', { name: card.name })).toBeInTheDocument()
  })

  it('a motionless hold never tilts the card — only a drag does', async () => {
    const { frame, tilted } = renderOpenCard()

    fireEvent.pointerDown(frame, { clientX: 100, clientY: 140, pointerId: 1 })
    await nextFrame()
    expect(rotateYDeg(tilted)).toBe(0)

    fireEvent.pointerUp(frame, { clientX: 100, clientY: 140, pointerId: 1 })
    await nextFrame()
    expect(rotateYDeg(tilted)).toBe(0)
  })

  it('the first move of a drag snaps straight to its target instead of lerping up from level', async () => {
    const { frame, tilted } = renderOpenCard()

    // Pointer goes down at centre, then all the way to the right edge —
    // nx normalises to 1, so rotateY should land on -MAX_TILT (-25deg).
    fireEvent.pointerDown(frame, { clientX: 100, clientY: 140, pointerId: 1 })
    fireEvent.pointerMove(frame, { clientX: 200, clientY: 140, pointerId: 1 })

    // One frame is all framer-motion needs to paint a `.set()` that already
    // happened — if this were still lerping from level (the bug the
    // `engaging` ref exists to prevent), a single frame at 18% smoothing
    // would read close to -4.5deg, not the full -25deg.
    await nextFrame()
    expect(rotateYDeg(tilted)).toBe(-25)
  })

  it('a later move during the same drag lerps smoothly rather than snapping again', async () => {
    const { frame, tilted } = renderOpenCard()

    fireEvent.pointerDown(frame, { clientX: 100, clientY: 140, pointerId: 1 })
    fireEvent.pointerMove(frame, { clientX: 200, clientY: 140, pointerId: 1 })
    await nextFrame()
    expect(rotateYDeg(tilted)).toBe(-25)

    // Reverse all the way to the left edge. The engage snap only ever fires
    // on the first move after a press, so this one frame should show the
    // per-frame lerp's own partial progress back toward 0, not an instant
    // jump to the new target (+25deg).
    fireEvent.pointerMove(frame, { clientX: 0, clientY: 140, pointerId: 1 })
    await nextFrame()
    const afterOneFrame = rotateYDeg(tilted)
    expect(afterOneFrame).toBeGreaterThan(-25)
    expect(afterOneFrame).toBeLessThan(25)
  })

  it('releasing the drag springs the card back level', async () => {
    const { frame, tilted } = renderOpenCard()

    fireEvent.pointerDown(frame, { clientX: 100, clientY: 140, pointerId: 1 })
    fireEvent.pointerMove(frame, { clientX: 200, clientY: 140, pointerId: 1 })
    await nextFrame()
    expect(rotateYDeg(tilted)).toBe(-25)

    fireEvent.pointerUp(frame, { clientX: 200, clientY: 140, pointerId: 1 })
    // `level()` targets 0, approached by the same per-frame lerp — several
    // frames is enough to settle well short of the ~0.18 remaining fraction
    // per frame mattering at this precision.
    for (let i = 0; i < 40; i++) await nextFrame()
    expect(rotateYDeg(tilted)).toBeCloseTo(0, 1)
  })
})
