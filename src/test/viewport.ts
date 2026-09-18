export type Viewport = 'phone' | 'desktop'

/** jsdom has no layout, so the app's `useMediaQuery` is driven by this stand-in. Desktop = min-width 768px. */
export function setViewport(viewport: Viewport): void {
  const matches = (query: string) => (viewport === 'desktop' ? /min-width:\s*768px/.test(query) : false)
  window.matchMedia = (query: string): MediaQueryList =>
    ({
      matches: matches(query),
      media: query,
      onchange: null,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
      addListener: () => undefined,
      removeListener: () => undefined,
      dispatchEvent: () => false,
    }) as MediaQueryList
}
