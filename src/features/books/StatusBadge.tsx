import { Badge } from '@/components/ui/badge'

/** Available = success; Borrowed = neutral pill (AGENTS.md > Design system). */
export function StatusBadge({ borrowed }: { borrowed: boolean }) {
  return borrowed ? <Badge variant="neutral">Borrowed</Badge> : <Badge variant="success">Available</Badge>
}
