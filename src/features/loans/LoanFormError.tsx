import { Button } from '@/components/ui/button'
import { useAppDispatch } from '@/store/hooks'
import { loadAll } from '@/store/libraryThunks'

/**
 * A failed borrow/return. When the screen was showing out-of-date data, offer a refresh.
 * `onRefreshed` runs after the reload (a dialog uses it to close, since what it was for may have changed).
 */
export function LoanFormError({
  failure,
  onRefreshed,
}: {
  failure: { message: string; stale: boolean } | null
  onRefreshed?: () => void
}) {
  const dispatch = useAppDispatch()
  if (!failure) return null
  return (
    <div role="alert" className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm">
      <span>{failure.message}</span>
      {failure.stale && (
        <Button type="button" size="sm" variant="outline" onClick={() => void dispatch(loadAll()).then(() => onRefreshed?.())}>
          Refresh
        </Button>
      )}
    </div>
  )
}
