import { Link } from 'react-router'
import { FormField } from '@/components/FormField'
import { Select } from '@/components/ui/select'
import { cn } from '@/lib/utils'
import { useAppSelector } from '@/store/hooks'
import { selectActiveCategories, selectActiveLanguages } from '@/store/selectors'
import type { OptionList } from '@/types/library'

const sameName = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase()

const NOUN: Record<OptionList, string> = { categories: 'categories', languages: 'languages' }

/** Why a list can't be used yet, or a pointer to where it is managed. */
function ListHint({ list, setup, empty }: { list: OptionList; setup?: string; empty: boolean }) {
  if (setup) return <p role="status" className="text-xs text-muted-foreground">{setup}</p>
  return (
    <p className="text-xs text-muted-foreground">
      {empty ? `No ${NOUN[list]} yet. ` : ''}
      <Link to="/categories" className="underline underline-offset-4">Manage {NOUN[list]}</Link>
    </p>
  )
}

/** Tick any number of categories. Names the book already has but that were archived stay untouched (not shown, not dropped). */
export function CategoryField({ value, onChange, disabled }: { value: string[]; onChange: (next: string[]) => void; disabled?: boolean }) {
  const options = useAppSelector(selectActiveCategories)
  const setup = useAppSelector((s) => s.taxonomy.setup.categories)
  const has = (name: string) => value.some((v) => sameName(v, name))
  const toggle = (name: string) => onChange(has(name) ? value.filter((v) => !sameName(v, name)) : [...value, name])
  return (
    <fieldset className="space-y-2" disabled={disabled}>
      <legend className="text-sm font-medium">Categories</legend>
      {!setup && options.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {options.map((name) => (
            <label
              key={name}
              className={cn(
                'inline-flex cursor-pointer items-center gap-2 rounded-full border bg-card px-3 py-1 text-sm transition-colors hover:border-ring/60',
                'has-[:checked]:border-primary has-[:checked]:bg-primary/10 has-[:focus-visible]:ring-[3px] has-[:focus-visible]:ring-ring/25',
              )}
            >
              <input type="checkbox" checked={has(name)} onChange={() => toggle(name)} className="size-4 accent-primary" />
              {name}
            </label>
          ))}
        </div>
      )}
      <ListHint list="categories" setup={setup} empty={options.length === 0} />
    </fieldset>
  )
}

export function LanguageField({ value, onChange, disabled }: { value: string; onChange: (next: string) => void; disabled?: boolean }) {
  const options = useAppSelector(selectActiveLanguages)
  const setup = useAppSelector((s) => s.taxonomy.setup.languages)
  // A language the book already has but that was archived stays selectable, so editing another field never clears it.
  const shown = value && !options.some((name) => sameName(name, value)) ? [...options, value] : options
  return (
    <div className="space-y-1.5">
      <FormField label="Language">
        <Select
          value={value}
          onValueChange={onChange}
          disabled={disabled || Boolean(setup)}
          className="w-full"
          options={[
            { value: '', label: 'Not set' },
            ...shown.map((name) => ({ value: name, label: options.some((o) => sameName(o, name)) ? name : `${name} (archived)` })),
          ]}
        />
      </FormField>
      <ListHint list="languages" setup={setup} empty={options.length === 0} />
    </div>
  )
}
