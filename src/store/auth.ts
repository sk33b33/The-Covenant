import { create } from 'zustand'
import * as portalApi from '@/lib/portalApi'
import { useProfile } from './profile'
import { useCollection } from './collection'
import { useDecks } from './decks'
import { useEconomy } from './economy'
import { useMissions } from './missions'
import { useStory } from './story'

/**
 * The account layer. Unlike an optional add-on, signing in against the
 * portal (`portalApi.ts`) is mandatory to ever reach the game at all —
 * there is no guest play and no way to create an account here; that only
 * ever happens on the website. See `App.tsx`'s own gate, which renders
 * nothing but `Auth` until `signedIn` is true.
 */

/** One key, one store's `hydrate` — the same six keys `persist.ts` already
 *  saves under, so a pulled save's `state` object slots straight in without
 *  either side needing to know the other's exact field shapes. */
const HYDRATE: Record<string, (data: never) => void> = {
  profile: (data) => useProfile.getState().hydrate(data),
  collection: (data) => useCollection.getState().hydrate(data),
  decks: (data) => useDecks.getState().hydrate(data),
  economy: (data) => useEconomy.getState().hydrate(data),
  missions: (data) => useMissions.getState().hydrate(data),
  story: (data) => useStory.getState().hydrate(data),
}

/**
 * Runs on every successful sign-in. `null` from `pullState` means the
 * fetch itself failed (offline, a dropped connection right after a login
 * that had just succeeded) — genuinely unknown, not "empty," so this
 * leaves local state alone rather than guessing; the next save attempt
 * surfaces the same problem again. A real object back, even `{}` (a
 * brand-new account's first-ever sign-in), *is* known, and every one of
 * the six keys gets set from it or reset to that store's own default for
 * whatever it doesn't have (each store's own `hydrate` already does
 * `{ ...initial, ...data }`). That unconditional reset matters: a second
 * account signing in on a device that still has a first account's local
 * data must never inherit it just because the second account's own save
 * happens to be thinner.
 */
async function hydrateFromPortal(): Promise<void> {
  const saved = await portalApi.pullState()
  if (!saved) return
  for (const key of Object.keys(HYDRATE)) {
    HYDRATE[key]?.((saved[key] ?? {}) as never)
  }
}

interface AuthState {
  signedIn: boolean
  /** For display only (Menu's account row) — `null` whenever `signedIn` is. */
  email: string | null
  error: string | null
  busy: boolean

  signInWithPassword: (email: string, password: string) => Promise<boolean>
  signOut: () => Promise<void>
  clearError: () => void
}

export const useAuth = create<AuthState>((set) => ({
  signedIn: portalApi.hasValidToken(),
  email: portalApi.currentEmail(),
  error: null,
  busy: false,

  signInWithPassword: async (email, password) => {
    set({ busy: true, error: null })
    const result = await portalApi.login(email, password)
    if (!result.ok) {
      set({ busy: false, error: result.message })
      return false
    }

    await hydrateFromPortal()
    set({ busy: false, signedIn: true, email: portalApi.currentEmail() })
    return true
  },

  signOut: async () => {
    await portalApi.logout()
    set({ signedIn: false, email: null })
  },

  clearError: () => set({ error: null }),
}))

// A 401 from any portal call (a revoked or expired token discovered mid-
// session, not just at launch) bounces back to the sign-in gate the same
// way an explicit sign-out does.
portalApi.setOnUnauthorized(() => useAuth.setState({ signedIn: false, email: null }))
