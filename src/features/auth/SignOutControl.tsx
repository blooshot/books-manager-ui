import { Button } from '@/components/ui/button'
import { ResponsiveDialog } from '@/components/ui/dialog'
import { useState } from 'react'
import { useAppDispatch, useAppSelector } from '@/store/hooks'
import { signOut } from '@/store/sessionSlice'

/**
 * Sign out at any time, on every screen. If changes are still waiting to be sent, ask first: they stay on this device
 * and are sent the next time you sign in, but you should know they have not reached your Sheet.
 */
export function SignOutControl() {
  const dispatch = useAppDispatch()
  const unsent = useAppSelector((s) => s.outbox.entries.length)
  const [confirming, setConfirming] = useState(false)

  return (
    <>
      <Button variant="outline" size="sm" onClick={() => (unsent > 0 ? setConfirming(true) : void dispatch(signOut()))}>
        Sign out
      </Button>
      <ResponsiveDialog
        open={confirming}
        onOpenChange={setConfirming}
        title="Sign out with unsent changes?"
        description={`${unsent} ${unsent === 1 ? 'change is' : 'changes are'} saved only on this device and ${unsent === 1 ? 'has' : 'have'} not reached your Sheet. ${
          unsent === 1 ? 'It stays' : 'They stay'
        } here and will be sent the next time you sign in.`}
      >
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={() => setConfirming(false)}>
            Stay signed in
          </Button>
          <Button onClick={() => void dispatch(signOut())}>Sign out anyway</Button>
        </div>
      </ResponsiveDialog>
    </>
  )
}
