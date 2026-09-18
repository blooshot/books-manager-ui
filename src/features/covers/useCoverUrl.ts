import { useEffect, useState } from 'react'
import type { CoverVariant } from '@/services/drive/coverCache'
import { getDriveFileIdFromUrl } from '@/services/drive/links'
import { useCoverLoader } from '@/features/covers/coverContext'
import { useAppDispatch } from '@/store/hooks'
import { tokenExpired } from '@/store/sessionSlice'

export type CoverState =
  | { status: 'none' } // the book has no (readable) photo link
  | { status: 'loading' }
  | { status: 'ready'; url: string }
  | { status: 'error' }

/**
 * Object URL for a book's cover, loaded lazily (cache first, Drive on a miss).
 * A failure is not fatal: callers show the placeholder. An expired token does surface the reconnect banner.
 */
export function useCoverUrl(photoUrl: string | undefined, variant: CoverVariant): CoverState {
  const loader = useCoverLoader()
  const dispatch = useAppDispatch()
  const fileId = photoUrl ? getDriveFileIdFromUrl(photoUrl) : null
  const key = fileId ? `${fileId}:${variant}` : null
  const [result, setResult] = useState<{ key: string; state: CoverState } | null>(null)

  useEffect(() => {
    if (!fileId || !key) return
    let cancelled = false
    loader
      .getCoverUrl(fileId, variant)
      .then((url) => !cancelled && setResult({ key, state: { status: 'ready', url } }))
      .catch((error: unknown) => {
        if (error instanceof Error && error.name === 'SessionExpiredError') dispatch(tokenExpired())
        if (!cancelled) setResult({ key, state: { status: 'error' } })
      })
    return () => {
      cancelled = true
    }
  }, [fileId, key, variant, loader, dispatch])

  if (!key) return { status: 'none' }
  return result?.key === key ? result.state : { status: 'loading' }
}
