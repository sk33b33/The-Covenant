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
  peek: (
    card: Card,
    options?: { actions?: SheetOption[]; actionsNote?: string; count?: number },
  ) => void
  close: () => void
}

const empty = { card: null, actions: [], actionsNote: undefined, count: undefined }

export const usePeek = create<PeekState>((set) => ({
  ...empty,

  peek: (card, options) =>
    set({
      card,
      actions: options?.actions ?? [],
      actionsNote: options?.actionsNote,
      count: options?.count,
    }),

  close: () => set(empty),
}))
