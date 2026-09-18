import { Plus } from 'lucide-react'
import { useEffect } from 'react'
import { Link, NavLink, Outlet } from 'react-router'
import { ThemeToggle } from '@/components/ThemeToggle'
import { Button } from '@/components/ui/button'
import { ReconnectBanner } from '@/features/auth/ReconnectBanner'
import { SignOutControl } from '@/features/auth/SignOutControl'
import { NAV_ITEMS } from '@/features/layout/navItems'
import { NoticesHost } from '@/features/layout/NoticesHost'
import { Sidebar } from '@/features/layout/Sidebar'
import { useIsDesktop } from '@/lib/useMediaQuery'
import { cn } from '@/lib/utils'
import { useAppDispatch, useAppSelector } from '@/store/hooks'
import { SyncControl } from '@/features/sync/SyncControl'
import { startSync } from '@/store/outboxThunks'

/** The sidebar is built and tested but hidden: with two destinations the header menu is enough. Flip to show it again. */
const SHOW_SIDEBAR: boolean = false

/** Header and page content share one width so nothing drifts to the edges of a wide monitor. */
const CONTENT_WIDTH = 'mx-auto w-full max-w-6xl'

function HeaderMenu() {
  return (
    <nav aria-label="Main" className="flex items-center gap-1">
      {NAV_ITEMS.map(({ to, label, icon: Icon, end }) => (
        <NavLink
          key={to}
          to={to}
          end={end}
          className="flex items-center gap-2 rounded-md px-3 py-2 text-sm hover:bg-accent aria-[current=page]:bg-accent aria-[current=page]:font-medium aria-[current=page]:text-primary"
        >
          <Icon className="size-4 shrink-0" aria-hidden />
          {label}
        </NavLink>
      ))}
      <Button asChild size="sm" className="ml-2">
        <NavLink to="/books/new">
          <Plus aria-hidden />
          Add book
        </NavLink>
      </Button>
    </nav>
  )
}

function BottomNav() {
  return (
    <nav aria-label="Main" className="fixed inset-x-0 bottom-0 z-40 border-t bg-card">
      <ul className="flex">
        {NAV_ITEMS.map(({ to, label, icon: Icon, end }) => (
          <li key={to} className="flex-1">
            <NavLink to={to} end={end} className="flex flex-col items-center gap-1 py-2 text-xs hover:bg-accent aria-[current=page]:font-medium aria-[current=page]:text-primary">
              <Icon className="size-5" aria-hidden />
              {label}
            </NavLink>
          </li>
        ))}
      </ul>
    </nav>
  )
}

export function AppLayout() {
  const dispatch = useAppDispatch()
  const isDesktop = useIsDesktop()
  const sessionStatus = useAppSelector((s) => s.session.status)
  const email = useAppSelector((s) => s.session.email)

  // On sign-in, and again after a reconnect: send anything waiting in the outbox, then load (AGENTS.md > Data flow)
  useEffect(() => {
    if (sessionStatus === 'signedIn') void dispatch(startSync())
  }, [sessionStatus, dispatch])

  return (
    <div className="flex min-h-dvh flex-col">
      <ReconnectBanner />
      <div className="flex flex-1">
        {SHOW_SIDEBAR && isDesktop && <Sidebar />}
        <div className="flex min-w-0 flex-1 flex-col">
          <header className="border-b bg-card">
            <div className={cn(CONTENT_WIDTH, 'flex items-center justify-between gap-2 px-4 py-3')}>
              <div className="flex items-center gap-6">
                <Link to="/" className="font-display text-lg font-bold">My Library</Link>
                {isDesktop && <HeaderMenu />}
              </div>
              <div className="flex items-center gap-2">
                {email && <span className="hidden font-mono text-xs text-muted-foreground sm:inline">{email}</span>}
                <SyncControl />
                <ThemeToggle />
                <SignOutControl />
              </div>
            </div>
          </header>
          <main className={cn(CONTENT_WIDTH, 'flex-1 p-4', !isDesktop && 'pb-24')}>
            <Outlet />
          </main>
        </div>
      </div>
      {!isDesktop && <BottomNav />}
      <NoticesHost />
    </div>
  )
}
