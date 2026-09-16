/**
 * Local persistence for player state.
 *
 * The device is always the fast path: everything the player owns —
 * collection, currencies, decks, story progress — lands here first.
 * localStorage is the right tool for that rather than IndexedDB: the whole
 * save is a few KB of JSON, it must be readable synchronously during the
 * first render so the app never flashes an empty collection, and Zustand's
 * persist contract is synchronous.
 *
 * The portal account is the real source of truth, though: `save()` mirrors
 * every write there too, through `portalApi.ts`, never in a way this file's
 * own callers have to know about or wait on. Signing in is mandatory to
 * ever reach this code at all (see `store/auth.ts`), so unlike an optional
 * "sync if you happen to be signed in" layer, a save that can't reach the
 * portal is a real problem `portalApi.ts` surfaces on its own.
 */

import { pushState } from '@/lib/portalApi'

const PREFIX = 'covenant:'

/** Bump when a stored shape changes incompatibly; older saves are then reset. */
export const SAVE_VERSION = 1

interface Envelope<T> {
  v: number
  data: T
}

export function load<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(PREFIX + key)
    if (!raw) return fallback

    const parsed = JSON.parse(raw) as Envelope<T>
    if (parsed?.v !== SAVE_VERSION) return fallback

    return parsed.data ?? fallback
  } catch {
    // Corrupt or unavailable storage (private mode, quota, hand-edited JSON).
    // Starting fresh beats refusing to boot.
    return fallback
  }
}

export function save<T>(key: string, data: T): void {
  try {
    localStorage.setItem(PREFIX + key, JSON.stringify({ v: SAVE_VERSION, data }))
  } catch {
    // Out of quota or storage denied. The session keeps working in memory;
    // losing a save is better than crashing mid-match.
  }
  pushState(key, data)
}

export function clearAll(): void {
  try {
    const doomed: string[] = []
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i)
      if (key?.startsWith(PREFIX)) doomed.push(key)
    }
    doomed.forEach((k) => localStorage.removeItem(k))
  } catch {
    /* nothing we can do, and nothing worth crashing over */
  }
}
