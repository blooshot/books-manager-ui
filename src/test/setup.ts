import '@testing-library/jest-dom/vitest'
import { cleanup } from '@testing-library/react'
import { afterEach } from 'vitest'

// Vitest runs with globals off, so Testing Library's automatic cleanup is not registered
afterEach(() => {
  cleanup()
  localStorage.clear()
})

// jsdom has no matchMedia; default to a phone-sized viewport (see src/test/viewport.ts to change it)
import { setViewport } from '@/test/viewport'
setViewport('phone')
