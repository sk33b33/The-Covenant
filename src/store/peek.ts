import { create } from 'zustand'
import type { SheetOption } from '@/screens/battle/ActionSheet'
import type { Card } from '@/game/types'

/**
 * The card currently being held up to the light.
 *
 * One store rather than local state on every screen. A card is rendered in ten
 * places — the binder, the mat, the hand, the deck builder, pack reveals,
 * story rewards, the battle hub, the social feed — and "hold any card anywhere
 * to look at it" would otherwise mean ten copies of the same `useState`, ten
 * conditional renders of the viewer, and ten chances for one of them to drift.
 *
 * Deliberately not part of the nav stack: this is a transient inspection, not
 * a place. It should not survive a back gesture as a screen, and reopening the
 * app should not restore it.
 */

/** One entry in a swipeable list — a card plus whatever per-card state
 *  (right now, just its owned count) needs to change along with it. */
export interface PeekListItem {
  card: Card
  count?: number
}

interface PeekState {
  card: Card | null
  /** Actions offered beneath the card. Used by the Active Figure on the mat. */
  actions: SheetOption[]
  /**
   * Live state above the actions — remaining HP and attached energy. The
   * printed values on the card are the maximums, which is the wrong number to
   * decide an attack by.
   */
  actionsNote?: string
  /** Copies held, shown in the binder. Undefined where ownership is not the point. */
  count?: number
  /**
   * The sibling cards a swipe pages through, and this card's place among
   * them — set only by a caller that opens a card as part of a browsable
   * list rather than alone (My Cards is the only one today). Everywhere
   * else this stays unset and `step` is a no-op, so the viewer's swipe
   * gesture has nothing to catch and behaves exactly as it always has.
   */
  list?: PeekListItem[]
  index?: number
  /** Fires after a swipe actually moves, once the new card and count are
   *  already showing — My Cards uses this to mark a swiped-to card seen,
   *  the same as tapping it directly already does. */
  onStep?: (item: PeekListItem, index: number) => void
  peek: (
    card: Card,
    options?: {
      actions?: SheetOption[]
      actionsNote?: string
      count?: number
      list?: PeekListItem[]
      index?: number
      onStep?: (item: PeekListItem, index: number) => void
    },
  ) => void
  /** Moves by `delta` within `list` — clamped to its bounds, and a no-op
   *  with no list set at all. */
  step: (delta: number) => void
  close: () => void
}

const empty = {
  card: null,
  actions: [],
  actionsNote: undefined,
  count: undefined,
  list: undefined,
  index: undefined,
  onStep: undefined,
}

export const usePeek = create<PeekState>((set, get) => ({
  ...empty,

  peek: (card, options) =>
    set({
      card,
      actions: options?.actions ?? [],
      actionsNote: options?.actionsNote,
      count: options?.count,
      list: options?.list,
      index: options?.index,
      onStep: options?.onStep,
    }),

  step: (delta) => {
    const { list, index, onStep } = get()
    if (!list || index === undefined) return
    const next = index + delta
    if (next < 0 || next >= list.length) return
    const item = list[next]!
    set({ card: item.card, count: item.count, index: next })
    onStep?.(item, next)
  },

  close: () => set(empty),
}))
