/**
 * Whether a press should make a sound.
 *
 * The tick is hung on one delegated listener rather than on every control, so
 * this rule is the only thing standing between "a button answered you" and
 * "the app clicks at random". It has real edges — a disabled button must stay
 * silent, and the splash has its own chord and must not also tick — and those
 * edges are exactly what goes unnoticed when they break.
 *
 * So the rule is pure and lives here, taking the event's path reduced to plain
 * descriptors, the same way pressGesture.ts keeps the hold thresholds testable
 * without a DOM.
 */

export interface TapNode {
  /** Lowercase tag name. */
  tag: string
  /** ARIA role, if the element carries one. */
  role?: string | undefined
  /** True for a disabled form control. */
  disabled?: boolean | undefined
  /** True when the element opts out via data-mute-tap. */
  muted?: boolean | undefined
  /** True for a rendered card face. */
  card?: boolean | undefined
}

/**
 * `path` runs from the pressed element outwards, as `composedPath()` gives it.
 *
 * The two negatives behave differently on purpose, and the difference is the
 * only subtle thing here:
 *
 * `muted` is a property of a *region*. Marking a subtree silent has to hold for
 * everything inside it, or the opt-out is useless the moment the region
 * contains a control — which is the only case anyone would mark.
 *
 * `disabled` is a property of the *nearest* control. A live button inside a
 * disabled wrapper still receives its press from the browser, so it still owes
 * you a tick; only a press on the disabled control itself is inert.
 */
export function wantsTapSound(path: readonly TapNode[]): boolean {
  if (path.some((node) => node.muted)) return false

  for (const node of path) {
    // Checked before the tag match below, or a disabled button ticks exactly
    // like a live one while doing nothing at all.
    if (node.disabled) return false

    if (node.tag === 'button' || node.role === 'button' || node.card) return true

    // Nothing above the document body can be a control.
    if (node.tag === 'body' || node.tag === 'html') return false
  }

  return false
}
