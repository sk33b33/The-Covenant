import { client } from './supabase'

/**
 * The sync primitives `persist.ts` and `store/auth.ts` build on. Neither
 * function here ever throws: a signed-out player, an unconfigured build (see
 * `supabase.ts`), or a dropped connection are all just "no cloud right now,"
 * the same as a `localStorage` write `persist.ts` itself can't complete.
 */

/**
 * Merges one store's data into the signed-in player's cloud row — never a
 * full overwrite of the row, so pushing `economy` right after a pack opens
 * can't clobber a `decks` edit that landed a moment earlier. Fire-and-forget:
 * callers don't await this, the same way a `save()` to `localStorage` never
 * blocks on the disk actually settling.
 *
 * Called from `persist.ts`'s own `save()` on *every* write, signed in or not
 * — guest play is the common case, so the no-session check happens here
 * rather than asking every caller to know whether anyone's signed in.
 * `getSession()` reads the SDK's own in-memory/local session, not the
 * network, so a guest's every save doesn't cost a round trip just to find
 * out there's nowhere to send it.
 */
export function pushCloudState(key: string, data: unknown): void {
  const supabase = client()
  if (!supabase) return

  void supabase.auth.getSession().then(({ data: { session } }) => {
    if (!session) return
    // Offline, RLS misconfigured, the table doesn't exist yet — none of it
    // is checked here. Nothing depends on this succeeding; the local save
    // through `persist.ts` already landed regardless.
    void supabase.rpc('merge_player_state', { patch: { [key]: data } })
  })
}

/**
 * The signed-in player's full cloud row, or `null` if there isn't one yet
 * (a brand-new account) or nothing could be reached at all. Callers can't
 * tell those two apart from this alone, which is fine: both mean "there is
 * no cloud state to pull down right now."
 */
export async function pullCloudState(): Promise<Record<string, unknown> | null> {
  const supabase = client()
  if (!supabase) return null

  const { data: userData } = await supabase.auth.getUser()
  const userId = userData.user?.id
  if (!userId) return null

  const { data, error } = await supabase
    .from('player_saves')
    .select('state')
    .eq('user_id', userId)
    .maybeSingle()

  if (error || !data) return null
  return (data.state as Record<string, unknown>) ?? null
}
