import { create } from 'zustand'
import { ECONOMY, STARTING_GRACE, STARTING_TALENTS } from '@/game/config'
import { grantSlot, resolveSlots, spendSlot, type SlotState } from '@/game/packTimer'
import { load, save } from './persist'

export interface EconomyState extends SlotState {
  talents: number
  grace: number
  /** Packs opened since the last Rare or better, for the pity rule. */
  sincePity: number
}

const initial: EconomyState = {
  talents: STARTING_TALENTS,
  grace: STARTING_GRACE,
  slots: ECONOMY.PACK_SLOTS,
  chargeStartedAt: null,
  sincePity: 0,
}

interface EconomyStore extends EconomyState {
  /** Recomputes slot regeneration against the wall clock. Safe to call often. */
  tick: () => void

  /** Consumes a free slot. Returns false if none are ready. */
  useFreeSlot: () => boolean
  /** Buys a pack with Talents. Returns false if the purse is short. */
  buyWithTalents: () => boolean
  /** Spends Grace to refill a slot. Returns false if short or already full. */
  refillWithGrace: () => boolean

  addTalents: (amount: number) => void
  addGrace: (amount: number) => void

  /** Records a pack opening for the pity counter. */
  notePull: (hitRareOrBetter: boolean) => void
}

const snapshot = (s: EconomyStore): EconomyState => ({
  talents: s.talents,
  grace: s.grace,
  slots: s.slots,
  chargeStartedAt: s.chargeStartedAt,
  sincePity: s.sincePity,
})

export const useEconomy = create<EconomyStore>((set, get) => {
  const persist = () => save('economy', snapshot(get()))

  return {
    ...load('economy', initial),

    tick: () => {
      const now = Date.now()
      const before = get()
      const resolved = resolveSlots(before, now)

      if (resolved.slots === before.slots && resolved.chargeStartedAt === before.chargeStartedAt) {
        return
      }

      set({ slots: resolved.slots, chargeStartedAt: resolved.chargeStartedAt })
      persist()
    },

    useFreeSlot: () => {
      const now = Date.now()
      const resolved = resolveSlots(get(), now)
      if (resolved.slots <= 0) return false

      set(spendSlot(resolved, now))
      persist()
      return true
    },

    buyWithTalents: () => {
      const { talents } = get()
      if (talents < ECONOMY.TALENTS_PER_PACK) return false

      set({ talents: talents - ECONOMY.TALENTS_PER_PACK })
      persist()
      return true
    },

    refillWithGrace: () => {
      const now = Date.now()
      const resolved = resolveSlots(get(), now)
      if (resolved.isFull) return false
      if (get().grace < ECONOMY.GRACE_PER_SLOT) return false

      set({ ...grantSlot(resolved), grace: get().grace - ECONOMY.GRACE_PER_SLOT })
      persist()
      return true
    },

    addTalents: (amount) => {
      set((s) => ({ talents: Math.max(0, s.talents + amount) }))
      persist()
    },

    addGrace: (amount) => {
      set((s) => ({ grace: Math.max(0, s.grace + amount) }))
      persist()
    },

    notePull: (hitRareOrBetter) => {
      set((s) => ({ sincePity: hitRareOrBetter ? 0 : s.sincePity + 1 }))
      persist()
    },
  }
})

/** Live slot view for the UI, recomputed against the clock on every read. */
export const selectSlots = (s: EconomyState) => resolveSlots(s, Date.now())
