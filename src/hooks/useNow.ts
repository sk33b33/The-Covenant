import { useEffect, useState } from 'react'

/**
 * A clock that ticks on an interval, for countdowns.
 *
 * Also re-reads on tab focus: a phone browser throttles or suspends timers in
 * a backgrounded tab, so a countdown left alone for an hour would otherwise
 * come back an hour stale.
 */
export function useNow(intervalMs = 1000): number {
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), intervalMs)
    const sync = () => setNow(Date.now())

    window.addEventListener('focus', sync)
    document.addEventListener('visibilitychange', sync)

    return () => {
      window.clearInterval(id)
      window.removeEventListener('focus', sync)
      document.removeEventListener('visibilitychange', sync)
    }
  }, [intervalMs])

  return now
}
