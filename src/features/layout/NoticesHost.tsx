import { X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useAppDispatch, useAppSelector } from '@/store/hooks'
import { noticeDismissed } from '@/store/noticesSlice'

/** Non-fatal messages (e.g. "old cover could not be renamed"), dismissible. Sits above the phone bottom nav. */
export function NoticesHost() {
  const dispatch = useAppDispatch()
  const notices = useAppSelector((s) => s.notices.items)
  if (notices.length === 0) return null
  return (
    <div className="fixed right-4 bottom-20 left-4 z-50 flex flex-col gap-2 md:right-4 md:bottom-4 md:left-auto md:w-96">
      {notices.map((message, index) => (
        <div key={`${index}-${message}`} role="status" className="flex items-start gap-2 rounded-md border bg-card p-3 text-sm shadow-md">
          <p className="flex-1">{message}</p>
          <Button variant="ghost" size="icon-xs" aria-label="Dismiss notice" onClick={() => dispatch(noticeDismissed(index))}>
            <X aria-hidden />
          </Button>
        </div>
      ))}
    </div>
  )
}
