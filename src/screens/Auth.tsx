import { useState, type FormEvent } from 'react'
import { BackIcon } from '@/art/icons'
import { Button, Panel, TextField } from '@/components/ui'
import { useAuth } from '@/store/auth'
import { useNav } from '@/store/nav'

/**
 * Linking an account — reached from Menu, never a gate in front of play.
 * Everything this screen does layers on top of the local save `persist.ts`
 * already keeps; dismissing it with Back leaves a guest exactly as playable
 * as before.
 */
export function Auth() {
  const back = useNav((s) => s.back)
  const busy = useAuth((s) => s.busy)
  const error = useAuth((s) => s.error)
  const signUp = useAuth((s) => s.signUp)
  const signInWithPassword = useAuth((s) => s.signInWithPassword)
  const clearError = useAuth((s) => s.clearError)

  const [mode, setMode] = useState<'sign-in' | 'sign-up'>('sign-in')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  // Set only once sign-up succeeds without also granting an active session —
  // a project with email confirmation on won't sign the new account in until
  // that link is followed, and saying nothing would read as a silent failure.
  const [confirmPending, setConfirmPending] = useState(false)

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setConfirmPending(false)

    if (mode === 'sign-in') {
      if (await signInWithPassword(email, password)) back()
      return
    }

    if (!(await signUp(email, password))) return
    if (useAuth.getState().session) {
      back()
    } else {
      setConfirmPending(true)
      setMode('sign-in')
    }
  }

  const switchMode = () => {
    clearError()
    setConfirmPending(false)
    setMode(mode === 'sign-in' ? 'sign-up' : 'sign-in')
  }

  return (
    <div className="scroll-y h-full">
      <div className="mx-auto max-w-app px-4 pt-safe pb-tabbar">
        <div className="flex items-center gap-3 pt-2">
          <button
            onClick={back}
            className="neu w-10 h-10 rounded-pill grid place-items-center text-ink-muted shrink-0"
            aria-label="Back"
          >
            <BackIcon size={20} />
          </button>
          <h1 className="font-display text-lg tracking-wide">
            {mode === 'sign-in' ? 'Sign In' : 'Create Account'}
          </h1>
        </div>

        <Panel className="mt-4 p-5">
          <p className="text-xs text-ink-muted leading-relaxed mb-4">
            Linking an account carries your level, collection, decks,
            currencies and story progress to any device you sign in on.
            Playing without one works exactly as it does today — everything
            just stays on this device.
          </p>

          <form onSubmit={submit} className="space-y-3">
            <TextField
              label="Email"
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
            <TextField
              label="Password"
              type="password"
              autoComplete={mode === 'sign-in' ? 'current-password' : 'new-password'}
              required
              minLength={6}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />

            {confirmPending && (
              <p className="text-xs" style={{ color: 'var(--gold-deep)' }}>
                Account created — check your email to confirm it, then sign in.
              </p>
            )}
            {error && (
              <p className="text-xs" style={{ color: 'var(--negative)' }}>
                {error}
              </p>
            )}

            <Button type="submit" variant="gold" block disabled={busy}>
              {busy ? 'Please wait…' : mode === 'sign-in' ? 'Sign In' : 'Create Account'}
            </Button>
          </form>

          <button onClick={switchMode} className="w-full text-center text-xs text-ink-muted mt-4">
            {mode === 'sign-in' ? 'New here? Create an account' : 'Already have an account? Sign in'}
          </button>
        </Panel>
      </div>
    </div>
  )
}
