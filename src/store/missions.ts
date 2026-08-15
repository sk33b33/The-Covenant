import { create } from 'zustand'
import { CARDS } from '@/data/cards'
import { load, save } from './persist'

/**
 * Missions.
 *
 * Progress is derived from counters the rest of the game already keeps —
 * battles played, packs opened, cards collected — rather than from mission-
 * specific bookkeeping sprinkled through every screen. That means a mission can
 * be added or retuned in one file, and no gameplay code has to know missions
 * exist.
 *
 * Dailies reset on the local calendar day. Using the device's own day boundary
 * rather than a fixed UTC hour is the right call for a single-player game with
 * no server: the reset lands overnight wherever the player actually is.
 */

export type MissionScope = 'daily' | 'lifetime'

export interface MissionDefinition {
  id: string
  scope: MissionScope
  title: string
  detail: string
  target: number
  reward: { talents: number; grace?: number }
  /** Which counter this mission reads. */
  metric: MissionMetric
}

export type MissionMetric =
  | 'battlesPlayed'
  | 'battlesWon'
  | 'packsOpened'
  | 'cardsCollected'
  | 'encountersCleared'
  | 'decksBuilt'

export interface MissionProgress {
  battlesPlayed: number
  battlesWon: number
  packsOpened: number
  cardsCollected: number
  encountersCleared: number
  decksBuilt: number
}

export const MISSIONS: MissionDefinition[] = [
  {
    id: 'daily-open',
    scope: 'daily',
    title: 'Open a pack',
    detail: 'Two free slots refill every twelve hours.',
    target: 1,
    metric: 'packsOpened',
    reward: { talents: 40 },
  },
  {
    id: 'daily-battle',
    scope: 'daily',
    title: 'Fight two battles',
    detail: 'Win or lose, both count.',
    target: 2,
    metric: 'battlesPlayed',
    reward: { talents: 60 },
  },
  {
    id: 'daily-win',
    scope: 'daily',
    title: 'Win a battle',
    detail: 'Take three points before your opponent does.',
    target: 1,
    metric: 'battlesWon',
    reward: { talents: 80, grace: 1 },
  },
  {
    id: 'life-collect-30',
    scope: 'lifetime',
    title: 'Collect 30 cards',
    detail: 'Distinct cards in your binder.',
    target: 30,
    metric: 'cardsCollected',
    reward: { talents: 200, grace: 2 },
  },
  {
    id: 'life-collect-60',
    scope: 'lifetime',
    title: 'Collect 60 cards',
    // Derived, so adding a card to the set cannot leave this line lying.
    detail: `The Genesis set runs to ${CARDS.length}.`,
    target: 60,
    metric: 'cardsCollected',
    reward: { talents: 500, grace: 6 },
  },
  {
    id: 'life-genesis',
    scope: 'lifetime',
    title: 'Finish Genesis',
    detail: 'Clear all five encounters.',
    target: 5,
    metric: 'encountersCleared',
    reward: { talents: 600, grace: 6 },
  },
  {
    id: 'life-packs-25',
    scope: 'lifetime',
    title: 'Open 25 packs',
    detail: 'Free slots and bought packs both count.',
    target: 25,
    metric: 'packsOpened',
    reward: { talents: 300, grace: 3 },
  },
  {
    id: 'life-deck',
    scope: 'lifetime',
    title: 'Build a deck',
    detail: 'Twenty cards of your own choosing.',
    target: 1,
    metric: 'decksBuilt',
    reward: { talents: 100 },
  },
]

/** Local calendar day, as YYYY-MM-DD. */
export const today = (now = new Date()): string =>
  `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(
    now.getDate(),
  ).padStart(2, '0')}`

interface MissionsState {
  /** Mission ids already paid out. Dailies are cleared on a new day. */
  claimed: string[]
  /** The day `claimed` and `dailyBase` were last reset. */
  day: string
  /** Counter values at the moment the day rolled over, so dailies measure
   *  progress made today rather than lifetime totals. */
  dailyBase: Partial<MissionProgress>
}

const initial: MissionsState = { claimed: [], day: today(), dailyBase: {} }

interface MissionsStore extends MissionsState {
  /** Rolls the day over if needed. Safe to call on every render. */
  refresh: (progress: MissionProgress) => void
  isClaimed: (missionId: string) => boolean
  claim: (missionId: string) => boolean
  /** Progress toward a mission, already adjusted for the daily baseline. */
  valueFor: (mission: MissionDefinition, progress: MissionProgress) => number
}

export const useMissions = create<MissionsStore>((set, get) => {
  const persist = () =>
    save('missions', { claimed: get().claimed, day: get().day, dailyBase: get().dailyBase })

  return {
    ...load('missions', initial),

    refresh: (progress) => {
      const now = today()
      if (get().day === now) return

      // A new day: drop the daily claims and rebase the daily counters.
      set({
        day: now,
        claimed: get().claimed.filter((id) => {
          const mission = MISSIONS.find((m) => m.id === id)
          return mission?.scope === 'lifetime'
        }),
        dailyBase: { ...progress },
      })
      persist()
    },

    isClaimed: (id) => get().claimed.includes(id),

    claim: (id) => {
      if (get().claimed.includes(id)) return false
      set((s) => ({ claimed: [...s.claimed, id] }))
      persist()
      return true
    },

    valueFor: (mission, progress) => {
      const total = progress[mission.metric]
      if (mission.scope === 'lifetime') return total
      const base = get().dailyBase[mission.metric] ?? 0
      return Math.max(0, total - base)
    },
  }
})
