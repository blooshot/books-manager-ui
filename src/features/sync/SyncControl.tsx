import { RefreshCw } from 'lucide-react'
import { Link } from 'react-router'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { useAppDispatch, useAppSelector } from '@/store/hooks'
import { selectFailedCount, selectPendingCount } from '@/store/outboxSlice'
import { syncAll } from '@/store/outboxThunks'
import { cn } from '@/lib/utils'

/**
 * "N pending" (a link to the list of what is waiting) and the Sync button: send everything queued, then reload
 * from the Sheet. Sync is off while it is running, and while the session has expired (nothing can be sent until
 * you reconnect; the banner explains).
 */
export function SyncControl() {
  const dispatch = useAppDispatch()
  const pending = useAppSelector(selectPendingCount)
  const failed = useAppSelector(selectFailedCount)
  const syncing = useAppSelector((s) => s.outbox.syncing)
  const signedIn = useAppSelector((s) => s.session.status === 'signedIn')

  return (
    <div className="flex items-center gap-2">
      {(pending > 0 || failed > 0) && (
        <Link to="/pending" className="flex items-center gap-1" aria-label={`Pending changes: ${pending} waiting, ${failed} failed`}>
          {pending > 0 && <Badge variant="attention">{pending} pending</Badge>}
          {failed > 0 && <Badge variant="danger">{failed} failed</Badge>}
        </Link>
      )}
      <Button
        variant="outline"
        size="sm"
        onClick={() => void dispatch(syncAll())}
        disabled={syncing || !signedIn}
        title={signedIn ? undefined : 'Reconnect to Google first'}
      >
        <RefreshCw className={cn(syncing && 'animate-spin motion-reduce:animate-none')} aria-hidden />
        <span className="max-sm:sr-only">{syncing ? 'Syncing…' : 'Sync'}</span>
      </Button>
    </div>
  )
}
