/**
 * The Covenant TCG Portal — the one place an account is ever created.
 * This module only ever signs in against an account that already exists
 * there; there is no sign-up here at all (see `screens/Auth.tsx`).
 *
 * The portal issues a bearer token (not a cookie — this is a different
 * origin, and a browser can't read another origin's httpOnly cookie
 * anyway), stored here under its own localStorage key, deliberately
 * outside `persist.ts`'s six-key save envelope so the token itself is
 * never mistaken for syncable game state.
 */

export const PORTAL_URL = (import.meta.env.VITE_PORTAL_API_URL as string | undefined)?.replace(
  /\/$/,
  '',
)

const TOKEN_KEY = 'covenant:portalToken'

const NOT_CONFIGURED = 'Sign-in is not available in this build.'
const UNREACHABLE = 'Could not reach the server. Check your connection.'

interface StoredToken {
  token: string
  expiresAt: number
  email: string
}

function readToken(): StoredToken | null {
  try {
    const raw = localStorage.getItem(TOKEN_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as Partial<StoredToken>
    if (
      typeof parsed.token !== 'string' ||
      typeof parsed.expiresAt !== 'number' ||
      typeof parsed.email !== 'string'
    ) {
      return null
    }
    return parsed as StoredToken
  } catch {
    return null
  }
}

function writeToken(stored: StoredToken | null): void {
  try {
    if (stored) localStorage.setItem(TOKEN_KEY, JSON.stringify(stored))
    else localStorage.removeItem(TOKEN_KEY)
  } catch {
    // Storage denied or full — the session still works in memory for as
    // long as this tab stays open; there's nothing more to do about it.
  }
}

/** A locally-known-good token, checked against its own expiry — no network
 *  round trip, so this is safe to call synchronously at app launch. */
export function hasValidToken(): boolean {
  const stored = readToken()
  return stored !== null && stored.expiresAt > Date.now()
}

/** The signed-in player's email, for display (Menu's account row) — `null`
 *  if there's no valid stored session. Same synchronous, no-network read. */
export function currentEmail(): string | null {
  return hasValidToken() ? (readToken()?.email ?? null) : null
}

/** Called the moment any portal call comes back 401 — the stored token was
 *  revoked server-side (a password change/reset) or has genuinely expired.
 *  `store/auth.ts` uses this to bounce back to the sign-in gate. */
let onUnauthorized: (() => void) | null = null
export function setOnUnauthorized(handler: () => void): void {
  onUnauthorized = handler
}

function forceSignOut(): void {
  writeToken(null)
  onUnauthorized?.()
}

export async function login(
  email: string,
  password: string,
): Promise<{ ok: true } | { ok: false; message: string }> {
  if (!PORTAL_URL) return { ok: false, message: NOT_CONFIGURED }

  let response: Response
  try {
    response = await fetch(`${PORTAL_URL}/api/game/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    })
  } catch {
    return { ok: false, message: UNREACHABLE }
  }

  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as { error?: string } | null
    return { ok: false, message: body?.error ?? 'Invalid email or password.' }
  }

  const body = (await response.json()) as {
    token: string
    expiresAt: string
    user: { email: string }
  }
  writeToken({
    token: body.token,
    expiresAt: new Date(body.expiresAt).getTime(),
    email: body.user.email,
  })
  return { ok: true }
}

export async function logout(): Promise<void> {
  const stored = readToken()
  writeToken(null)
  if (!PORTAL_URL || !stored) return

  // Best-effort server-side revocation — the token is already forgotten
  // locally regardless of whether this actually reaches the portal.
  void fetch(`${PORTAL_URL}/api/game/auth/logout`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${stored.token}` },
  }).catch(() => {})
}

/**
 * Merges one store's data into the signed-in player's save row — never a
 * full overwrite, so pushing `economy` right after a pack opens can't
 * clobber a `decks` edit that landed a moment earlier. Fire-and-forget:
 * callers don't await this, the same way a `save()` to `localStorage`
 * never blocks on the disk actually settling.
 *
 * Called from `persist.ts`'s own `save()` on every write. Unlike the
 * Supabase version this replaces, there is no "no one's signed in, skip
 * silently" case any more — sign-in is mandatory to ever reach gameplay,
 * so a missing or rejected token here means the session genuinely needs
 * re-authenticating, not that guest play is in progress.
 */
export function pushState(key: string, data: unknown): void {
  const stored = readToken()
  if (!PORTAL_URL) return
  if (!stored) {
    forceSignOut()
    return
  }

  fetch(`${PORTAL_URL}/api/game/save`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${stored.token}` },
    body: JSON.stringify({ patch: { [key]: data } }),
  })
    .then((response) => {
      if (response.status === 401) {
        forceSignOut()
        return
      }
      if (!response.ok) console.error(`[portalApi] push of "${key}" failed:`, response.status)
    })
    .catch((error) => {
      console.error(`[portalApi] push of "${key}" failed:`, error)
    })
}

/**
 * The signed-in player's full save state, or `null` if it couldn't be
 * fetched (offline, expired token — `forceSignOut` handles the latter).
 */
export async function pullState(): Promise<Record<string, unknown> | null> {
  const stored = readToken()
  if (!PORTAL_URL || !stored) return null

  let response: Response
  try {
    response = await fetch(`${PORTAL_URL}/api/game/save`, {
      headers: { Authorization: `Bearer ${stored.token}` },
    })
  } catch (error) {
    console.error('[portalApi] pull failed:', error)
    return null
  }

  if (response.status === 401) {
    forceSignOut()
    return null
  }
  if (!response.ok) {
    console.error('[portalApi] pull failed:', response.status)
    return null
  }

  const body = (await response.json()) as { state: Record<string, unknown> }
  return body.state ?? null
}
