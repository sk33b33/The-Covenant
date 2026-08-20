import { useReducedMotion as useSystemReducedMotion } from 'framer-motion'
import { useSettings } from '@/store/settings'

/**
 * Whether motion should be simplified: the OS's own prefers-reduced-motion,
 * or the player's "Simplify effects" switch in Menu → Graphics. Either one is
 * enough — a phone that doesn't report the preference at all still lets the
 * player turn heavy transforms off by hand.
 *
 * Drop-in replacement for framer-motion's own `useReducedMotion`, which only
 * ever sees the OS side of that pair.
 */
export function useReducedMotion(): boolean {
  const system = useSystemReducedMotion()
  const override = useSettings((s) => s.reducedMotion)
  return Boolean(system) || override
}
