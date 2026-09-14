import { createClient, type SupabaseClient } from '@supabase/supabase-js'

/**
 * The one Supabase client, shared by everything under `store/auth.ts` and
 * `lib/cloudSave.ts` — a single project connection, not one per caller.
 *
 * Both env vars are optional at the platform level: a preview build, a fork,
 * or this repo's own dev environment may simply not have a Supabase project
 * configured. Rather than crash or throw on import, an unconfigured build
 * just never has a client — every caller here treats `client()` returning
 * `null` as "no cloud today," the same tolerance `persist.ts` already
 * extends to a `localStorage` that refuses to cooperate.
 */

const URL = import.meta.env.VITE_SUPABASE_URL
const ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY

const instance: SupabaseClient | null = URL && ANON_KEY ? createClient(URL, ANON_KEY) : null

export function client(): SupabaseClient | null {
  return instance
}
