/**
 * Dark or light, and nothing in between.
 *
 * There used to be a third option that followed the phone, which meant that on
 * first run neither Dark nor Light appeared chosen — the control showed a
 * preference rather than a state. Now the app resolves the phone's preference
 * exactly once, pins it, and the switch always reads as one or the other.
 *
 * This lives in `lib` rather than in the Menu screen because `main.tsx` has to
 * apply the theme before the first paint, and importing that from a screen
 * pulled the whole Menu module — the card list, the game config, several
 * stores — into the critical path for the sake of three lines.
 */

export type Theme = 'dark' | 'light'

const KEY = 'covenant:theme'

/**
 * The stored choice, or the phone's preference the first time round.
 *
 * A returning player who had chosen 'system' lands here too: their old value is
 * not a theme any more, so it resolves from the media query exactly as a new
 * player's absent value does. The app still opens in the mode the phone
 * suggests — it just stops tracking it afterwards.
 */
export function resolveTheme(): Theme {
  try {
    const saved = localStorage.getItem(KEY)
    if (saved === 'dark' || saved === 'light') return saved
  } catch {
    /* storage denied; the media query still gives us an answer */
  }

  return prefersDark() ? 'dark' : 'light'
}

export function applyTheme(theme: Theme): void {
  // Always stamped, so the explicit [data-theme] rules in tokens.css always
  // win. The prefers-color-scheme block is left as the fallback for the single
  // frame before this runs.
  document.documentElement.setAttribute('data-theme', theme)

  try {
    localStorage.setItem(KEY, theme)
  } catch {
    /* the choice still applies for this session */
  }
}

/** Called from main.tsx before the first paint, so a choice never flashes. */
export function applySavedTheme(): void {
  applyTheme(resolveTheme())
}

function prefersDark(): boolean {
  try {
    return window.matchMedia('(prefers-color-scheme: dark)').matches
  } catch {
    // The card art is dark and warm, so dark is the better guess when asking
    // is not possible.
    return true
  }
}
