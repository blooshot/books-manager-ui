import { act, screen, waitFor, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { signIn } from '@/store/sessionSlice'
import { FakeDrive } from '@/test/fakeDrive'
import { MemoryOutbox, UnavailableOutbox } from '@/test/fakeOutbox'
import { FakeSheets } from '@/test/fakeSheets'
import { bookRow, loanRow } from '@/test/fixtures'
import { switchableNetwork } from '@/test/network'
import { NOW, renderApp } from '@/test/render'
import { tokenExpired } from '@/store/sessionSlice'

function library() {
  const sheets = new FakeSheets()
  sheets.tabs.Books.push(bookRow({ id: 'B-0001', title: 'Dune', author: 'Herbert' }), bookRow({ id: 'B-0002', title: 'Emma', author: 'Austen' }))
  return sheets
}
const pendingList = () => screen.getByRole('list', { name: 'Pending changes' })
const badge = () => screen.getByText(/^(Available|Borrowed)$/, { selector: '[data-slot="badge"]' })
const pendingLink = (n: number) => screen.getByRole('link', { name: new RegExp(`Pending changes: ${n} waiting`) })
const loanRows = (sheets: FakeSheets) => sheets.tabs.Borrowers.slice(1)

async function borrowDune(user: ReturnType<typeof renderApp>['user'], name = 'Ravi') {
  await user.click(await screen.findByRole('button', { name: 'Borrow' }))
  const dlg = screen.getByRole('dialog', { name: 'Borrow this book' })
  await user.type(within(dlg).getByLabelText(/^Borrower/), name)
  await user.click(within(dlg).getByRole('button', { name: 'Borrow' }))
  await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
}

describe('Sync control', () => {
  it('has a Sync button and no pending indicator when nothing is waiting', async () => {
    renderApp({ sheets: library() })
    expect(await screen.findByRole('button', { name: 'Sync' })).toBeEnabled()
    expect(screen.queryByText(/pending/)).not.toBeInTheDocument()
  })

  it('Sync with nothing queued just reloads from the Sheet', async () => {
    const sheets = library()
    const { user } = renderApp({ sheets })
    await screen.findByText('Dune')
    sheets.tabs.Books.push(bookRow({ id: 'B-0003', title: 'Added by hand', author: 'Me' }))
    await user.click(screen.getByRole('button', { name: 'Sync' }))
    expect(await screen.findByText('Added by hand')).toBeInTheDocument()
  })

  it('is disabled, with a reason, when the session has expired', async () => {
    const { store } = renderApp({ sheets: library() })
    await screen.findByText('Dune')
    act(() => {
      store.dispatch(tokenExpired())
    })
    const button = screen.getByRole('button', { name: 'Sync' })
    expect(button).toBeDisabled()
    expect(button).toHaveAttribute('title', 'Reconnect to Google first')
  })

  it('shows "Syncing…" and cannot be pressed again while a sync runs', async () => {
    const sheets = library()
    const drive = new FakeDrive()
    const { network, fetchImpl } = switchableNetwork(sheets, drive)
    let hold = false
    let release: () => void = () => undefined
    const gate = new Promise<void>((resolve) => (release = resolve))
    const gated: typeof fetch = async (input, init) => {
      if (hold && init?.method === 'POST') await gate // the write is "in flight"
      return fetchImpl(input, init)
    }
    const { user } = renderApp({ route: '/books/B-0001', sheets, drive, fetchImpl: gated })
    await screen.findByRole('button', { name: 'Borrow' })
    network.offline = true
    await borrowDune(user) // queued
    network.offline = false
    hold = true

    await user.click(screen.getByRole('button', { name: 'Sync' }))
    const running = await screen.findByRole('button', { name: 'Syncing…' })
    expect(running).toBeDisabled()
    expect(loanRows(sheets)).toHaveLength(0)

    release()
    await waitFor(() => expect(screen.getByRole('button', { name: 'Sync' })).toBeEnabled())
    expect(loanRows(sheets)).toHaveLength(1)
    expect(screen.queryByText(/pending/)).not.toBeInTheDocument()
  })
})

describe('working offline, then syncing', () => {
  it('a borrow made offline shows as pending, survives a failed Sync, and is sent when back online', async () => {
    const sheets = library()
    const drive = new FakeDrive()
    const { network, fetchImpl } = switchableNetwork(sheets, drive)
    const { user, store } = renderApp({ route: '/books/B-0001', sheets, drive, fetchImpl })
    await screen.findByRole('button', { name: 'Borrow' })

    network.offline = true
    await borrowDune(user)
    expect(badge()).toHaveTextContent('Borrowed')
    expect(screen.getByText(/Saved on this device/)).toBeInTheDocument()
    expect(pendingLink(1)).toBeInTheDocument()
    expect(loanRows(sheets)).toHaveLength(0)

    await user.click(screen.getByRole('button', { name: 'Sync' })) // still offline
    expect(await screen.findByText(/Could not reach Google/)).toBeInTheDocument()
    expect(pendingLink(1)).toBeInTheDocument()
    expect(badge()).toHaveTextContent('Borrowed')

    network.offline = false
    await user.click(screen.getByRole('button', { name: 'Sync' }))
    await waitFor(() => expect(screen.queryByText(/1 pending/)).not.toBeInTheDocument())
    expect(loanRows(sheets)).toHaveLength(1)
    expect(loanRows(sheets)[0].slice(0, 6)).toEqual(['B-0001', 'Ravi', '2026-09-18', '14:05', '', 'No'])
    expect(badge()).toHaveTextContent('Borrowed')
    expect(store.getState().outbox.entries).toHaveLength(0)
  })

  it('an offline return and an offline edit are both sent, in order', async () => {
    const sheets = library()
    sheets.tabs.Borrowers.push(loanRow({ bookId: 'B-0001', borrower: 'Ravi', date: '2026-09-01', time: '10:00' }))
    const drive = new FakeDrive()
    const { network, fetchImpl } = switchableNetwork(sheets, drive)
    const { user } = renderApp({ route: '/books/B-0001', sheets, drive, fetchImpl })
    await screen.findByRole('button', { name: 'Mark returned' })

    network.offline = true
    await user.click(screen.getByRole('button', { name: 'Mark returned' }))
    await waitFor(() => expect(badge()).toHaveTextContent('Available'))
    expect(pendingLink(1)).toBeInTheDocument()

    network.offline = false
    await user.click(screen.getByRole('button', { name: 'Sync' }))
    await waitFor(() => expect(loanRows(sheets)[0][5]).toBe('Yes'))
    await waitFor(() => expect(screen.queryByText(/pending/)).not.toBeInTheDocument())
  })

  it('adding a book offline goes back to the list with a pending indicator, and Sync then adds it', async () => {
    const sheets = library()
    const drive = new FakeDrive()
    const { network, fetchImpl } = switchableNetwork(sheets, drive)
    const { user } = renderApp({ route: '/books/new', sheets, drive, fetchImpl })
    await screen.findByRole('heading', { name: 'Add book' })

    network.offline = true
    await user.type(screen.getByLabelText(/^Title/), 'Neuromancer')
    await user.type(screen.getByLabelText(/^Author/), 'Gibson')
    await user.click(screen.getByRole('button', { name: 'Save book' }))
    await waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent('/'))
    expect(pendingLink(1)).toBeInTheDocument()
    expect(sheets.tabs.Books).toHaveLength(3)

    network.offline = false
    await user.click(screen.getByRole('button', { name: 'Sync' }))
    expect(await screen.findByText('Neuromancer')).toBeInTheDocument()
    expect(sheets.tabs.Books).toHaveLength(4)
    expect(sheets.tabs.Books[3][1]).toBe('Neuromancer')
  })

  it('an edit made offline shows on the book page and is sent on Sync', async () => {
    const sheets = library()
    const drive = new FakeDrive()
    const { network, fetchImpl } = switchableNetwork(sheets, drive)
    const { user } = renderApp({ route: '/books/B-0001/edit', sheets, drive, fetchImpl })
    await screen.findByRole('heading', { name: 'Edit book' })

    network.offline = true
    await user.clear(screen.getByLabelText(/^Title/))
    await user.type(screen.getByLabelText(/^Title/), 'Dune Messiah')
    await user.click(screen.getByRole('button', { name: 'Save changes' }))
    expect(await screen.findByRole('heading', { level: 1, name: 'Dune Messiah' })).toBeInTheDocument()
    expect(pendingLink(1)).toBeInTheDocument()

    network.offline = false
    await user.click(screen.getByRole('button', { name: 'Sync' }))
    await waitFor(() => expect(sheets.tabs.Books[1][1]).toBe('Dune Messiah'))
  })

  it('a queued change survives a reload and is sent automatically when the app starts online', async () => {
    const sheets = library()
    const drive = new FakeDrive()
    const outbox = new MemoryOutbox()
    const { network, fetchImpl } = switchableNetwork(sheets, drive)
    const first = renderApp({ route: '/books/B-0001', sheets, drive, fetchImpl, outbox })
    await screen.findByRole('button', { name: 'Borrow' })
    network.offline = true
    await borrowDune(first.user)
    expect(pendingLink(1)).toBeInTheDocument()
    first.unmount()

    network.offline = false
    renderApp({ route: '/books/B-0001', sheets, drive, fetchImpl, outbox })
    await waitFor(() => expect(loanRows(sheets)).toHaveLength(1)) // sent without pressing anything
    await waitFor(() => expect(screen.queryByText(/pending/)).not.toBeInTheDocument())
    expect(await screen.findByText(/with Ravi since/)).toBeInTheDocument()
  })

  it('a reload while still offline shows the pending indicator from the stored queue', async () => {
    const sheets = library()
    const drive = new FakeDrive()
    const outbox = new MemoryOutbox()
    const { network, fetchImpl } = switchableNetwork(sheets, drive)
    const first = renderApp({ route: '/books/B-0001', sheets, drive, fetchImpl, outbox })
    await screen.findByRole('button', { name: 'Borrow' })
    network.offline = true
    await borrowDune(first.user)
    first.unmount()

    renderApp({ route: '/', sheets, drive, fetchImpl, outbox }) // still offline
    expect(await screen.findByRole('link', { name: /Pending changes: 1 waiting/ })).toBeInTheDocument()
  })

  it('reconnecting after the session expired sends what was saved meanwhile', async () => {
    const sheets = library()
    const { user, store } = renderApp({ route: '/books/B-0001', sheets })
    await screen.findByRole('button', { name: 'Borrow' })
    sheets.token = 'a-different-token' // the token stops working
    await borrowDune(user)
    expect(store.getState().session.status).toBe('expired')
    expect(pendingLink(1)).toBeInTheDocument()

    sheets.token = 'fresh-token'
    act(() => {
      store.dispatch(signIn.fulfilled({ accessToken: 'fresh-token', expiresAt: NOW.getTime() + 3_600_000, email: 'me@example.com' }, 'req', undefined))
    })
    await waitFor(() => expect(loanRows(sheets)).toHaveLength(1))
    await waitFor(() => expect(screen.queryByText(/pending/)).not.toBeInTheDocument())
  })

  it('when someone else borrowed the book meanwhile, the change is marked failed and explained, and nothing is overwritten', async () => {
    const sheets = library()
    const drive = new FakeDrive()
    const { network, fetchImpl } = switchableNetwork(sheets, drive)
    const { user } = renderApp({ route: '/books/B-0001', sheets, drive, fetchImpl })
    await screen.findByRole('button', { name: 'Borrow' })
    network.offline = true
    await borrowDune(user)
    network.offline = false
    sheets.tabs.Borrowers.push(loanRow({ bookId: 'B-0001', borrower: 'Asha', date: '2026-09-15' }))

    await user.click(screen.getByRole('button', { name: 'Sync' }))
    expect(await screen.findByText(/1 change could not be applied/)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /Pending changes: 0 waiting, 1 failed/ })).toBeInTheDocument()
    expect(loanRows(sheets)).toHaveLength(1)
    expect(loanRows(sheets)[0][1]).toBe('Asha')
  })
})

describe('Pending changes page', () => {
  async function withQueuedBorrow(options: { unavailable?: boolean } = {}) {
    const sheets = library()
    const drive = new FakeDrive()
    const { network, fetchImpl } = switchableNetwork(sheets, drive)
    const view = renderApp({ route: '/books/B-0001', sheets, drive, fetchImpl, outbox: options.unavailable ? new UnavailableOutbox() : undefined })
    await screen.findByRole('button', { name: 'Borrow' })
    network.offline = true
    if (!options.unavailable) await borrowDune(view.user)
    return { ...view, sheets, network }
  }

  it('is reached from the pending indicator and lists what is waiting', async () => {
    const { user } = await withQueuedBorrow()
    await user.click(pendingLink(1))
    expect(await screen.findByRole('heading', { name: 'Pending changes' })).toBeInTheDocument()
    const item = within(screen.getByRole('list', { name: 'Pending changes' })).getByRole('listitem')
    expect(item).toHaveTextContent('Lend “Dune” to Ravi')
    expect(item).toHaveTextContent('Pending')
  })

  it('says so when nothing is waiting', async () => {
    renderApp({ route: '/pending', sheets: library() })
    expect(await screen.findByText('Nothing is waiting to be sent.')).toBeInTheDocument()
  })

  it('discarding needs a second confirming press, and "Keep it" backs out', async () => {
    const { user, sheets } = await withQueuedBorrow()
    await user.click(pendingLink(1))
    await screen.findByRole('heading', { name: 'Pending changes' })
    const item = () => within(pendingList()).getByRole('listitem')
    await user.click(within(item()).getByRole('button', { name: 'Discard…' }))
    await user.click(within(item()).getByRole('button', { name: 'Keep it' }))
    expect(item()).toHaveTextContent('Lend “Dune” to Ravi') // still queued

    await user.click(within(item()).getByRole('button', { name: 'Discard…' }))
    await user.click(within(item()).getByRole('button', { name: 'Discard this change' }))
    expect(await screen.findByText('Nothing is waiting to be sent.')).toBeInTheDocument()
    expect(screen.queryByRole('list', { name: 'Pending changes' })).not.toBeInTheDocument()
    expect(loanRows(sheets)).toHaveLength(0)
  })

  it('shows why a change failed, and Retry sends it once the conflict is gone', async () => {
    const { user, sheets, network } = await withQueuedBorrow()
    network.offline = false
    sheets.tabs.Borrowers.push(loanRow({ bookId: 'B-0001', borrower: 'Asha', date: '2026-09-15' }))
    await user.click(screen.getByRole('button', { name: 'Sync' }))
    await user.click(await screen.findByRole('link', { name: /1 failed/ }))

    await screen.findByRole('heading', { name: 'Pending changes' })
    const item = within(pendingList()).getByRole('listitem')
    expect(item).toHaveTextContent('Failed')
    expect(within(item).getByRole('alert')).toHaveTextContent('already borrowed by Asha')

    sheets.tabs.Borrowers[1][5] = 'Yes' // Asha returned it
    sheets.tabs.Borrowers[1][6] = '2026-09-16'
    sheets.tabs.Borrowers[1][7] = '10:00'
    await user.click(within(item).getByRole('button', { name: 'Retry' }))
    await waitFor(() => expect(loanRows(sheets)).toHaveLength(2))
    expect(await screen.findByText('Nothing is waiting to be sent.')).toBeInTheDocument()
  })

  it('warns when this browser cannot keep a queue, and a failed save is then reported, not queued', async () => {
    const { user, network } = await withQueuedBorrow({ unavailable: true })
    network.offline = true
    await user.click(screen.getByRole('button', { name: 'Borrow' }))
    const dlg = screen.getByRole('dialog', { name: 'Borrow this book' })
    await user.type(within(dlg).getByLabelText(/^Borrower/), 'Ravi')
    await user.click(within(dlg).getByRole('button', { name: 'Borrow' }))
    expect(await within(dlg).findByRole('alert')).toBeInTheDocument() // reported
    expect(badge()).toHaveTextContent('Available') // and undone
    await user.click(within(dlg).getByRole('button', { name: 'Cancel' }))
    expect(screen.queryByText(/pending/)).not.toBeInTheDocument()
  })

  it('offers no way to delete anything from the Sheet or Drive', async () => {
    const { user } = await withQueuedBorrow()
    await user.click(pendingLink(1))
    await screen.findByRole('heading', { name: 'Pending changes' })
    expect(screen.queryByRole('button', { name: /delete|remove/i })).not.toBeInTheDocument() // "Discard…" drops only the local, unsent change
  })
})
