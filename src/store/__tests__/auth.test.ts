// @vitest-environment jsdom
//
// `auth.ts` uses `window.setTimeout`/`window.clearTimeout` directly (it's a
// browser-only module, same as every other store), so this needs a DOM
// global even though nothing here renders anything.
import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/portalApi', () => ({
  hasValidToken: vi.fn(() => false),
  currentEmail: vi.fn(() => null),
  pullState: vi.fn(async () => null),
  login: vi.fn(async () => ({ ok: true as const })),
  logout: vi.fn(async () => {}),
  setOnUnauthorized: vi.fn(),
  pushState: vi.fn(),
}))

/**
 * `auth.ts` fires a fire-and-forget hydration pull from top-level module
 * code the moment it's imported (see the module's own comment on why — a
 * device that stayed signed in across launches never calls
 * `signInWithPassword` again, so that's the only place left to catch up
 * from another device). Each test needs a fresh module instance to see a
 * different `hasValidToken()` answer at that import moment, hence
 * `resetModules` + a dynamic `import()` per test rather than one static
 * import up top.
 */
async function loadAuth() {
  vi.resetModules()
  const portalApi = await import('@/lib/portalApi')
  const auth = await import('../auth')
  return { portalApi, auth }
}

describe('auth hydration race (waitForHydration)', () => {
  afterEach(() => {
    vi.clearAllMocks()
  })

  it('resolves immediately when signed out — nothing to pull', async () => {
    const { portalApi, auth } = await loadAuth()
    vi.mocked(portalApi.hasValidToken).mockReturnValue(false)

    await expect(auth.waitForHydration(50)).resolves.toBeUndefined()
  })

  it('waits for the launch-time pull before resolving when already signed in', async () => {
    const { portalApi } = await loadAuth()
    vi.mocked(portalApi.hasValidToken).mockReturnValue(true)

    let settlePull!: () => void
    vi.mocked(portalApi.pullState).mockReturnValue(
      new Promise((resolve) => {
        settlePull = () => resolve(null)
      }),
    )

    // Re-import with the token already "valid" so the module's own launch-time
    // `hydrateFromPortal()` call picks up the pending pull above.
    vi.resetModules()
    const reloaded = await import('../auth')

    let resolved = false
    const waiting = reloaded.waitForHydration(5000).then(() => {
      resolved = true
    })

    await Promise.resolve()
    expect(resolved).toBe(false)

    settlePull()
    await waiting
    expect(resolved).toBe(true)
  })

  it('gives up after its own timeout rather than waiting forever', async () => {
    vi.useFakeTimers()
    try {
      const { portalApi } = await loadAuth()
      vi.mocked(portalApi.hasValidToken).mockReturnValue(true)
      vi.mocked(portalApi.pullState).mockReturnValue(new Promise(() => {})) // never settles

      vi.resetModules()
      const reloaded = await import('../auth')

      let resolved = false
      void reloaded.waitForHydration(2500).then(() => {
        resolved = true
      })

      await vi.advanceTimersByTimeAsync(2499)
      expect(resolved).toBe(false)
      await vi.advanceTimersByTimeAsync(2)
      expect(resolved).toBe(true)
    } finally {
      vi.useRealTimers()
    }
  })
})

describe('sign-in hydration reset', () => {
  afterEach(() => {
    vi.clearAllMocks()
  })

  it('resets a store a brand-new account save has nothing for, rather than keeping local leftovers', async () => {
    const { portalApi, auth } = await loadAuth()
    const { useMatchHistory } = await import('../matchHistory')

    // Local leftovers from whoever used this device before.
    useMatchHistory.getState().record({
      won: true,
      opponentName: 'Wanderer',
      yourPoints: 3,
      opponentPoints: 0,
      endReason: 'points',
    })
    expect(useMatchHistory.getState().entries).toHaveLength(1)

    // A brand-new account's first-ever sign-in: the portal knows the
    // account exists (`ok: true`) but its save is empty.
    vi.mocked(portalApi.login).mockResolvedValue({ ok: true })
    vi.mocked(portalApi.pullState).mockResolvedValue({})

    await auth.useAuth.getState().signInWithPassword('new@example.com', 'pw')

    expect(useMatchHistory.getState().entries).toEqual([])
  })

  it('leaves local state alone when the pull itself fails (offline), rather than guessing it away', async () => {
    const { portalApi, auth } = await loadAuth()
    const { useMatchHistory } = await import('../matchHistory')

    useMatchHistory.getState().record({
      won: true,
      opponentName: 'Wanderer',
      yourPoints: 3,
      opponentPoints: 0,
      endReason: 'points',
    })

    vi.mocked(portalApi.login).mockResolvedValue({ ok: true })
    vi.mocked(portalApi.pullState).mockResolvedValue(null)

    await auth.useAuth.getState().signInWithPassword('existing@example.com', 'pw')

    expect(useMatchHistory.getState().entries).toHaveLength(1)
  })
})
