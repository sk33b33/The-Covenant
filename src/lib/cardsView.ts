/**
 * Grid or list, for any screen that lays out a set of cards.
 *
 * One stored preference shared by the collection and the deck builder,
 * rather than one per screen, so picking list once means list everywhere —
 * the same choice, not two switches a player has to remember to flip twice.
 */

export type ViewMode = 'grid' | 'list'

const VIEW_KEY = 'covenant:cardsView'

/** The stored choice, same read-it-once-then-trust-state pattern `theme.ts`
 *  already uses — storage can throw (private mode, quota), and this is a
 *  display preference, not state worth crashing a screen over. */
export function loadCardsView(): ViewMode {
  try {
    const saved = localStorage.getItem(VIEW_KEY)
    if (saved === 'grid' || saved === 'list') return saved
  } catch {
    /* storage denied; default below still renders */
  }
  return 'grid'
}

export function saveCardsView(mode: ViewMode): void {
  try {
    localStorage.setItem(VIEW_KEY, mode)
  } catch {
    /* not worth surfacing — the toggle still works for this session */
  }
}
