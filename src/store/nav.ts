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
  | { name: 'pack-open'; packId: string }
  | { name: 'shop' }
  | { name: 'missions' }
  | { name: 'profile' }
  | { name: 'deck-builder'; deckId?: string }
  | { name: 'story-map' }
  | { name: 'story-encounter'; encounterId: string }
  | { name: 'battle'; encounterId?: string; deckId?: string }

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
