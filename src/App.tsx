import { useEffect } from 'react'
import { ThemeToggle } from '@/components/ThemeToggle'
import { Button } from '@/components/ui/button'
import { ReconnectBanner } from '@/features/auth/ReconnectBanner'
import { SignInGate } from '@/features/auth/SignInGate'
import { useTokenExpiry } from '@/features/auth/useTokenExpiry'
import { useAppDispatch, useAppSelector } from '@/store/hooks'
import { loadAll } from '@/store/libraryThunks'
import { booksSelectors, selectOpenLoanByBookId } from '@/store/selectors'
import { signOut } from '@/store/sessionSlice'

function AppShell() {
  const dispatch = useAppDispatch()
  const email = useAppSelector((s) => s.session.email)
  const sessionStatus = useAppSelector((s) => s.session.status)
  const library = useAppSelector((s) => s.library)
  const bookCount = useAppSelector(booksSelectors.selectTotal)
  const lentOut = useAppSelector((s) => selectOpenLoanByBookId(s).size)

  // Load on sign-in, and again after a reconnect (AGENTS.md > Data flow)
  useEffect(() => {
    if (sessionStatus === 'signedIn') void dispatch(loadAll())
  }, [sessionStatus, dispatch])

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
        {library.status === 'loading' && <p className="text-muted-foreground">Loading your library…</p>}
        {library.status === 'error' && (
          <p role="alert" className="text-destructive">
            {library.error}
          </p>
        )}
        {library.status === 'ready' && (
          <p>
            <span className="font-mono">{bookCount}</span> books ·{' '}
            <span className="font-mono">{lentOut}</span> currently lent out
          </p>
        )}
        <p className="mt-2 text-sm text-muted-foreground">The book list comes next.</p>
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
