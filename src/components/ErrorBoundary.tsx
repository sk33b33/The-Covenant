import { Component, type ErrorInfo, type ReactNode } from 'react'
import { TreeMark } from '@/art/icons'
import { Button } from './ui'

/**
 * Catches a render crash anywhere below it and shows a recoverable screen
 * instead of the blank white page React leaves behind otherwise. Without
 * this, a thrown error in any one screen's render took the entire app down
 * silently — nothing in the UI explained what happened or offered a way
 * back, and the only fix was knowing to reload.
 *
 * Mounted once, around the whole app (see App.tsx) rather than per-screen:
 * a crash anywhere is the same dead end for the player regardless of which
 * screen it came from, and a single boundary is one less place for the
 * recovery UI itself to drift out of sync.
 */

interface Props {
  children: ReactNode
}

interface State {
  error: Error | null
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // No telemetry wired up yet — this is the one place a crash is
    // guaranteed to be seen at all, so it goes to the console rather than
    // nowhere.
    // eslint-disable-next-line no-console
    console.error('Uncaught render error:', error, info.componentStack)
  }

  /** Clears the caught error and lets the tree render fresh. Most crashes
   *  here trace back to some one-off, transient piece of state — a route
   *  mid-transition, a lookup that ran a beat before its data arrived — that
   *  a clean re-render simply doesn't hit a second time. A full reload is
   *  the fallback for the one that does. */
  private retry = () => this.setState({ error: null })

  render() {
    if (!this.state.error) return this.props.children

    return (
      <div className="h-full flex flex-col items-center justify-center gap-5 px-8 text-center bg-bg text-ink">
        <TreeMark size={40} className="text-ink-faint" />
        <div>
          <h1 className="font-display text-lg">Something went wrong</h1>
          <p className="text-sm text-ink-muted mt-2 max-w-[38ch]">
            This screen hit a snag. Your progress is saved on its own
            schedule, separate from this — trying again costs you nothing.
          </p>
        </div>
        <div className="flex gap-3">
          <Button variant="raised" onClick={this.retry}>
            Try again
          </Button>
          <Button variant="gold" onClick={() => window.location.reload()}>
            Reload
          </Button>
        </div>
      </div>
    )
  }
}
