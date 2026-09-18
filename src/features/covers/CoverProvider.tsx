import { useEffect, useMemo, type ReactNode } from 'react'
import { CoverLoaderContext } from '@/features/covers/coverContext'
import { createDriveClient } from '@/services/drive/client'
import { createBrowserCoverLoader, type CoverLoader } from '@/services/drive/covers'
import { accessTokenGetter } from '@/store/accessToken'
import { useAppSelector, useAppStore } from '@/store/hooks'

/**
 * One cover loader for the signed-in session: object URLs are shared across screens and revoked
 * when the session ends. `loader` lets tests supply a stand-in.
 */
export function CoverProvider({ children, loader }: { children: ReactNode; loader?: CoverLoader }) {
  const store = useAppStore()
  const active = useMemo(
    () => loader ?? createBrowserCoverLoader(createDriveClient({ getAccessToken: accessTokenGetter(store.getState) })),
    [loader, store],
  )
  useEffect(() => () => active.releaseAll(), [active])
  // Signing out frees every cover this session was showing
  const signedOut = useAppSelector((s) => s.session.status === 'signedOut')
  useEffect(() => {
    if (signedOut) active.releaseAll()
  }, [signedOut, active])
  return <CoverLoaderContext.Provider value={active}>{children}</CoverLoaderContext.Provider>
}
