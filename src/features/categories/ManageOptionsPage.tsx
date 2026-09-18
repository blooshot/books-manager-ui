import { OptionSection } from '@/features/categories/OptionSection'

/** `/categories`: the two managed lists that books are sorted and filtered by. */
export function ManageOptionsPage() {
  return (
    <div className="max-w-2xl space-y-8">
      <div className="space-y-1">
        <h1 className="font-display text-xl font-bold">Categories &amp; languages</h1>
        <p className="text-sm text-muted-foreground">
          Choose these when you add or edit a book. Archiving hides one without touching your books, and you can restore it any time.
        </p>
      </div>
      <OptionSection list="categories" />
      <OptionSection list="languages" />
    </div>
  )
}
