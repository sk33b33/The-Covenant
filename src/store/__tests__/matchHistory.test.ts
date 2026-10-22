import { beforeEach, describe, expect, it } from 'vitest'
import { useMatchHistory } from '../matchHistory'

const baseEntry = {
  won: true,
  opponentName: 'Wanderer',
  yourPoints: 3,
  opponentPoints: 1,
  endReason: 'points' as const,
}

describe('matchHistory store', () => {
  beforeEach(() => {
    useMatchHistory.setState({ entries: [] })
  })

  it('records an entry with a generated id and timestamp, newest first', () => {
    useMatchHistory.getState().record(baseEntry)
    useMatchHistory.getState().record({ ...baseEntry, won: false, opponentName: 'Scribe' })

    const { entries } = useMatchHistory.getState()
    expect(entries).toHaveLength(2)
    expect(entries[0]?.opponentName).toBe('Scribe')
    expect(entries[1]?.opponentName).toBe('Wanderer')
    expect(entries[0]?.id).toMatch(/^match-/)
    expect(typeof entries[0]?.playedAt).toBe('number')
  })

  it('caps the list at 50 entries, dropping the oldest', () => {
    for (let i = 0; i < 55; i++) {
      useMatchHistory.getState().record({ ...baseEntry, opponentName: `foe-${i}` })
    }

    const { entries } = useMatchHistory.getState()
    expect(entries).toHaveLength(50)
    // Most recently recorded (foe-54) stays; the first five fall off.
    expect(entries[0]?.opponentName).toBe('foe-54')
    expect(entries.some((e) => e.opponentName === 'foe-0')).toBe(false)
    expect(entries.some((e) => e.opponentName === 'foe-4')).toBe(false)
    expect(entries.some((e) => e.opponentName === 'foe-5')).toBe(true)
  })

  it('clear empties the list', () => {
    useMatchHistory.getState().record(baseEntry)
    useMatchHistory.getState().clear()
    expect(useMatchHistory.getState().entries).toEqual([])
  })

  it('hydrate replaces state wholesale, defaulting missing fields', () => {
    useMatchHistory.getState().record(baseEntry)
    useMatchHistory.getState().hydrate({ entries: [] })
    expect(useMatchHistory.getState().entries).toEqual([])

    useMatchHistory.getState().hydrate({} as never)
    expect(useMatchHistory.getState().entries).toEqual([])
  })
})
