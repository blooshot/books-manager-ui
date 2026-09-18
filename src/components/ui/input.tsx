import * as React from 'react'
import { cn } from '@/lib/utils'

/** Text input on the Fusion tokens: accent focus ring, border hover, 16px text on phones (see index.css). */
function Input({ className, type, ...props }: React.ComponentProps<'input'>) {
  return (
    <input
      type={type}
      data-slot="input"
      className={cn(
        'h-10 w-full min-w-0 rounded-md border border-input bg-card px-3 py-2 text-foreground outline-none transition placeholder:text-muted-foreground',
        'hover:border-ring/60 focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/25',
        'disabled:pointer-events-none disabled:opacity-50 aria-invalid:border-destructive',
        className,
      )}
      {...props}
    />
  )
}

export { Input }
