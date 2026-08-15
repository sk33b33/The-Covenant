/**
 * Seeded pseudo-random number generation.
 *
 * The whole game — pack pulls, coin flips, shuffles, the AI's choices — runs
 * through this rather than `Math.random`. That buys three things: a match can
 * be replayed exactly from its seed, the test suite can assert on specific
 * outcomes instead of statistics, and the rules engine stays a pure function of
 * (state, action, seed).
 *
 * mulberry32: 32-bit state, one multiply-xor-shift round. Fast, and its
 * distribution is far better than the `sin`-based one-liners commonly used for
 * this job.
 */

export interface Rng {
  /** Float in [0, 1). */
  next: () => number
  /** Integer in [0, max). */
  int: (max: number) => number
  /** True with the given probability. */
  chance: (p: number) => boolean
  /** A uniformly chosen element. Throws on an empty list. */
  pick: <T>(items: readonly T[]) => T
  /** A new array, shuffled. Does not mutate the input. */
  shuffle: <T>(items: readonly T[]) => T[]
  /** The current internal state, for persisting mid-match. */
  state: () => number
}

export function createRng(seed: number): Rng {
  let a = seed >>> 0

  const next = () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }

  const int = (max: number) => Math.floor(next() * max)

  return {
    next,
    int,
    chance: (p) => next() < p,

    pick: (items) => {
      if (items.length === 0) throw new Error('pick() called on an empty list')
      return items[int(items.length)]!
    },

    shuffle: (items) => {
      // Fisher-Yates, walked backwards so every permutation is equally likely.
      const out = [...items]
      for (let i = out.length - 1; i > 0; i--) {
        const j = int(i + 1)
        ;[out[i], out[j]] = [out[j]!, out[i]!]
      }
      return out
    },

    state: () => a,
  }
}

/** A seed for a fresh, non-reproducible run. */
export const randomSeed = (): number => (Math.random() * 0xffffffff) >>> 0

/**
 * Picks one entry from a weight table. Weights need not sum to 1.
 * Throws rather than silently returning the last key, since a zero-weight
 * table is always a data bug.
 */
export function weightedPick<K extends string>(rng: Rng, weights: Record<K, number>): K {
  const entries = Object.entries(weights) as [K, number][]
  const total = entries.reduce((sum, [, w]) => sum + w, 0)
  if (total <= 0) throw new Error('weightedPick() called with no positive weights')

  let roll = rng.next() * total
  for (const [key, weight] of entries) {
    roll -= weight
    if (roll < 0) return key
  }

  return entries[entries.length - 1]![0]
}
