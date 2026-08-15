import { describe, expect, it } from 'vitest'
import { ECONOMY } from '../config'
import { formatCountdown, grantSlot, resolveSlots, spendSlot } from '../packTimer'

const HOUR = 60 * 60 * 1000
const REFILL = ECONOMY.SLOT_REFILL_MS
const T0 = 1_700_000_000_000

describe('resolveSlots', () => {
  it('reports a full pouch as full and not charging', () => {
    const r = resolveSlots({ slots: ECONOMY.PACK_SLOTS, chargeStartedAt: null }, T0)
    expect(r.isFull).toBe(true)
    expect(r.msUntilNext).toBe(0)
    expect(r.chargeStartedAt).toBeNull()
  })

  it('starts the clock when a non-full pouch has none running', () => {
    const r = resolveSlots({ slots: 0, chargeStartedAt: null }, T0)
    expect(r.chargeStartedAt).toBe(T0)
    expect(r.msUntilNext).toBe(REFILL)
  })

  it('counts down without awarding a slot early', () => {
    const r = resolveSlots({ slots: 0, chargeStartedAt: T0 }, T0 + 4 * HOUR)
    expect(r.slots).toBe(0)
    expect(r.msUntilNext).toBe(REFILL - 4 * HOUR)
  })

  it('awards a slot exactly on the boundary', () => {
    const r = resolveSlots({ slots: 0, chargeStartedAt: T0 }, T0 + REFILL)
    expect(r.slots).toBe(1)
  })

  it('awards both slots after a full day away', () => {
    const r = resolveSlots({ slots: 0, chargeStartedAt: T0 }, T0 + 24 * HOUR)
    expect(r.slots).toBe(ECONOMY.PACK_SLOTS)
    expect(r.isFull).toBe(true)
  })

  it('never exceeds the cap, however long the app was closed', () => {
    const r = resolveSlots({ slots: 0, chargeStartedAt: T0 }, T0 + 30 * 24 * HOUR)
    expect(r.slots).toBe(ECONOMY.PACK_SLOTS)
  })

  it('carries partial progress forward rather than discarding it', () => {
    // 13 hours: one slot completes, one hour of the next is already banked.
    const r = resolveSlots({ slots: 0, chargeStartedAt: T0 }, T0 + REFILL + HOUR)
    expect(r.slots).toBe(1)
    expect(r.msUntilNext).toBe(REFILL - HOUR)
  })

  it('recovers if the device clock moves backwards', () => {
    const r = resolveSlots({ slots: 0, chargeStartedAt: T0 }, T0 - 5 * HOUR)
    expect(r.slots).toBe(0)
    expect(r.msUntilNext).toBeLessThanOrEqual(REFILL)
  })
})

describe('spendSlot', () => {
  it('starts the clock when spending from a full pouch', () => {
    const full = resolveSlots({ slots: ECONOMY.PACK_SLOTS, chargeStartedAt: null }, T0)
    const after = spendSlot(full, T0)

    expect(after.slots).toBe(ECONOMY.PACK_SLOTS - 1)
    expect(after.chargeStartedAt).toBe(T0)
  })

  it('does not disturb an already-running clock', () => {
    const partial = resolveSlots({ slots: 1, chargeStartedAt: T0 }, T0 + HOUR)
    const after = spendSlot(partial, T0 + HOUR)

    expect(after.slots).toBe(0)
    expect(after.chargeStartedAt).toBe(T0)
  })

  it('refuses to go negative', () => {
    const empty = resolveSlots({ slots: 0, chargeStartedAt: T0 }, T0)
    expect(spendSlot(empty, T0).slots).toBe(0)
  })

  it('does not bank time spent sitting at full', () => {
    // Full for a week, then spend one. The next slot must take a full refill,
    // not arrive instantly on the strength of the idle week.
    const idle = resolveSlots({ slots: ECONOMY.PACK_SLOTS, chargeStartedAt: null }, T0 + 7 * 24 * HOUR)
    const after = spendSlot(idle, T0 + 7 * 24 * HOUR)
    const later = resolveSlots(after, T0 + 7 * 24 * HOUR)

    expect(later.slots).toBe(ECONOMY.PACK_SLOTS - 1)
    expect(later.msUntilNext).toBe(REFILL)
  })
})

describe('grantSlot', () => {
  it('adds a slot and clears the clock once full', () => {
    const one = resolveSlots({ slots: ECONOMY.PACK_SLOTS - 1, chargeStartedAt: T0 }, T0)
    const after = grantSlot(one)

    expect(after.slots).toBe(ECONOMY.PACK_SLOTS)
    expect(after.chargeStartedAt).toBeNull()
  })

  it('never exceeds the cap', () => {
    const full = resolveSlots({ slots: ECONOMY.PACK_SLOTS, chargeStartedAt: null }, T0)
    expect(grantSlot(full).slots).toBe(ECONOMY.PACK_SLOTS)
  })
})

describe('formatCountdown', () => {
  it('reads as ready at or below zero', () => {
    expect(formatCountdown(0)).toBe('Ready')
    expect(formatCountdown(-1)).toBe('Ready')
  })

  it('pads hours and minutes, matching the reference phrasing', () => {
    expect(formatCountdown(4 * HOUR + 19 * 60 * 1000)).toBe('04 hr 19 min')
  })

  it('drops to minutes, then seconds', () => {
    expect(formatCountdown(12 * 60 * 1000)).toBe('12 min')
    expect(formatCountdown(48 * 1000)).toBe('48 sec')
  })
})
