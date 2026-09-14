/**
 * Local persistence for player state.
 *
 * The device is always the source of truth: everything the player owns —
 * collection, currencies, decks, story progress — lives here first.
 * localStorage is the right tool for that rather than IndexedDB: the whole
 * save is a few KB of JSON, it must be readable synchronously during the
 * first render so the app never flashes an empty collection, and Zustand's
 * persist contract is synchronous.
 *
 * An account is optional, layered on top rather than required: `save()`
 * mirrors every write to Supabase too, through `cloudSave.ts`, but only once
 * someone has actually signed in (see its own doc comment), and never in a
 * way this file's own callers have to know about or wait on.
 */

import { pushCloudState } from '@/lib/cloudSave'

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
  pushCloudState(key, data)
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
