import { useCallback, useSyncExternalStore } from 'react'

/** Whether a CSS media query currently matches; re-renders when it changes. */
export function useMediaQuery(query: string): boolean {
  const subscribe = useCallback(
    (notify: () => void) => {
      const list = window.matchMedia(query)
      list.addEventListener('change', notify)
      return () => list.removeEventListener('change', notify)
    },
    [query],
  )
  return useSyncExternalStore(subscribe, () => window.matchMedia(query).matches, () => false)
}

/** Tailwind's `md` breakpoint: tables, sidebar and dialogs on desktop; cards, bottom nav and sheets on phones. */
export const useIsDesktop = () => useMediaQuery('(min-width: 768px)')
