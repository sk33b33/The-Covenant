import { describe, expect, it } from 'vitest'
import {
  HOLD_MS,
  MOVE_TOLERANCE,
  initialPress,
  pressReducer,
  type PressEvent,
  type PressState,
} from '../pressGesture'

/**
 * The gesture's thresholds.
 *
 * Every failure here is one you would ship without noticing: a hold that fires
 * mid-scroll, a tap that stops working because the previous drag left the
 * machine wedged, or a lifted card that also plays itself on release.
 */

const run = (events: PressEvent[], from: PressState = initialPress) =>
  events.reduce(pressReducer, from)

const press = (t = 0, x = 100, y = 100): PressEvent => ({ type: 'down', t, x, y })

describe('press gesture', () => {
  it('fires once the hold threshold is reached', () => {
    const held = run([press(0), { type: 'tick', t: HOLD_MS }])
    expect(held.phase).toBe('fired')
    expect(held.progress).toBe(1)
  })

  it('does not fire early', () => {
    const early = run([press(0), { type: 'tick', t: HOLD_MS - 1 }])
    expect(early.phase).toBe('pressing')
    expect(early.progress).toBeLessThan(1)
    expect(early.progress).toBeGreaterThan(0)
  })

  it('cancels when the pointer travels far enough to be a scroll', () => {
    const dragged = run([
      press(0, 100, 100),
      { type: 'move', t: 80, x: 100, y: 100 + MOVE_TOLERANCE + 1 },
      { type: 'tick', t: HOLD_MS + 200 },
    ])
    expect(dragged.phase).toBe('cancelled')
    expect(dragged.suppressNextClick).toBe(false)
  })

  it('tolerates the drift of a thumb holding still', () => {
    const steady = run([
      press(0, 100, 100),
      { type: 'move', t: 80, x: 104, y: 103 },
      { type: 'tick', t: HOLD_MS },
    ])
    expect(steady.phase).toBe('fired')
  })

  it('measures travel from the origin, not from the last move', () => {
    // Creeping across the tolerance in small steps is still a scroll.
    const crept = run([
      press(0, 100, 100),
      { type: 'move', t: 40, x: 106, y: 100 },
      { type: 'move', t: 80, x: 112, y: 100 },
    ])
    expect(crept.phase).toBe('cancelled')
  })

  it('swallows the click that follows a fired hold', () => {
    const after = run([press(0), { type: 'tick', t: HOLD_MS }, { type: 'up' }])
    expect(after.suppressNextClick).toBe(true)

    const consumed = pressReducer(after, { type: 'clickConsumed' })
    expect(consumed.suppressNextClick).toBe(false)
  })

  it('does not stay latched when the owed click never arrives', () => {
    // The viewer opens over the card while the finger is still down, so the
    // click lands on the overlay and this element never sees it. Left latched,
    // the card's next genuine tap is swallowed and the card goes dead.
    const owed = run([press(0), { type: 'tick', t: HOLD_MS }, { type: 'up' }])
    expect(owed.suppressNextClick).toBe(true)

    const nextTap = run([press(3000), { type: 'tick', t: 3100 }, { type: 'up' }], owed)
    expect(nextTap.suppressNextClick).toBe(false)
  })

  it('leaves the click alone when the press was only a tap', () => {
    const tapped = run([press(0), { type: 'tick', t: 120 }, { type: 'up' }])
    expect(tapped.phase).toBe('idle')
    expect(tapped.suppressNextClick).toBe(false)
  })

  it('accepts a fresh press after a cancelled one', () => {
    // The bug this guards against leaves the machine wedged in `cancelled`, so
    // scrolling the binder once kills every hold until the screen remounts.
    const cancelled = run([press(0, 100, 100), { type: 'move', t: 50, x: 100, y: 300 }])
    expect(cancelled.phase).toBe('cancelled')

    const again = run([press(1000), { type: 'tick', t: 1000 + HOLD_MS }], cancelled)
    expect(again.phase).toBe('fired')
  })

  it('accepts a fresh press after a fired one', () => {
    const fired = run([press(0), { type: 'tick', t: HOLD_MS }, { type: 'up' }])
    const again = run([press(2000), { type: 'tick', t: 2000 + HOLD_MS }], fired)
    expect(again.phase).toBe('fired')
  })

  it('ignores stray events while idle', () => {
    for (const event of [
      { type: 'move', t: 10, x: 0, y: 0 },
      { type: 'tick', t: 10 },
      { type: 'up' },
      { type: 'cancel' },
    ] as PressEvent[]) {
      expect(pressReducer(initialPress, event)).toEqual(initialPress)
    }
  })
})
