import { useState } from 'react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { useAppDispatch, useAppSelector } from '@/store/hooks'
import { discardEntry, retryEntry } from '@/store/outboxThunks'
import type { OutboxEntry } from '@/services/outbox/types'

function EntryRow({ entry }: { entry: OutboxEntry }) {
  const dispatch = useAppDispatch()
  const busy = useAppSelector((s) => s.outbox.syncing)
  const [confirming, setConfirming] = useState(false)
  const failed = entry.status === 'failed'

  return (
    <li className="space-y-2 rounded-lg border bg-card p-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <p className="font-medium">{entry.summary}</p>
        <Badge variant={failed ? 'danger' : 'attention'}>{failed ? 'Failed' : 'Pending'}</Badge>
      </div>
      <p className="text-xs text-muted-foreground">
        Saved <span className="font-mono">{entry.createdAt.slice(0, 16).replace('T', ' ')}</span>
        {entry.attempts > 0 && <> · tried {entry.attempts} {entry.attempts === 1 ? 'time' : 'times'}</>}
      </p>
      {failed && entry.error && (
        <p role="alert" className="text-sm text-destructive">
          {entry.error}
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        {failed && (
          <Button size="sm" variant="outline" disabled={busy} onClick={() => void dispatch(retryEntry(entry.seq))}>
            Retry
          </Button>
        )}
        {confirming ? (
          <>
            <Button size="sm" variant="destructive" disabled={busy} onClick={() => void dispatch(discardEntry(entry.seq))}>
              Discard this change
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setConfirming(false)}>
              Keep it
            </Button>
          </>
        ) : (
          <Button size="sm" variant="ghost" disabled={busy} onClick={() => setConfirming(true)}>
            Discard…
          </Button>
        )}
      </div>
    </li>
  )
}

/** Changes made here that have not reached the Sheet yet. Discarding drops only the local, unsent change. */
export function PendingChangesPage() {
  const { entries, available, loaded } = useAppSelector((s) => s.outbox)
  return (
    <section aria-labelledby="pending-heading" className="max-w-2xl space-y-4">
      <h1 id="pending-heading" className="font-display text-xl font-bold">Pending changes</h1>
      <p className="text-sm text-muted-foreground">
        Changes that could not be sent (you were offline, or your Google session expired) are kept on this device and sent, in order, when you press Sync.
      </p>
      {!available && (
        <p role="alert" className="rounded-md border border-attention/40 bg-attention/10 p-3 text-sm">
          This browser can’t keep changes for later, so a change that can’t be sent right away is reported and not saved.
        </p>
      )}
      {loaded && entries.length === 0 && <p className="text-muted-foreground">Nothing is waiting to be sent.</p>}
      {entries.length > 0 && (
        <ul aria-label="Pending changes" className="space-y-3">
          {entries.map((entry) => (
            <EntryRow key={entry.seq} entry={entry} />
          ))}
        </ul>
      )}
    </section>
  )
}
