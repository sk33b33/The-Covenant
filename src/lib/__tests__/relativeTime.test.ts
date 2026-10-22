import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { formatRelativeTime } from '../relativeTime'

const NOW = Date.parse('2026-01-01T00:00:00.000Z')

describe('formatRelativeTime', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(NOW)
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('reads "just now" under 10 seconds', () => {
    expect(formatRelativeTime(NOW)).toBe('just now')
    expect(formatRelativeTime(NOW - 9_000)).toBe('just now')
  })

  it('counts seconds from 10s up to a minute', () => {
    expect(formatRelativeTime(NOW - 10_000)).toBe('10s ago')
    expect(formatRelativeTime(NOW - 59_000)).toBe('59s ago')
  })

  it('counts minutes from a minute up to an hour', () => {
    expect(formatRelativeTime(NOW - 60_000)).toBe('1m ago')
    expect(formatRelativeTime(NOW - 59 * 60_000)).toBe('59m ago')
  })

  it('counts hours from an hour up to a day', () => {
    expect(formatRelativeTime(NOW - 60 * 60_000)).toBe('1h ago')
    expect(formatRelativeTime(NOW - 23 * 60 * 60_000)).toBe('23h ago')
  })

  it('counts whole days from a day onward', () => {
    expect(formatRelativeTime(NOW - 24 * 60 * 60_000)).toBe('1d ago')
    expect(formatRelativeTime(NOW - 9 * 24 * 60 * 60_000)).toBe('9d ago')
  })

  it('clamps a future timestamp to "just now" rather than going negative', () => {
    expect(formatRelativeTime(NOW + 5_000)).toBe('just now')
  })
})
