import '@testing-library/jest-dom/vitest'
import { afterEach } from 'vitest'
import { cleanup } from '@testing-library/react'

// Harmless for node-environment test files too — nothing ever renders
// into them, so there is never anything to unmount.
afterEach(() => {
  cleanup()
})

// jsdom has no pointer-capture implementation at all (calling the real DOM
// method throws "not a function") — CardViewer's tilt drag calls
// `setPointerCapture`/`releasePointerCapture` on every press, so anything
// that renders it needs these to at least no-op.
if (typeof Element !== 'undefined' && !Element.prototype.setPointerCapture) {
  Element.prototype.setPointerCapture = () => {}
  Element.prototype.releasePointerCapture = () => {}
  Element.prototype.hasPointerCapture = () => false
}

// jsdom doesn't implement matchMedia either — several components read
// `prefers-reduced-motion` straight off it (CardViewer's tilt, the
// `useReducedMotion` hook). Reports "no preference" / doesn't match, same as
// a default browser profile.
if (typeof window !== 'undefined' && !window.matchMedia) {
  window.matchMedia = (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  })
}
