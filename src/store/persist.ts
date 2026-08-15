/**
 * Local persistence for player state.
 *
 * There is no server and no account. Everything the player owns — collection,
 * currencies, decks, story progress — lives on the device. localStorage is the
 * right tool here rather than IndexedDB: the whole save is a few KB of JSON,
 * it must be readable synchronously during the first render so the app never
 * flashes an empty collection, and Zustand's persist contract is synchronous.
 */

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
