import { X } from 'lucide-react'
import { Dialog as DialogPrimitive } from 'radix-ui'
import type { ReactNode } from 'react'
import { useIsDesktop } from '@/lib/useMediaQuery'
import { cn } from '@/lib/utils'

/**
 * A modal that is a centred dialog on desktop and a bottom sheet on phones (AGENTS.md > Screens).
 * Radix supplies the behaviour: focus is trapped and restored, Escape and the overlay close it, and
 * the title/description are announced. Mount the form inside `children`: it unmounts on close, so
 * its state starts fresh each time.
 */
export function ResponsiveDialog({
  open,
  onOpenChange,
  title,
  description,
  children,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  description: string
  children: ReactNode
}) {
  const isDesktop = useIsDesktop()
  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="bm-overlay fixed inset-0 z-50 bg-black/40" />
        <DialogPrimitive.Content
          data-presentation={isDesktop ? 'dialog' : 'sheet'}
          className={cn(
            'fixed z-50 bg-card text-card-foreground shadow-lg outline-none',
            isDesktop
              ? 'bm-dialog top-1/2 left-1/2 w-full max-w-md -translate-x-1/2 -translate-y-1/2 rounded-lg border p-6'
              : 'bm-sheet inset-x-0 bottom-0 max-h-[90dvh] overflow-y-auto rounded-t-xl border-t p-4 pb-8',
          )}
        >
          <DialogPrimitive.Title className="font-display text-lg font-bold">{title}</DialogPrimitive.Title>
          <DialogPrimitive.Description className="mt-1 mb-4 text-sm text-muted-foreground">{description}</DialogPrimitive.Description>
          {children}
          <DialogPrimitive.Close
            aria-label="Close"
            className="absolute top-3 right-3 rounded-md p-1 text-muted-foreground transition hover:bg-accent hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none"
          >
            <X className="size-4" aria-hidden />
          </DialogPrimitive.Close>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  )
}
