import { useState, type FormEvent } from 'react'
import { Button, Panel, TextField } from '@/components/ui'
import { PORTAL_URL } from '@/lib/portalApi'
import { useAuth } from '@/store/auth'

/**
 * The sign-in gate — rendered by `App.tsx` in place of the entire app
 * until `useAuth`'s `signedIn` is true. No Back button: there is nowhere
 * to go back to, since there's no guest play behind this screen any more.
 *
 * Sign-in only, on purpose — there is no "Create Account" here at all.
 * Registration only ever happens on the portal website; this screen's one
 * job is checking an existing account's password against it.
 */
export function Auth() {
  const busy = useAuth((s) => s.busy)
  const error = useAuth((s) => s.error)
  const signInWithPassword = useAuth((s) => s.signInWithPassword)

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    await signInWithPassword(email, password)
  }

  const registerUrl = PORTAL_URL ? `${PORTAL_URL}/register` : undefined
  const forgotPasswordUrl = PORTAL_URL ? `${PORTAL_URL}/forgot-password` : undefined

  return (
    <div className="scroll-y h-full flex items-center justify-center px-4 pt-safe pb-safe">
      <div className="w-full max-w-app">
        <div className="text-center pb-4">
          <h1 className="font-display text-xl tracking-wide">Sign In</h1>
        </div>

        <Panel className="p-5">
          <p className="text-xs text-ink-muted leading-relaxed mb-4">
            Sign in with your Covenant TCG Portal account to play — accounts
            are created on the website, not here.
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
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />

            {error && (
              <p className="text-xs" style={{ color: 'var(--negative)' }}>
                {error}
              </p>
            )}

            <Button type="submit" variant="gold" block disabled={busy}>
              {busy ? 'Signing in…' : 'Sign In'}
            </Button>
          </form>

          <div className="flex flex-col items-center gap-2 mt-4">
            {registerUrl && (
              <a href={registerUrl} target="_blank" rel="noreferrer" className="text-xs text-ink-muted">
                Don't have an account? Register on the website
              </a>
            )}
            {forgotPasswordUrl && (
              <a href={forgotPasswordUrl} target="_blank" rel="noreferrer" className="text-xs text-ink-faint">
                Forgot your password?
              </a>
            )}
          </div>
        </Panel>
      </div>
    </div>
  )
}
