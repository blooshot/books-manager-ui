import { cva, type VariantProps } from 'class-variance-authority'
import * as React from 'react'
import { cn } from '@/lib/utils'

const badgeVariants = cva('inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium whitespace-nowrap', {
  variants: {
    variant: {
      /** Success: the Available badge. */
      success: 'bg-success text-success-foreground',
      /** Neutral: the Borrowed pill (deliberately not the attention color). */
      neutral: 'bg-secondary text-secondary-foreground',
      /** Attention: changes waiting to be sent ("N pending"). Reserved for things that need a look, never for errors. */
      attention: 'bg-attention text-attention-foreground',
      /** Errors only: a queued change that could not be applied. */
      danger: 'bg-destructive text-destructive-foreground',
    },
  },
  defaultVariants: { variant: 'neutral' },
})

function Badge({ className, variant, ...props }: React.ComponentProps<'span'> & VariantProps<typeof badgeVariants>) {
  return <span data-slot="badge" className={cn(badgeVariants({ variant }), className)} {...props} />
}

export { Badge }
