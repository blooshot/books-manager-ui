import '@testing-library/jest-dom/vitest'
import { cleanup } from '@testing-library/react'
import { afterEach } from 'vitest'

// Vitest runs with globals off, so Testing Library's automatic cleanup is not registered
afterEach(() => {
  cleanup()
  localStorage.clear()
  sessionStorage.clear()
})

// jsdom has no matchMedia; default to a phone-sized viewport (see src/test/viewport.ts to change it)
import { setViewport } from '@/test/viewport'
setViewport('phone')

// jsdom has no object URLs; previews and cover images use them
let objectUrlCount = 0
URL.createObjectURL ??= () => `blob:test/${++objectUrlCount}`
URL.revokeObjectURL ??= () => undefined
