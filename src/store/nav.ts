import { create } from 'zustand'

/**
 * Navigation.
 *
 * A hand-rolled stack rather than a router library. The game is a single
 * full-screen surface with no deep links, no server routes and no URLs worth
 * sharing; what it does need is a modal stack that a hardware back button can
 * pop, and screens that keep their scroll position when you return to a tab.
 * A router would add a dependency and an address bar we would then have to
 * hide.
 */

export type Tab = 'home' | 'cards' | 'social' | 'battle' | 'menu'

export type Route =
  | { name: 'enter' }
  | { name: 'tab'; tab: Tab }
  /** `source` records how the pack is being paid for, so PackOpen charges the
   *  right currency at the moment the wrapper is torn rather than on entry —
   *  backing out of a sealed pack must cost nothing. */
  | { name: 'pack-open'; packId: string; source: 'free' | 'talents' }
  | { name: 'shop' }
  | { name: 'missions' }
  | { name: 'profile' }
  | { name: 'deck-builder'; deckId?: string }
  | { name: 'story-map' }
  | { name: 'story-encounter'; encounterId: string }
  /**
   * `at` gives each visit its own identity, the same reason `pack-open` keys
   * off `packId` and `story-encounter` off `encounterId`: `routeKey` below
   * needs a value that changes between two trips to the *same* deck, or a
   * second Quick Battle collapses onto the identical key as the first.
   * Battle in particular cannot rely on falling back to the bare route name
   * the way `shop` or `profile` do — its exit transition is the one this
   * app has already caught failing to signal completion to `AnimatePresence`
   * (see the comment above `Result` in Battle.tsx), so a finished match can
   * still be mounted under `battle` when the next one starts. A distinct key
   * per visit means the new match is a genuinely new component regardless of
   * whether the old one ever finished leaving — the same fix in kind as the
   * `mode="wait"` removal that comment describes, just for the trip in the
   * other direction: back into Battle rather than out of it.
   *
   * Required, not optional like `deckId`/`encounterId` above it: `packId`
   * and `encounterId` are required on their own routes for the identical
   * reason, and leaving this one optional would let a future call site omit
   * it and quietly reintroduce this exact bug the next time someone adds a
   * second way to reach Battle.
   */
  | { name: 'battle'; encounterId?: string; deckId?: string; at: number }
  /** Wherever a real screen doesn't exist yet. `icon` picks from a small fixed
   *  set in App.tsx rather than carrying a React node, so a route stays a
   *  plain, serialisable value like every other one here. */
  | { name: 'coming-soon'; title: string; icon: ComingSoonIcon }

export type ComingSoonIcon = 'mail' | 'gifts'

interface NavStore {
  /** Bottom of the stack is the current tab; anything above is layered over it. */
  stack: Route[]
  route: Route
  tab: Tab

  go: (route: Route) => void
  setTab: (tab: Tab) => void
  back: () => void
  /** Drops every layer and returns to the current tab. */
  reset: () => void
}

const TAB_ROUTE = (tab: Tab): Route => ({ name: 'tab', tab })

export const useNav = create<NavStore>((set, get) => ({
  stack: [{ name: 'enter' }],
  route: { name: 'enter' },
  tab: 'home',

  go: (route) => {
    const stack = [...get().stack, route]
    set({ stack, route })
  },

  setTab: (tab) => {
    // Switching tabs clears any layers above it.
    const route = TAB_ROUTE(tab)
    set({ stack: [route], route, tab })
  },

  back: () => {
    const { stack, tab } = get()
    if (stack.length <= 1) {
      const route = TAB_ROUTE(tab)
      set({ stack: [route], route })
      return
    }

    const next = stack.slice(0, -1)
    set({ stack: next, route: next[next.length - 1]! })
  },

  reset: () => {
    const route = TAB_ROUTE(get().tab)
    set({ stack: [route], route })
  },
}))

/** True when the current route is layered over a tab and can be dismissed. */
export const canGoBack = () => useNav.getState().stack.length > 1
