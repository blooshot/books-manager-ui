import { ThemeToggle } from '@/components/ThemeToggle'
import { Button } from '@/components/ui/button'
import { ReconnectBanner } from '@/features/auth/ReconnectBanner'
import { SignInGate } from '@/features/auth/SignInGate'
import { useTokenExpiry } from '@/features/auth/useTokenExpiry'
import { useAppDispatch, useAppSelector } from '@/store/hooks'
import { signOut } from '@/store/sessionSlice'

function AppShell() {
  const dispatch = useAppDispatch()
  const email = useAppSelector((s) => s.session.email)

  return (
    <div className="min-h-dvh">
      <ReconnectBanner />
      <header className="flex items-center justify-between gap-2 border-b bg-card px-4 py-3">
        <h1 className="font-display text-lg font-bold">My Library</h1>
        <div className="flex items-center gap-2">
          {email && <span className="hidden font-mono text-xs text-muted-foreground sm:inline">{email}</span>}
          <ThemeToggle />
          <Button variant="outline" size="sm" onClick={() => dispatch(signOut())}>
            Sign out
          </Button>
        </div>
      </header>
      <main className="mx-auto max-w-5xl p-4">
        <p className="text-muted-foreground">Signed in. The book list comes next.</p>
      </main>
    </div>
  )
}

export default function App() {
  useTokenExpiry()
  const status = useAppSelector((s) => s.session.status)
  // 'expired' keeps the shell on screen (with the banner) so nothing in progress is lost.
  return status === 'signedIn' || status === 'expired' ? <AppShell /> : <SignInGate />
}
