import { create } from 'zustand'
import type { Session } from '@supabase/supabase-js'
import { client } from '@/lib/supabase'
import { pullCloudState, pushCloudState } from '@/lib/cloudSave'
import { load } from './persist'
import { useProfile } from './profile'
import { useCollection } from './collection'
import { useDecks } from './decks'
import { useEconomy } from './economy'
import { useMissions } from './missions'
import { useStory } from './story'

/**
 * The account layer, entirely optional and additive over the six local
 * stores `persist.ts` already owns — see its own doc comment. Nothing here
 * gates play: a build with no Supabase project configured (`client()` is
 * `null`, see `lib/supabase.ts`) just never has a session, and every action
 * below fails softly with a message instead of throwing.
 */

/** One key, one store's `hydrate` — the same six keys `persist.ts` already
 *  saves under, so a cloud pull's `state` object slots straight in without
 *  either side needing to know the other's exact field shapes. */
const HYDRATE: Record<string, (data: never) => void> = {
  profile: (data) => useProfile.getState().hydrate(data),
  collection: (data) => useCollection.getState().hydrate(data),
  decks: (data) => useDecks.getState().hydrate(data),
  economy: (data) => useEconomy.getState().hydrate(data),
  missions: (data) => useMissions.getState().hydrate(data),
  story: (data) => useStory.getState().hydrate(data),
}

const KEYS = Object.keys(HYDRATE)

/**
 * Runs once per actual sign-in — never on a session merely restoring itself
 * at app load, since local storage already mirrors the cloud in that case
 * (every local save already pushed up as it happened).
 *
 * A brand-new account has no cloud row yet: local state is the truth, so
 * whatever's already on this device — read straight back out of the same
 * envelopes `persist.ts` wrote during guest play, via `load()` — gets
 * pushed up to claim the row rather than being discarded. An account
 * that's synced before wins outright: its cloud row overwrites local,
 * which is v1's whole conflict policy (see the plan this was built from).
 */
async function syncOnSignIn(): Promise<void> {
  const cloud = await pullCloudState()

  if (!cloud) {
    for (const key of KEYS) pushCloudState(key, load(key, null))
    return
  }

  for (const key of KEYS) {
    if (key in cloud) HYDRATE[key]?.(cloud[key] as never)
  }
}

interface AuthState {
  /** `undefined` until the first session check resolves, so the UI can tell
   *  "not signed in" apart from "haven't checked yet" and avoid flashing a
   *  Sign In button for someone who turns out to already be signed in. */
  session: Session | null | undefined
  error: string | null
  busy: boolean

  signUp: (email: string, password: string) => Promise<boolean>
  signInWithPassword: (email: string, password: string) => Promise<boolean>
  signOut: () => Promise<void>
  clearError: () => void
}

const NOT_CONFIGURED = 'Sign-in is not available in this build.'

export const useAuth = create<AuthState>((set) => ({
  session: undefined,
  error: null,
  busy: false,

  signUp: async (email, password) => {
    const supabase = client()
    if (!supabase) {
      set({ error: NOT_CONFIGURED })
      return false
    }

    set({ busy: true, error: null })
    const { error } = await supabase.auth.signUp({ email, password })
    set({ busy: false })
    if (error) {
      set({ error: error.message })
      return false
    }
    return true
  },

  signInWithPassword: async (email, password) => {
    const supabase = client()
    if (!supabase) {
      set({ error: NOT_CONFIGURED })
      return false
    }

    set({ busy: true, error: null })
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    set({ busy: false })
    if (error) {
      set({ error: error.message })
      return false
    }
    return true
  },

  signOut: async () => {
    await client()?.auth.signOut()
  },

  clearError: () => set({ error: null }),
}))

// Module-owned, the same singleton-subscription shape `music.ts` already
// uses for `useSettings.subscribe` — set up once, regardless of how many
// components read `useAuth`.
const supabase = client()
if (supabase) {
  void supabase.auth.getSession().then(({ data: { session } }) => {
    useAuth.setState({ session })
  })

  supabase.auth.onAuthStateChange((event, session) => {
    useAuth.setState({ session })
    if (event === 'SIGNED_IN') void syncOnSignIn()
  })
} else {
  useAuth.setState({ session: null })
}
