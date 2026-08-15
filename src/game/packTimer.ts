import { ECONOMY } from './config'

/**
 * Free pack slot regeneration.
 *
 * Two slots, each refilling over 12 hours. The app cannot rely on being open
 * while they refill, so nothing counts down in memory — we store when the
 * current slot started charging and derive everything from the wall clock on
 * read. Closing the app for a day and reopening it yields both packs, exactly
 * as if it had been running the whole time.
 *
 * Kept pure and separate from the store so the timer logic is testable against
 * a mocked clock.
 */

export interface SlotState {
  /** Slots ready to open, 0..PACK_SLOTS. */
  slots: number
  /**
   * When the slot currently charging began. Null when slots are full — a full
   * pouch does not accrue progress, so time spent full is never banked.
   */
  chargeStartedAt: number | null
}

export interface ResolvedSlots extends SlotState {
  /** Milliseconds until the next slot completes; 0 when already full. */
  msUntilNext: number
  isFull: boolean
}

/**
 * Brings a stored slot state up to date with `now`, awarding any slots that
 * finished charging while the app was closed.
 */
export function resolveSlots(state: SlotState, now: number): ResolvedSlots {
  let { slots, chargeStartedAt } = state

  if (slots >= ECONOMY.PACK_SLOTS) {
    return { slots: ECONOMY.PACK_SLOTS, chargeStartedAt: null, msUntilNext: 0, isFull: true }
  }

  if (chargeStartedAt === null) {
    // Not full but not charging — start the clock now. Happens on a fresh save
    // and after a clock change moves time backwards.
    chargeStartedAt = now
  }

  const elapsed = Math.max(0, now - chargeStartedAt)
  const completed = Math.floor(elapsed / ECONOMY.SLOT_REFILL_MS)

  if (completed > 0) {
    const awarded = Math.min(completed, ECONOMY.PACK_SLOTS - slots)
    slots += awarded

    if (slots >= ECONOMY.PACK_SLOTS) {
      return { slots: ECONOMY.PACK_SLOTS, chargeStartedAt: null, msUntilNext: 0, isFull: true }
    }

    // Carry the remainder forward so no partial progress is lost.
    chargeStartedAt += awarded * ECONOMY.SLOT_REFILL_MS
  }

  const intoCurrent = now - chargeStartedAt
  return {
    slots,
    chargeStartedAt,
    msUntilNext: Math.max(0, ECONOMY.SLOT_REFILL_MS - intoCurrent),
    isFull: false,
  }
}

/**
 * Spends one slot. A pouch that was full has not been accruing, so spending
 * from full starts the clock at that moment.
 */
export function spendSlot(state: ResolvedSlots, now: number): SlotState {
  if (state.slots <= 0) return { slots: state.slots, chargeStartedAt: state.chargeStartedAt }

  const slots = state.slots - 1
  return {
    slots,
    chargeStartedAt: state.chargeStartedAt ?? now,
  }
}

/** Grants a slot outright, as Grace does. Never exceeds the cap. */
export function grantSlot(state: ResolvedSlots): SlotState {
  const slots = Math.min(ECONOMY.PACK_SLOTS, state.slots + 1)
  return {
    slots,
    chargeStartedAt: slots >= ECONOMY.PACK_SLOTS ? null : state.chargeStartedAt,
  }
}

/** "04 hr 19 min" / "12 min" / "48 sec" — matches the reference UI's phrasing. */
export function formatCountdown(ms: number): string {
  if (ms <= 0) return 'Ready'

  const totalSeconds = Math.ceil(ms / 1000)
  const hours = Math.floor(totalSeconds / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const seconds = totalSeconds % 60

  if (hours > 0) return `${String(hours).padStart(2, '0')} hr ${String(minutes).padStart(2, '0')} min`
  if (minutes > 0) return `${minutes} min`
  return `${seconds} sec`
}
