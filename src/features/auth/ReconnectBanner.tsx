import { Button } from '@/components/ui/button'
import { useAppDispatch, useAppSelector } from '@/store/hooks'
import { signIn } from '@/store/sessionSlice'

/** Non-blocking notice shown when the ~1 hour access token has expired (ADR-0002). */
export function ReconnectBanner() {
  const dispatch = useAppDispatch()
  const { status, error } = useAppSelector((s) => s.session)
  if (status !== 'expired') return null

  return (
    <div
      role="status"
      className="flex flex-wrap items-center justify-between gap-2 border-b border-attention/40 bg-attention/10 px-4 py-2 text-sm"
    >
      <span>{error ?? 'Session expired. Reconnect to keep saving changes.'}</span>
      <Button size="sm" onClick={() => dispatch(signIn())}>
        Reconnect
      </Button>
    </div>
  )
}
