import { PanelLeftClose, PanelLeftOpen } from 'lucide-react'
import { useState } from 'react'
import { NavLink } from 'react-router'
import { Button } from '@/components/ui/button'
import { NAV_ITEMS } from '@/features/layout/navItems'
import { readStored, writeStored } from '@/lib/storage'
import { cn } from '@/lib/utils'

const SIDEBAR_KEY = 'bm.sidebarCollapsed'

/** Collapsible side navigation. Kept working but not shown for now (see `SHOW_SIDEBAR` in `AppLayout`). */
export function Sidebar() {
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
