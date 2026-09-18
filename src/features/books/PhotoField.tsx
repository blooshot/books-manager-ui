import { Camera, X } from 'lucide-react'
import { useEffect, useRef, useState, type ChangeEvent } from 'react'
import { Button } from '@/components/ui/button'
import { CoverImage } from '@/features/covers/CoverImage'
import { createCoverVariants, type CoverVariants } from '@/lib/image'
import type { Book } from '@/types/library'

/**
 * Cover photo picker. On phones `capture` opens the camera; on desktop it is a normal file chooser.
 * The chosen photo is resized in the browser (full + thumbnail) before it is handed to the form.
 * "Clear selection" only drops a photo that hasn't been saved yet; there is no way to delete a saved cover.
 */
export function PhotoField({
  book,
  value,
  onChange,
}: {
  book: Pick<Book, 'title' | 'photoUrl'>
  value: CoverVariants | null
  onChange: (photo: CoverVariants | null) => void
}) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // The preview URL is created when a photo is chosen (an event, not an effect) and revoked when it is
  // replaced, cleared, or the field goes away.
  const [preview, setPreview] = useState<string | null>(null)
  const previewRef = useRef<string | null>(null)
  useEffect(() => () => {
    if (previewRef.current) URL.revokeObjectURL(previewRef.current)
  }, [])

  function showPreview(blob: Blob | null) {
    if (previewRef.current) URL.revokeObjectURL(previewRef.current)
    previewRef.current = blob ? URL.createObjectURL(blob) : null
    setPreview(previewRef.current)
  }

  async function handleFile(event: ChangeEvent<HTMLInputElement>) {
    const input = event.currentTarget
    const file = input.files?.[0]
    input.value = '' // choosing the same file again must still fire a change
    if (!file) return
    setBusy(true)
    setError(null)
    try {
      const variants = await createCoverVariants(file)
      showPreview(variants.thumb)
      onChange(variants)
    } catch {
      setError('This image could not be read. Try another photo.')
    } finally {
      setBusy(false)
    }
  }

  const hasSavedCover = Boolean(book.photoUrl)
  return (
    <div className="flex items-start gap-4">
      {value && preview ? (
        <img src={preview} alt="Selected cover" className="aspect-[2/3] w-24 shrink-0 rounded-md object-cover" />
      ) : (
        <CoverImage book={book} variant="thumb" className="w-24 shrink-0" />
      )}
      <div className="space-y-2">
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          capture="environment"
          aria-label="Cover photo file"
          tabIndex={-1}
          className="sr-only"
          onChange={(event) => void handleFile(event)}
        />
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="outline" size="sm" disabled={busy} onClick={() => inputRef.current?.click()}>
            <Camera aria-hidden />
            {busy ? 'Preparing photo…' : value || hasSavedCover ? 'Replace photo' : 'Add photo'}
          </Button>
          {value && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => {
                showPreview(null)
                onChange(null)
              }}
            >
              <X aria-hidden />
              Clear selection
            </Button>
          )}
        </div>
        <p className="text-xs text-muted-foreground">
          {value ? 'The new photo is saved with the book.' : hasSavedCover ? 'The current cover stays unless you choose a new photo.' : 'Optional.'}
        </p>
        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}
      </div>
    </div>
  )
}
