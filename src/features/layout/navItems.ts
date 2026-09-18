import { BookOpen, Tags, Users, type LucideIcon } from 'lucide-react'

export interface NavItem {
  to: string
  label: string
  icon: LucideIcon
  end?: boolean
}

/** The screens reachable from the header menu (desktop), the bottom nav (phone), and the sidebar (currently hidden). */
export const NAV_ITEMS: NavItem[] = [
  { to: '/', label: 'Books', icon: BookOpen, end: true },
  { to: '/lent-out', label: 'Lent out', icon: Users },
  { to: '/categories', label: 'Categories', icon: Tags },
]
