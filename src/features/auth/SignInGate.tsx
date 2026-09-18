import { BookOpen } from 'lucide-react'
import { useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { missingConfig } from '@/lib/config'
import { loadGis } from '@/services/google/gis'
import { useAppDispatch, useAppSelector } from '@/store/hooks'
import { forgetEmail, signIn } from '@/store/sessionSlice'

export function SignInGate() {
  const dispatch = useAppDispatch()
  const { status, email, error } = useAppSelector((s) => s.session)
  const missing = missingConfig()
  const busy = status === 'signingIn'

  // Load Google's sign-in script while the page is idle, so the click that starts sign-in can open the popup at once.
  // If the script had to load *after* the click, browsers (Safari especially) may block the popup as not user-initiated.
  useEffect(() => {
    void loadGis().catch(() => undefined) // a failure is reported when the user actually tries to sign in
  }, [])

  return (
    <main className="mx-auto flex min-h-dvh max-w-sm flex-col items-center justify-center gap-6 px-4 text-center">
      <BookOpen className="size-10 text-primary" aria-hidden />
      <div className="space-y-1">
        <h1 className="font-display text-2xl font-bold">My Library</h1>
        <p className="text-muted-foreground">Sign in with Google to open your book collection.</p>
      </div>

      {missing.length > 0 ? (
        <p role="alert" className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm">
          Missing configuration: <span className="font-mono">{missing.join(', ')}</span>. Copy{' '}
          <span className="font-mono">.env.example</span> to <span className="font-mono">.env.local</span>.
        </p>
      ) : (
        <div className="flex w-full flex-col gap-2">
          <Button size="lg" disabled={busy} onClick={() => dispatch(signIn())}>
            {busy ? 'Signing in…' : email ? `Continue as ${email}` : 'Sign in with Google'}
          </Button>
          {email && (
            <Button variant="ghost" size="sm" disabled={busy} onClick={() => dispatch(forgetEmail())}>
              Use a different account
            </Button>
          )}
        </div>
      )}

      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
    </main>
  )
}
