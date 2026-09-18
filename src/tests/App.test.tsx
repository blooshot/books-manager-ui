import { act, screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { signIn, tokenExpired } from '@/store/sessionSlice'
import { FakeSheets } from '@/test/fakeSheets'
import { bookRow } from '@/test/fixtures'
import { NOW, renderApp } from '@/test/render'

const oneBook = () => {
  const sheets = new FakeSheets()
  sheets.tabs.Books.push(bookRow({ id: 'B-0001', title: 'Dune', author: 'Herbert' }))
  return sheets
}
const reads = (sheets: FakeSheets) => sheets.calls.filter((c) => c.url.includes('values:batchGet')).length

describe('sign-in gate', () => {
  it('shows the gate, not the app, when signed out', () => {
    renderApp({ signedOut: true, fullApp: true })
    expect(screen.getByRole('heading', { name: 'My Library' })).toBeInTheDocument()
    expect(screen.queryByRole('navigation')).not.toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Books' })).not.toBeInTheDocument()
  })
})

describe('layout', () => {
  it('desktop: the header menu has Books, Lent out and Add book, the current page marked; no sidebar, no bottom nav', async () => {
    renderApp({ sheets: oneBook(), viewport: 'desktop' })
    const nav = await screen.findByRole('navigation', { name: 'Main' })
    expect(within(nav).getByRole('link', { name: 'Books' })).toHaveAttribute('aria-current', 'page')
    expect(within(nav).getByRole('link', { name: 'Lent out' })).not.toHaveAttribute('aria-current')
    expect(within(nav).getByRole('link', { name: 'Add book' })).toHaveAttribute('href', '/books/new')
    expect(within(screen.getByRole('banner')).getByRole('navigation', { name: 'Main' })).toBe(nav)
    expect(screen.getAllByRole('navigation', { name: 'Main' })).toHaveLength(1)
    expect(screen.queryByRole('complementary')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /collapse sidebar/i })).not.toBeInTheDocument()
  })

  it('desktop: the header menu takes you to Lent out and to the add form', async () => {
    const { user } = renderApp({ sheets: oneBook(), viewport: 'desktop' })
    const nav = await screen.findByRole('navigation', { name: 'Main' })
    await user.click(within(nav).getByRole('link', { name: 'Lent out' }))
    expect(await screen.findByRole('heading', { name: 'Lent out' })).toBeInTheDocument()
    expect(within(nav).getByRole('link', { name: 'Lent out' })).toHaveAttribute('aria-current', 'page')
    await user.click(within(nav).getByRole('link', { name: 'Add book' }))
    expect(await screen.findByRole('heading', { name: 'Add book' })).toBeInTheDocument()
  })

  it('phone: a bottom nav and no header menu or sidebar', async () => {
    renderApp({ sheets: oneBook(), viewport: 'phone' })
    const nav = await screen.findByRole('navigation', { name: 'Main' })
    expect(within(nav).getByRole('link', { name: 'Books' })).toBeInTheDocument()
    expect(within(nav).queryByRole('link', { name: 'Add book' })).not.toBeInTheDocument()
    expect(within(screen.getByRole('banner')).queryByRole('navigation')).not.toBeInTheDocument()
    expect(screen.queryByRole('complementary')).not.toBeInTheDocument()
  })

  it('shows the signed-in email on wide screens', async () => {
    renderApp({ sheets: oneBook(), viewport: 'desktop' })
    expect(await screen.findByText('me@example.com')).toBeInTheDocument()
  })
})

describe('routing', () => {
  it('shows a not-found page with a way back for unknown URLs', async () => {
    const { user } = renderApp({ sheets: oneBook(), route: '/nope/nothing' })
    expect(await screen.findByRole('heading', { name: 'Page not found' })).toBeInTheDocument()
    await user.click(screen.getByRole('link', { name: 'Back to your books' }))
    expect(await screen.findByRole('heading', { name: 'Books' })).toBeInTheDocument()
  })

  it('opens a book from the list and returns with the search intact', async () => {
    const sheets = oneBook()
    sheets.tabs.Books.push(bookRow({ id: 'B-0002', title: 'Emma', author: 'Austen' }))
    const { user } = renderApp({ sheets, route: '/?q=dune' })
    await user.click(await screen.findByRole('link', { name: /Dune/ }))
    expect(await screen.findByRole('heading', { level: 1, name: 'Dune' })).toBeInTheDocument()
    expect(screen.getByTestId('location')).toHaveTextContent('/books/B-0001')
  })
})

describe('session', () => {
  it('signing out returns to the gate', async () => {
    const { user } = renderApp({ sheets: oneBook(), fullApp: true })
    await user.click(await screen.findByRole('button', { name: 'Sign out' }))
    expect(await screen.findByRole('heading', { name: 'My Library' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Sign out' })).not.toBeInTheDocument()
  })

  it('keeps the app on screen with a reconnect banner when the token expires', async () => {
    const { store } = renderApp({ sheets: oneBook() })
    await screen.findByText('Dune')
    act(() => {
      store.dispatch(tokenExpired())
    })
    expect(await screen.findByRole('button', { name: 'Reconnect' })).toBeInTheDocument()
    expect(screen.getByText('Dune')).toBeInTheDocument()
  })

  it('loads once on sign-in and reloads after a reconnect', async () => {
    const sheets = oneBook()
    const { store } = renderApp({ sheets })
    await screen.findByText('Dune')
    expect(reads(sheets)).toBe(1)

    act(() => {
      store.dispatch(tokenExpired())
    })
    sheets.tabs.Books.push(bookRow({ id: 'B-0002', title: 'Emma', author: 'Austen' }))
    act(() => {
      store.dispatch(signIn.fulfilled({ accessToken: 'test-token', expiresAt: NOW.getTime() + 3_600_000, email: 'me@example.com' }, 'req2', undefined))
    })
    expect(await screen.findByText('Emma')).toBeInTheDocument()
    expect(reads(sheets)).toBe(2)
  })
})
