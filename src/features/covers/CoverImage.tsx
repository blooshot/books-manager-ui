import { useCoverUrl } from '@/features/covers/useCoverUrl'
import type { CoverVariant } from '@/services/drive/coverCache'
import { cn } from '@/lib/utils'
import type { Book } from '@/types/library'

/** Stand-in for a missing or unreadable cover: the title's first letter on a neutral tile. */
function PlaceholderCover({ title, className, busy }: { title: string; className?: string; busy?: boolean }) {
  const initial = title.trim().charAt(0).toUpperCase() || '?'
  return (
    <div
      role="img"
      aria-label={busy ? `Loading cover for ${title}` : `No cover for ${title}`}
      aria-busy={busy}
      className={cn(
        'flex aspect-[2/3] select-none items-center justify-center rounded-md bg-secondary font-display text-2xl font-bold text-muted-foreground',
        busy && 'animate-pulse',
        className,
      )}
    >
      {initial}
    </div>
  )
}

/** A book's cover (`thumb` for lists, `full` for the detail screen), or the placeholder. */
export function CoverImage({ book, variant, className }: { book: Pick<Book, 'title' | 'photoUrl'>; variant: CoverVariant; className?: string }) {
  const cover = useCoverUrl(book.photoUrl, variant)
  if (cover.status === 'ready') {
    return (
      <img
        src={cover.url}
        alt={`Cover of ${book.title}`}
        loading="lazy"
        className={cn('aspect-[2/3] rounded-md object-cover', className)}
      />
    )
  }
  return <PlaceholderCover title={book.title} className={className} busy={cover.status === 'loading'} />
}
