import { create } from 'zustand'

/**
 * Whether the player's most recent local changes have actually reached the
 * portal — surfaced in Menu's account row.
 *
 * `persist.ts`'s `save()` pushes to the portal fire-and-forget: the local
 * write always succeeds, so nothing in the UI ever had to wait on the
 * network, but that also meant a push that failed (a dropped connection, a
 * server hiccup) failed silently — the local save looked identical whether
 * it had actually reached the server or not. This store is `portalApi.ts`'s
 * own running account of that, not a cache of the save data itself: just
 * "is there a push in flight right now" and "did the last one that finished
 * land or give up."
 */
interface SyncStatusState {
  /** Pushes currently in flight or waiting on a retry delay. */
  pending: number
  lastSyncedAt: number | null
  /** Set once a push exhausts its retries; cleared the moment any push
   *  (not necessarily the one that failed) next succeeds. */
  lastError: string | null
}

export const useSyncStatus = create<SyncStatusState>(() => ({
  pending: 0,
  lastSyncedAt: null,
  lastError: null,
}))

export function syncStarted(): void {
  useSyncStatus.setState((s) => ({ pending: s.pending + 1 }))
}

export function syncSucceeded(): void {
  useSyncStatus.setState((s) => ({
    pending: Math.max(0, s.pending - 1),
    lastSyncedAt: Date.now(),
    lastError: null,
  }))
}

export function syncFailed(message: string): void {
  useSyncStatus.setState((s) => ({ pending: Math.max(0, s.pending - 1), lastError: message }))
}
