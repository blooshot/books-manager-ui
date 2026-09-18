import { act, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import * as gis from '@/services/google/gis'
import { tokenExpired } from '@/store/sessionSlice'
import { FakeDrive } from '@/test/fakeDrive'
import { MemoryOutbox } from '@/test/fakeOutbox'
import { FakeSheets } from '@/test/fakeSheets'
import { bookRow, loanRow } from '@/test/fixtures'
import { switchableNetwork } from '@/test/network'
import { renderApp } from '@/test/render'

const location = () => screen.getByTestId('location').textContent

function library() {
  const sheets = new FakeSheets()
  sheets.tabs.Books.push(bookRow({ id: 'B-0001', title: 'Dune', author: 'Herbert' }), bookRow({ id: 'B-0002', title: 'Emma', author: 'Austen' }))
  return sheets
}

/** Google's sign-in and token revocation, replaced. Sign-in hands back the token the fake Sheet accepts. */
let signInSpy: ReturnType<typeof vi.spyOn>
let revokeSpy: ReturnType<typeof vi.spyOn>
let loadGisSpy: ReturnType<typeof vi.spyOn>

beforeEach(() => {
  signInSpy = vi.spyOn(gis, 'requestAccessToken').mockImplementation(async () => ({ accessToken: 'test-token', expiresAt: Date.now() + 3_600_000 }))
  vi.spyOn(gis, 'fetchUserEmail').mockResolvedValue('me@example.com')
  revokeSpy = vi.spyOn(gis, 'revokeAccessToken').mockResolvedValue(undefined)
  loadGisSpy = vi.spyOn(gis, 'loadGis').mockResolvedValue(undefined)
})
afterEach(() => vi.restoreAllMocks())

const gate = () => screen.getByRole('heading', { name: 'My Library', level: 1 })
const signInButton = () => screen.getByRole('button', { name: /Sign in with Google|Continue as/ })

describe('signed out: everything leads to /login', () => {
  it('opening the app sends you to /login, which shows the sign-in screen', async () => {
    renderApp({ signedOut: true, fullApp: true, sheets: library() })
    await waitFor(() => expect(location()).toBe('/login'))
    expect(gate()).toBeInTheDocument()
    expect(screen.queryByRole('navigation')).not.toBeInTheDocument()
  })

  it('opening a deep link while signed out goes to /login, and signing in returns you to that link', async () => {
    const { user } = renderApp({ signedOut: true, fullApp: true, sheets: library(), route: '/books/B-0001?tab=x' })
    await waitFor(() => expect(location()).toBe('/login'))
    await user.click(signInButton())
    expect(await screen.findByRole('heading', { level: 1, name: 'Dune' })).toBeInTheDocument()
    expect(location()).toBe('/books/B-0001?tab=x')
  })

  it('signing in from /login itself lands on the home page', async () => {
    const { user } = renderApp({ signedOut: true, fullApp: true, sheets: library(), route: '/login' })
    await user.click(signInButton())
    expect(await screen.findByRole('heading', { name: 'Books' })).toBeInTheDocument()
    expect(location()).toBe('/')
    expect(await screen.findByText('Dune')).toBeInTheDocument()
  })

  it('an unknown URL while signed out also goes to /login', async () => {
    renderApp({ signedOut: true, fullApp: true, route: '/some/other/place' })
    await waitFor(() => expect(location()).toBe('/login'))
  })

  it('shows "Signing in…" and locks the button while Google is answering', async () => {
    let answer: (v: { accessToken: string; expiresAt: number }) => void = () => undefined
    signInSpy.mockImplementation(() => new Promise((resolve) => (answer = resolve)))
    const { user } = renderApp({ signedOut: true, fullApp: true, sheets: library(), route: '/login' })
    await user.click(signInButton())
    expect(screen.getByRole('button', { name: 'Signing in…' })).toBeDisabled()
    answer({ accessToken: 'test-token', expiresAt: Date.now() + 3_600_000 })
    expect(await screen.findByRole('heading', { name: 'Books' })).toBeInTheDocument()
  })

  it('a cancelled or failed sign-in stays on /login with the reason, and can be retried', async () => {
    signInSpy.mockRejectedValueOnce(new Error('Sign-in was cancelled.'))
    const { user } = renderApp({ signedOut: true, fullApp: true, sheets: library(), route: '/login' })
    await user.click(signInButton())
    expect(await screen.findByRole('alert')).toHaveTextContent('Sign-in was cancelled.')
    expect(location()).toBe('/login')

    await user.click(signInButton())
    expect(await screen.findByRole('heading', { name: 'Books' })).toBeInTheDocument()
    expect(screen.queryByText('Sign-in was cancelled.')).not.toBeInTheDocument()
  })

  it('loads Google’s sign-in script as soon as the login screen appears, before anything is clicked', async () => {
    renderApp({ signedOut: true, fullApp: true, route: '/login' })
    await waitFor(() => expect(gate()).toBeInTheDocument())
    expect(loadGisSpy).toHaveBeenCalled()
    expect(signInSpy).not.toHaveBeenCalled()
  })
})

describe('signed in', () => {
  it('visiting /login while signed in goes home instead of showing the sign-in screen', async () => {
    renderApp({ sheets: library(), route: '/login' })
    expect(await screen.findByRole('heading', { name: 'Books' })).toBeInTheDocument()
    expect(location()).toBe('/')
  })

  it('an expired session stays where it is (banner, no redirect), and Sign out still works', async () => {
    const { user, store } = renderApp({ sheets: library(), route: '/books/B-0001', fullApp: true })
    await screen.findByRole('heading', { level: 1, name: 'Dune' })
    act(() => {
      store.dispatch(tokenExpired())
    })
    expect(location()).toBe('/books/B-0001')
    expect(screen.getByText(/Session expired/)).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Sign out' }))
    await waitFor(() => expect(location()).toBe('/login'))
    expect(gate()).toBeInTheDocument()
  })
})

describe('sign out', () => {
  it.each(['phone', 'desktop'] as const)('is on every screen (%s)', async (viewport) => {
    const { unmount } = renderApp({ sheets: library(), viewport })
    await screen.findByRole('heading', { name: 'Books' })
    unmount()
    for (const route of ['/', '/books/B-0001', '/books/B-0001/edit', '/books/new', '/lent-out', '/pending', '/nowhere']) {
      const view = renderApp({ sheets: library(), viewport, route })
      expect(await screen.findByRole('button', { name: 'Sign out' }), route).toBeInTheDocument()
      view.unmount()
    }
  })

  it('signs out at once, revokes the token, and goes to /login where "Continue as" is offered', async () => {
    const { user } = renderApp({ fullApp: true, signedOut: true, sheets: library(), route: '/login' })
    await user.click(signInButton())
    await screen.findByText('Dune')
    await user.click(screen.getByRole('button', { name: 'Sign out' }))

    await waitFor(() => expect(location()).toBe('/login'))
    expect(revokeSpy).toHaveBeenCalledWith('test-token')
    expect(screen.getByRole('button', { name: 'Continue as me@example.com' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Use a different account' })).toBeInTheDocument()
  })

  it('does not wait for Google: a revoke that never returns (offline) cannot hold sign-out up', async () => {
    revokeSpy.mockImplementation(() => new Promise(() => undefined))
    const { user } = renderApp({ fullApp: true, signedOut: true, sheets: library(), route: '/login' })
    await user.click(signInButton())
    await screen.findByText('Dune')
    await user.click(screen.getByRole('button', { name: 'Sign out' }))
    await waitFor(() => expect(location()).toBe('/login'))
    expect(revokeSpy).toHaveBeenCalled()
  })

  it('a deliberate sign-out from a book page means the next sign-in starts at home, not on that book', async () => {
    const { user } = renderApp({ fullApp: true, signedOut: true, sheets: library(), route: '/books/B-0001' })
    await user.click(await screen.findByRole('button', { name: /Sign in with Google|Continue as/ }))
    await screen.findByRole('heading', { level: 1, name: 'Dune' })
    await user.click(screen.getByRole('button', { name: 'Sign out' }))
    await waitFor(() => expect(location()).toBe('/login'))

    await user.click(signInButton())
    expect(await screen.findByRole('heading', { name: 'Books' })).toBeInTheDocument()
    expect(location()).toBe('/')
  })

  it('leaves nothing of the library in memory', async () => {
    const sheets = library()
    sheets.tabs.Borrowers.push(loanRow({ bookId: 'B-0002', borrower: 'Ravi' }))
    const { user, store } = renderApp({ fullApp: true, signedOut: true, sheets, route: '/login' })
    await user.click(signInButton())
    await screen.findByText('Dune')
    expect(store.getState().books.ids.length).toBe(2)

    await user.click(screen.getByRole('button', { name: 'Sign out' }))
    await waitFor(() => expect(location()).toBe('/login'))
    const state = store.getState()
    expect(state.session).toMatchObject({ status: 'signedOut', accessToken: null, expiresAt: null })
    expect(state.books.ids).toEqual([])
    expect(state.borrowers.ids).toEqual([])
    expect(state.library).toMatchObject({ status: 'idle', loadedAt: null })
    expect(state.notices.items).toEqual([])
    expect(screen.queryByText('Dune')).not.toBeInTheDocument()
  })

  it('never puts the token or library data into browser storage', async () => {
    const { user } = renderApp({ fullApp: true, signedOut: true, sheets: library(), route: '/login' })
    await user.click(signInButton())
    await screen.findByText('Dune')
    await user.click(screen.getByRole('button', { name: 'Sign out' }))
    await waitFor(() => expect(location()).toBe('/login'))
    const everything = JSON.stringify({ ...localStorage }) + JSON.stringify({ ...sessionStorage })
    expect(everything).not.toContain('test-token')
    expect(everything).not.toContain('Dune')
    expect(localStorage.getItem('bm.emailHint')).toBe('me@example.com') // the only thing kept
  })

  it('asks before signing out when changes have not reached the Sheet; "Stay signed in" keeps you here', async () => {
    const sheets = library()
    const drive = new FakeDrive()
    const { network, fetchImpl } = switchableNetwork(sheets, drive)
    const { user } = renderApp({ route: '/books/B-0001', sheets, drive, fetchImpl })
    await user.click(await screen.findByRole('button', { name: 'Borrow' }))
    network.offline = true
    const dlg = screen.getByRole('dialog', { name: 'Borrow this book' })
    await user.type(within(dlg).getByLabelText(/^Borrower/), 'Ravi')
    await user.click(within(dlg).getByRole('button', { name: 'Borrow' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())

    await user.click(screen.getByRole('button', { name: 'Sign out' }))
    const confirm = screen.getByRole('dialog', { name: 'Sign out with unsent changes?' })
    expect(confirm).toHaveAccessibleDescription(/1 change is saved only on this device/)
    await user.click(within(confirm).getByRole('button', { name: 'Stay signed in' }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(location()).toBe('/books/B-0001')
    expect(screen.getByRole('button', { name: 'Sign out' })).toBeInTheDocument()
  })

  it('signs out without asking when nothing is waiting', async () => {
    const { user } = renderApp({ fullApp: true, signedOut: true, sheets: library(), route: '/login' })
    await user.click(signInButton())
    await screen.findByText('Dune')
    await user.click(screen.getByRole('button', { name: 'Sign out' }))
    expect(screen.queryByRole('dialog', { name: 'Sign out with unsent changes?' })).not.toBeInTheDocument()
    await waitFor(() => expect(location()).toBe('/login'))
  })

  it('full journey: save a change offline, sign out anyway, come back online, sign in, and it is sent automatically', async () => {
    const sheets = library()
    const drive = new FakeDrive()
    const outbox = new MemoryOutbox()
    const { network, fetchImpl } = switchableNetwork(sheets, drive)
    const { user, store } = renderApp({ fullApp: true, signedOut: true, sheets, drive, fetchImpl, outbox, route: '/login' })

    await user.click(signInButton())
    await user.click(await screen.findByRole('link', { name: /Dune/ }))
    await user.click(await screen.findByRole('button', { name: 'Borrow' }))
    network.offline = true
    const dlg = screen.getByRole('dialog', { name: 'Borrow this book' })
    await user.type(within(dlg).getByLabelText(/^Borrower/), 'Ravi')
    await user.click(within(dlg).getByRole('button', { name: 'Borrow' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(sheets.tabs.Borrowers).toHaveLength(1)

    await user.click(screen.getByRole('button', { name: 'Sign out' }))
    await user.click(within(screen.getByRole('dialog', { name: 'Sign out with unsent changes?' })).getByRole('button', { name: 'Sign out anyway' }))
    await waitFor(() => expect(location()).toBe('/login'))
    expect(store.getState().outbox.entries).toEqual([]) // the on-screen view is cleared...
    expect(outbox.records.size).toBe(1) // ...but the change is still safely stored on the device

    network.offline = false
    await user.click(signInButton())
    await waitFor(() => expect(sheets.tabs.Borrowers).toHaveLength(2)) // sent without pressing anything
    expect(sheets.tabs.Borrowers[1][1]).toBe('Ravi')
    await waitFor(() => expect(outbox.records.size).toBe(0))
    expect(location()).toBe('/')
    expect(await screen.findByText(/Ravi · since/)).toBeInTheDocument()
  })
})
