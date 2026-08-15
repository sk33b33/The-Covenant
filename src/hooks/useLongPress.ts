import { useCallback, useEffect, useRef, useState } from 'react'
import { HOLD_MS, initialPress, pressReducer, type PressEvent } from './pressGesture'

/**
 * Press and hold, wired to real pointer events.
 *
 * All the judgement lives in pressGesture.ts; this only translates events and
 * drives the clock. Progress is animated with rAF rather than a timeout so the
 * hold cue fills smoothly instead of appearing at the end.
 *
 * Returns handlers to spread onto the element, plus `progress` (0–1) for the
 * cue. Note `onClickCapture`: it is the piece that stops a hold from also
 * running the element's tap action, and it has to be in the capture phase to
 * get there before the element's own onClick.
 */

interface Options {
  onLongPress: () => void
  /** Turns the gesture off without changing the call site's shape. */
  disabled?: boolean
}

export function useLongPress({ onLongPress, disabled }: Options) {
  const [progress, setProgress] = useState(0)
  const state = useRef(initialPress)
  const frame = useRef(0)
  const fire = useRef(onLongPress)

  // Kept in a ref so a re-rendered parent passing a new closure does not have
  // to restart an in-flight press.
  fire.current = onLongPress

  const stopClock = () => {
    cancelAnimationFrame(frame.current)
    frame.current = 0
  }

  const send = useCallback((event: PressEvent) => {
    const before = state.current
    const after = pressReducer(before, event)
    if (after === before) return

    state.current = after
    setProgress(after.progress)

    if (after.phase === 'fired' && before.phase !== 'fired') {
      stopClock()
      // A short pulse is the difference between "the card lifted" and "did I
      // do that?". Absent on desktop and on iOS, where it is simply ignored.
      navigator.vibrate?.(12)
      fire.current()
    } else if (after.phase !== 'pressing') {
      stopClock()
    }
  }, [])

  // One clock for the whole hold, started on pointerdown.
  const runClock = useCallback(() => {
    const step = () => {
      send({ type: 'tick', t: performance.now() })
      if (state.current.phase === 'pressing') frame.current = requestAnimationFrame(step)
    }
    frame.current = requestAnimationFrame(step)
  }, [send])

  useEffect(() => stopClock, [])

  // The handlers are always returned, even when disabled, so a call site's
  // shape never changes with a prop — a conditional spread is how you end up
  // with a card that keeps a stale pointer capture.
  return {
    progress: disabled ? 0 : progress,
    handlers: {
      onPointerDown: (e: React.PointerEvent) => {
        // Secondary buttons are a context menu, not a hold.
        if (disabled || (e.button !== 0 && e.pointerType === 'mouse')) return
        send({ type: 'down', t: performance.now(), x: e.clientX, y: e.clientY })
        runClock()
      },
      onPointerMove: (e: React.PointerEvent) => {
        send({ type: 'move', t: performance.now(), x: e.clientX, y: e.clientY })
      },
      onPointerUp: () => send({ type: 'up' }),
      onPointerCancel: () => send({ type: 'cancel' }),
      // A pointer that leaves the card has stopped pressing it, even if the
      // travel never exceeded the tolerance.
      onPointerLeave: () => send({ type: 'cancel' }),
      onContextMenu: (e: React.MouseEvent) => {
        // Desktop right-click and the Android long-press menu both land here,
        // and both would cover the card we just lifted.
        if (state.current.phase === 'fired') e.preventDefault()
      },
      onClickCapture: (e: React.MouseEvent) => {
        if (!state.current.suppressNextClick) return
        e.preventDefault()
        e.stopPropagation()
        send({ type: 'clickConsumed' })
      },
    },
  }
}

export { HOLD_MS }
