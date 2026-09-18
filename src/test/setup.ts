import '@testing-library/jest-dom/vitest'
import { cleanup } from '@testing-library/react'
import { afterEach, vi } from 'vitest'
import { setClockForTests } from '@/lib/clock'

// Vitest runs with globals off, so Testing Library's automatic cleanup is not registered
afterEach(() => {
  cleanup()
  localStorage.clear()
  sessionStorage.clear()
  setClockForTests(null)
})

// jsdom has no matchMedia; default to a phone-sized viewport (see src/test/viewport.ts to change it)
import { setViewport } from '@/test/viewport'
setViewport('phone')

// jsdom has no object URLs; previews and cover images use them
let objectUrlCount = 0
URL.createObjectURL ??= () => `blob:test/${++objectUrlCount}`
URL.revokeObjectURL ??= () => undefined

// jsdom lacks a few browser APIs that Radix Select (the themed dropdown) relies on
Element.prototype.hasPointerCapture ??= () => false
Element.prototype.setPointerCapture ??= () => undefined
Element.prototype.releasePointerCapture ??= () => undefined
Element.prototype.scrollIntoView ??= () => undefined
globalThis.ResizeObserver ??= class {
  observe() {}
  unobserve() {}
  disconnect() {}
}

// Pages load on demand in the app; in tests they are there on first render (real lazy loading is checked in a browser by `npm run ui:check`)
vi.mock('@/pages', () => import('@/test/eagerPages'))
