import { BookOpen, PanelLeftClose, PanelLeftOpen, Users, type LucideIcon } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Link, NavLink, Outlet } from 'react-router'
import { ThemeToggle } from '@/components/ThemeToggle'
import { Button } from '@/components/ui/button'
import { ReconnectBanner } from '@/features/auth/ReconnectBanner'
import { NoticesHost } from '@/features/layout/NoticesHost'
import { readStored, writeStored } from '@/lib/storage'
import { useIsDesktop } from '@/lib/useMediaQuery'
import { cn } from '@/lib/utils'
import { useAppDispatch, useAppSelector } from '@/store/hooks'
import { loadAll } from '@/store/libraryThunks'
import { signOut } from '@/store/sessionSlice'

interface NavItem {
  to: string
  label: string
  icon: LucideIcon
  end?: boolean
}

const NAV_ITEMS: NavItem[] = [
  { to: '/', label: 'Books', icon: BookOpen, end: true },
  { to: '/lent-out', label: 'Lent out', icon: Users },
]

const SIDEBAR_KEY = 'bm.sidebarCollapsed'

function Sidebar() {
  const [collapsed, setCollapsed] = useState(() => readStored(SIDEBAR_KEY) === '1')
  function toggle() {
    writeStored(SIDEBAR_KEY, collapsed ? '0' : '1')
    setCollapsed(!collapsed)
  }
  return (
    <aside className={cn('flex shrink-0 flex-col gap-2 border-r bg-card p-2 transition-[width] duration-150 motion-reduce:transition-none', collapsed ? 'w-14' : 'w-52')}>
      <nav aria-label="Main">
        <ul className="space-y-1">
          {NAV_ITEMS.map(({ to, label, icon: Icon, end }) => (
            <li key={to}>
              <NavLink
                to={to}
                end={end}
                title={label}
                className="flex items-center gap-3 rounded-md px-3 py-2 text-sm hover:bg-accent aria-[current=page]:bg-accent aria-[current=page]:font-medium aria-[current=page]:text-primary"
              >
                <Icon className="size-4 shrink-0" aria-hidden />
                <span className={cn(collapsed && 'sr-only')}>{label}</span>
              </NavLink>
            </li>
          ))}
        </ul>
      </nav>
      <Button variant="ghost" size="sm" className="mt-auto justify-start" onClick={toggle} aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}>
        {collapsed ? <PanelLeftOpen aria-hidden /> : <PanelLeftClose aria-hidden />}
        <span className={cn(collapsed && 'sr-only')}>Collapse</span>
      </Button>
    </aside>
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

  // Load on sign-in, and again after a reconnect (AGENTS.md > Data flow)
  useEffect(() => {
    if (sessionStatus === 'signedIn') void dispatch(loadAll())
  }, [sessionStatus, dispatch])

  return (
    <div className="flex min-h-dvh flex-col">
      <ReconnectBanner />
      <div className="flex flex-1">
        {isDesktop && <Sidebar />}
        <div className="flex min-w-0 flex-1 flex-col">
          <header className="flex items-center justify-between gap-2 border-b bg-card px-4 py-3">
            <Link to="/" className="font-display text-lg font-bold">My Library</Link>
            <div className="flex items-center gap-2">
              {email && <span className="hidden font-mono text-xs text-muted-foreground sm:inline">{email}</span>}
              <ThemeToggle />
              <Button variant="outline" size="sm" onClick={() => void dispatch(signOut())}>Sign out</Button>
            </div>
          </header>
          <main className={cn('mx-auto w-full max-w-5xl flex-1 p-4', !isDesktop && 'pb-24')}>
            <Outlet />
          </main>
        </div>
      </div>
      {!isDesktop && <BottomNav />}
      <NoticesHost />
    </div>
  )
}
