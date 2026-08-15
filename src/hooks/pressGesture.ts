/**
 * Press-and-hold, as a pure state machine.
 *
 * The gesture has to coexist with three things that already own the pointer: a
 * scrolling grid, a card that plays on tap, and a browser that wants to show a
 * text-selection callout. Getting that right is a matter of thresholds, and
 * thresholds are exactly the thing that is easy to get subtly wrong and
 * impossible to notice by eye — a 300 ms hold fires while you are still
 * flicking the grid, an 800 ms one feels broken.
 *
 * So the rules live here, with no React and no DOM, the same way the match
 * rules live in engine/reducer.ts. useLongPress is the thin layer that feeds
 * this real pointer events.
 */

/** How long the pointer must stay down. */
export const HOLD_MS = 450

/**
 * How far it may travel first, in CSS pixels.
 *
 * This is the number that decides whether the binder still scrolls. Too tight
 * and every flick lifts a card; too loose and a deliberate hold that drifts
 * slightly does nothing. 10px is about a thumb's worth of tremor.
 */
export const MOVE_TOLERANCE = 10

export type PressPhase = 'idle' | 'pressing' | 'fired' | 'cancelled'

export interface PressState {
  phase: PressPhase
  /** Where and when the press started; null when idle. */
  origin: { t: number; x: number; y: number } | null
  /** 0 to 1 across the hold, for the visual cue. Zero unless pressing. */
  progress: number
  /**
   * Set for one transition when the hold fires. The click that follows a hold
   * must not also run the card's tap action — releasing after lifting a card
   * would otherwise play it, or navigate away from the viewer that just
   * opened.
   */
  suppressNextClick: boolean
}

export type PressEvent =
  | { type: 'down'; t: number; x: number; y: number }
  | { type: 'move'; t: number; x: number; y: number }
  | { type: 'tick'; t: number }
  | { type: 'up' }
  | { type: 'cancel' }
  /** The click has been swallowed; stop swallowing the next one. */
  | { type: 'clickConsumed' }

export const initialPress: PressState = {
  phase: 'idle',
  origin: null,
  progress: 0,
  suppressNextClick: false,
}

/** Idle, but carrying forward whether a click still needs swallowing. */
const rest = (state: PressState, phase: PressPhase): PressState => ({
  phase,
  origin: null,
  progress: 0,
  suppressNextClick: state.suppressNextClick,
})

export function pressReducer(state: PressState, event: PressEvent): PressState {
  switch (event.type) {
    case 'down':
      // A new press always starts clean, whatever the last one ended as —
      // otherwise a cancelled drag leaves the next hold dead.
      //
      // That includes dropping any click still owed. The click a fired hold
      // expects does not always arrive: the viewer opens over the card while
      // the finger is still down, so the click lands on the overlay instead
      // and the flag stays latched. The card's next real tap would then be
      // swallowed and do nothing at all. A new press is unambiguous proof that
      // the old click is never coming.
      return {
        phase: 'pressing',
        origin: { t: event.t, x: event.x, y: event.y },
        progress: 0,
        suppressNextClick: false,
      }

    case 'move': {
      if (state.phase !== 'pressing' || !state.origin) return state

      const dx = event.x - state.origin.x
      const dy = event.y - state.origin.y
      if (Math.hypot(dx, dy) > MOVE_TOLERANCE) return rest(state, 'cancelled')

      return { ...state, progress: elapsedFraction(state, event.t) }
    }

    case 'tick': {
      if (state.phase !== 'pressing' || !state.origin) return state

      const fraction = elapsedFraction(state, event.t)
      if (fraction < 1) return { ...state, progress: fraction }

      return { phase: 'fired', origin: null, progress: 1, suppressNextClick: true }
    }

    case 'up':
    case 'cancel':
      // A release before the threshold is an ordinary tap: leave the click
      // alone so the card's own handler runs.
      return state.phase === 'idle' ? state : rest(state, 'idle')

    case 'clickConsumed':
      return { ...state, suppressNextClick: false }
  }
}

const elapsedFraction = (state: PressState, t: number) =>
  state.origin ? Math.min(1, Math.max(0, (t - state.origin.t) / HOLD_MS)) : 0
