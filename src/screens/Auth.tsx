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
  const signInWithGoogle = useAuth((s) => s.signInWithGoogle)
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

          <div className="flex items-center gap-3 my-4">
            <span className="h-px flex-1" style={{ background: 'var(--bg-sunk)' }} />
            <span className="text-[11px] text-ink-faint">OR</span>
            <span className="h-px flex-1" style={{ background: 'var(--bg-sunk)' }} />
          </div>

          <Button
            variant="raised"
            block
            className="flex items-center justify-center gap-2.5"
            onClick={signInWithGoogle}
            disabled={busy}
          >
            <GoogleMark size={18} />
            Continue with Google
          </Button>
        </Panel>
      </div>
    </div>
  )
}

/** Google's own four-colour "G" — a fixed brand mark, never recoloured to
 *  match a theme the way this app's own single-tone icons are, so it lives
 *  here rather than among `art/icons.tsx`'s `currentColor` set. */
function GoogleMark({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" aria-hidden="true">
      <path
        fill="#EA4335"
        d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"
      />
      <path
        fill="#4285F4"
        d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.9-2.26 5.36-4.78 7.18l7.73 6c4.51-4.16 7.09-10.29 7.09-17.65z"
      />
      <path
        fill="#FBBC05"
        d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24s.92 7.54 2.56 10.78l7.97-6.19z"
      />
      <path
        fill="#34A853"
        d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"
      />
    </svg>
  )
}
