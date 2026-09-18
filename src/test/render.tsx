import { render } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Provider } from 'react-redux'
import { MemoryRouter, useLocation } from 'react-router'
import { vi } from 'vitest'
import App, { AppRoutes } from '@/App'
import { CoverProvider } from '@/features/covers/CoverProvider'
import type { CoverLoader } from '@/services/drive/covers'
import { makeStore, type AppStore } from '@/store'
import { signIn } from '@/store/sessionSlice'
import { FakeDrive } from '@/test/fakeDrive'
import { FakeSheets } from '@/test/fakeSheets'
import { setViewport, type Viewport } from '@/test/viewport'

export const NOW = new Date(2026, 8, 18, 14, 5)

/** Shows the router's current location so tests can assert on the URL (search/filter state lives there). */
function LocationProbe() {
  const location = useLocation()
  return <div data-testid="location">{location.pathname + location.search}</div>
}

export interface RenderAppOptions {
  route?: string
  sheets?: FakeSheets
  drive?: FakeDrive
  viewport?: Viewport
  /** Skip signing in (to see the sign-in gate). */
  signedOut?: boolean
  /** Render the whole <App/> (auth gate, real cover loader) instead of just the routes with a stand-in loader. */
  fullApp?: boolean
  loader?: CoverLoader
  fetchImpl?: typeof fetch
}

/** A stand-in cover loader: resolves `blob:cover/<fileId>/<variant>` without touching Drive or IndexedDB. */
export function stubCoverLoader(): CoverLoader & { getCoverUrl: ReturnType<typeof vi.fn> } {
  return {
    getCoverUrl: vi.fn(async (fileId: string, variant: string) => `blob:cover/${fileId}/${variant}`),
    releaseAll: vi.fn(),
  }
}

/** Renders the real app (real store, thunks, router) against the fake Sheets and Drive. */
export function renderApp(options: RenderAppOptions = {}) {
  const sheets = options.sheets ?? new FakeSheets()
  const drive = options.drive ?? new FakeDrive()
  const routed: typeof fetch =
    options.fetchImpl ??
    ((input, init) => (new URL(String(input)).hostname === 'sheets.googleapis.com' ? sheets.fetch(input, init) : drive.fetch(input, init)))

  setViewport(options.viewport ?? 'phone')
  const store: AppStore = makeStore({ sheetId: 'sheet-1', fetchImpl: routed, now: () => NOW })
  if (!options.signedOut) {
    store.dispatch(
      signIn.fulfilled({ accessToken: 'test-token', expiresAt: NOW.getTime() + 3_600_000, email: 'me@example.com' }, 'req', undefined),
    )
  }
  const loader = options.loader ?? stubCoverLoader()
  const user = userEvent.setup()
  const view = render(
    <Provider store={store}>
      <MemoryRouter initialEntries={[options.route ?? '/']}>
        {options.fullApp ? (
          <App />
        ) : (
          <CoverProvider loader={loader}>
            <AppRoutes />
          </CoverProvider>
        )}
        <LocationProbe />
      </MemoryRouter>
    </Provider>,
  )
  return { ...view, store, sheets, drive, loader, user }
}
