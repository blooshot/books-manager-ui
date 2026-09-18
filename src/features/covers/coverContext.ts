import { createContext, useContext } from 'react'
import type { CoverLoader } from '@/services/drive/covers'

export const CoverLoaderContext = createContext<CoverLoader | null>(null)

export function useCoverLoader(): CoverLoader {
  const loader = useContext(CoverLoaderContext)
  if (!loader) throw new Error('useCoverLoader must be used inside <CoverProvider>')
  return loader
}
