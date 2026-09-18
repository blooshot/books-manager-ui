import { ChevronDown } from 'lucide-react'
import { Accordion as AccordionPrimitive } from 'radix-ui'
import type { ComponentProps } from 'react'
import { cn } from '@/lib/utils'

/** One item open at a time (Fusion accordion). Wrap `type="single" collapsible`. */
function Accordion(props: ComponentProps<typeof AccordionPrimitive.Root>) {
  return <AccordionPrimitive.Root data-slot="accordion" {...props} />
}

function AccordionItem({ className, ...props }: ComponentProps<typeof AccordionPrimitive.Item>) {
  return <AccordionPrimitive.Item data-slot="accordion-item" className={cn('border-b last:border-b-0', className)} {...props} />
}

function AccordionTrigger({ className, children, ...props }: ComponentProps<typeof AccordionPrimitive.Trigger>) {
  return (
    <AccordionPrimitive.Header className="flex">
      <AccordionPrimitive.Trigger
        data-slot="accordion-trigger"
        className={cn(
          'group flex flex-1 items-center justify-between gap-3 py-4 text-left font-medium transition-colors hover:text-primary focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none',
          className,
        )}
        {...props}
      >
        {children}
        <ChevronDown
          className="size-4 shrink-0 text-muted-foreground transition-transform duration-150 group-data-[state=open]:rotate-180 motion-reduce:transition-none"
          aria-hidden
        />
      </AccordionPrimitive.Trigger>
    </AccordionPrimitive.Header>
  )
}

function AccordionContent({ className, children, ...props }: ComponentProps<typeof AccordionPrimitive.Content>) {
  return (
    <AccordionPrimitive.Content data-slot="accordion-content" className="bm-accordion-content" {...props}>
      <div className={cn('pb-4', className)}>{children}</div>
    </AccordionPrimitive.Content>
  )
}

export { Accordion, AccordionContent, AccordionItem, AccordionTrigger }
