import { describe, expect, it } from 'vitest'
import { wantsTapSound, type TapNode } from '../tapTarget'

/**
 * The tick fires on one delegated listener for the whole app, so this rule is
 * the only thing deciding what makes a noise. Every failure here is one you
 * would ship and then hear on every screen.
 */

const n = (tag: string, extra: Partial<TapNode> = {}): TapNode => ({ tag, ...extra })

/** A press inside a control, as composedPath() reports it: target outwards. */
const insideButton = [n('span'), n('button'), n('div'), n('body'), n('html')]

describe('tap sound targets', () => {
  it('sounds for a button', () => {
    expect(wantsTapSound(insideButton)).toBe(true)
  })

  it('sounds for something acting as a button', () => {
    expect(wantsTapSound([n('div', { role: 'button' }), n('body')])).toBe(true)
  })

  it('sounds for a card', () => {
    expect(wantsTapSound([n('img'), n('article', { card: true }), n('body')])).toBe(true)
  })

  it('stays silent on a disabled control', () => {
    // The press does nothing, so it must sound like nothing. Checked before the
    // tag match, or a disabled button ticks like a live one.
    expect(wantsTapSound([n('span'), n('button', { disabled: true }), n('body')])).toBe(false)
  })

  it('stays silent for plain content', () => {
    expect(wantsTapSound([n('p'), n('div'), n('body'), n('html')])).toBe(false)
  })

  it('honours an opt-out on the element itself', () => {
    // The splash: it has its own chord and must not also tick.
    expect(wantsTapSound([n('button', { muted: true }), n('body')])).toBe(false)
  })

  it('honours an opt-out on an ancestor', () => {
    expect(wantsTapSound([n('span'), n('button'), n('div', { muted: true }), n('body')])).toBe(
      false,
    )
  })

  it('lets the innermost control decide before an outer one', () => {
    // A live button inside a disabled fieldset-like wrapper still sounds: the
    // browser would still have dispatched its click.
    expect(wantsTapSound([n('button'), n('div', { disabled: true }), n('body')])).toBe(true)
  })

  it('stops at the document rather than running off the end', () => {
    expect(wantsTapSound([n('body'), n('html'), n('#document')])).toBe(false)
    expect(wantsTapSound([])).toBe(false)
  })
})
