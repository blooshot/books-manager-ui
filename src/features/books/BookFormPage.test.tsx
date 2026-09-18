import 'fake-indexeddb/auto'
import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import type { UserEvent } from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { getCoverFromCache } from '@/services/drive/coverCache'
import { createDriveFileUrl, getDriveFileIdFromUrl } from '@/services/drive/links'
import { FakeDrive } from '@/test/fakeDrive'
import { FakeSheets } from '@/test/fakeSheets'
import { bookRow } from '@/test/fixtures'
import { STUB_FULL_BYTES, STUB_THUMB_BYTES, stubBrowserImaging } from '@/test/imaging'
import { renderApp } from '@/test/render'

const DRAFT_KEY = 'bm.draft.book:new'
const PHOTO_COLUMN = 6
let restoreImaging: () => void
let drive: FakeDrive

beforeEach(async () => {
  restoreImaging = stubBrowserImaging()
  drive = new FakeDrive()
  await new Promise<void>((resolve, reject) => {
    const request = indexedDB.deleteDatabase('BookCoversCache')
    request.onsuccess = () => resolve()
    request.onerror = () => reject(new Error('could not reset the test database'))
  })
})
afterEach(() => restoreImaging())

const duneSheet = (photo?: string) => {
  const sheets = new FakeSheets()
  sheets.tabs.Books.push(bookRow({ id: 'B-0001', title: 'Dune', author: 'Herbert', purchaseDate: '2025-12-31', pricePaid: 500, marketPrice: 1200.5, photo }))
  return sheets
}
const field = (label: RegExp) => screen.getByLabelText(label)
const location = () => screen.getByTestId('location').textContent
const writes = (sheets: FakeSheets) => sheets.calls.filter((c) => c.method === 'POST')
const bytesOf = async (blob: Blob | null) => (blob ? [...new Uint8Array(await blob.arrayBuffer())] : null)

async function fillAdd(user: UserEvent, values: { title?: string; author?: string; price?: string } = {}) {
  await user.type(field(/^Title/), values.title ?? 'Dune')
  await user.type(field(/^Author/), values.author ?? 'Herbert')
  if (values.price) await user.type(field(/Price paid/), values.price)
}
async function pickPhoto(user: UserEvent) {
  await user.upload(screen.getByLabelText('Cover photo file'), new File(['raw'], 'cover.jpg', { type: 'image/jpeg' }))
}

describe('Add book form', () => {
  it('opens from the list with a read-only Book ID placeholder', async () => {
    const { user } = renderApp({ sheets: duneSheet(), drive })
    await user.click(await screen.findByRole('link', { name: 'Add book' }))
    expect(location()).toBe('/books/new')
    expect(screen.getByRole('heading', { name: 'Add book' })).toBeInTheDocument()
    expect(field(/^Book ID/)).toBeDisabled()
    expect(field(/^Book ID/)).toHaveValue('Assigned when saved')
  })

  it('requires title and author: shows the errors, focuses the first bad field, and sends nothing', async () => {
    const { user, sheets } = renderApp({ route: '/books/new', drive })
    await user.click(screen.getByRole('button', { name: 'Save book' }))
    expect(screen.getByText('Title is required.')).toBeInTheDocument()
    expect(screen.getByText('Author is required.')).toBeInTheDocument()
    expect(field(/^Title/)).toHaveAttribute('aria-invalid', 'true')
    expect(field(/^Title/)).toHaveAccessibleDescription('Title is required.')
    await waitFor(() => expect(field(/^Title/)).toHaveFocus())
    expect(writes(sheets)).toHaveLength(0)
    expect(location()).toBe('/books/new')
  })

  it('clears an error as soon as the field is fixed', async () => {
    const { user } = renderApp({ route: '/books/new', drive })
    await user.click(screen.getByRole('button', { name: 'Save book' }))
    await user.type(field(/^Title/), 'Dune')
    expect(screen.queryByText('Title is required.')).not.toBeInTheDocument()
    expect(field(/^Title/)).not.toHaveAttribute('aria-invalid')
    expect(screen.getByText('Author is required.')).toBeInTheDocument()
  })

  it('rejects a bad amount on its own field, and accepts thousands separators', async () => {
    const { user, sheets } = renderApp({ route: '/books/new', drive })
    await fillAdd(user, { price: 'free' })
    await user.click(screen.getByRole('button', { name: 'Save book' }))
    expect(screen.getByText('Enter an amount such as 1299.50.')).toBeInTheDocument()
    expect(writes(sheets)).toHaveLength(0)

    await user.clear(field(/Price paid/))
    await user.type(field(/Price paid/), '1,299.50')
    await user.click(screen.getByRole('button', { name: 'Save book' }))
    await waitFor(() => expect(location()).toBe('/books/B-0001'))
    expect(sheets.tabs.Books[1][4]).toBe('1299.5')
  })

  it('saves without a photo: a row is appended, no Drive call is made, and the book page opens', async () => {
    const { user, sheets } = renderApp({ route: '/books/new', drive })
    await fillAdd(user, { price: '500' })
    fireEvent.change(field(/Purchase date/), { target: { value: '2025-12-31' } })
    await user.click(screen.getByRole('button', { name: 'Save book' }))

    expect(await screen.findByRole('heading', { level: 1, name: 'Dune' })).toBeInTheDocument()
    expect(location()).toBe('/books/B-0001')
    expect(sheets.tabs.Books[1].slice(0, 6)).toEqual(['B-0001', 'Dune', 'Herbert', '2025-12-31', '500', ''])
    expect(drive.calls).toHaveLength(0)
    expect(screen.getByText('B-0001')).toBeInTheDocument()
  })

  it('saves with a photo: preview shown, cover uploaded before the row, link stored, cache filled', async () => {
    const { user, sheets } = renderApp({ route: '/books/new', drive })
    await fillAdd(user)
    await pickPhoto(user)
    expect(await screen.findByRole('img', { name: 'Selected cover' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Replace photo' })).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Save book' }))
    await waitFor(() => expect(location()).toBe('/books/B-0001'))

    const [file] = [...drive.files.values()].filter((f) => f.bytes)
    expect(file.name).toBe('B-0001.jpg')
    expect([...(file.bytes ?? [])]).toEqual(STUB_FULL_BYTES)
    expect(sheets.tabs.Books[1][PHOTO_COLUMN]).toBe(createDriveFileUrl(file.id))
    expect(await bytesOf(await getCoverFromCache(file.id, 'thumb'))).toEqual(STUB_THUMB_BYTES)
    expect(await screen.findByRole('img', { name: 'Cover of Dune' })).toBeInTheDocument()
  })

  it('says so when the photo cannot be read, and still saves the book without it', async () => {
    restoreImaging()
    restoreImaging = stubBrowserImaging({ decodeFails: true })
    const { user, sheets } = renderApp({ route: '/books/new', drive })
    await fillAdd(user)
    await pickPhoto(user)
    expect(await screen.findByRole('alert')).toHaveTextContent('could not be read')
    expect(screen.queryByRole('img', { name: 'Selected cover' })).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Save book' }))
    await waitFor(() => expect(location()).toBe('/books/B-0001'))
    expect(drive.calls).toHaveLength(0)
    expect(sheets.tabs.Books[1][PHOTO_COLUMN]).toBe('')
  })

  it('"Clear selection" drops a chosen photo before saving (it cannot delete a saved cover)', async () => {
    const { user } = renderApp({ route: '/books/new', drive })
    await fillAdd(user)
    await pickPhoto(user)
    await user.click(await screen.findByRole('button', { name: 'Clear selection' }))
    expect(screen.queryByRole('img', { name: 'Selected cover' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Add photo' })).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Save book' }))
    await waitFor(() => expect(location()).toBe('/books/B-0001'))
    expect(drive.calls).toHaveLength(0)
  })

  it('warns about a duplicate title and author, links to it, and still lets you save', async () => {
    const sheets = duneSheet()
    const { user } = renderApp({ route: '/books/new', sheets, drive })
    await screen.findByRole('heading', { name: 'Add book' })
    await waitFor(() => expect(sheets.calls.length).toBeGreaterThan(0))
    await fillAdd(user, { title: ' dune ', author: 'HERBERT' })
    const warning = await screen.findByText(/already exists/)
    expect(within(warning).getByRole('link', { name: 'B-0001' })).toHaveAttribute('href', '/books/B-0001')

    await user.click(screen.getByRole('button', { name: 'Save book' }))
    await waitFor(() => expect(location()).toBe('/books/B-0002'))
    expect(sheets.tabs.Books).toHaveLength(3)
  })

  it('offers no delete or remove control (ADR-0004)', () => {
    renderApp({ route: '/books/new', drive })
    expect(screen.queryByRole('button', { name: /delete|remove/i })).not.toBeInTheDocument()
  })
})

describe('saving problems', () => {
  it('keeps the form filled and shows the error when the Sheet write fails, then succeeds on retry', async () => {
    const { user, sheets } = renderApp({ route: '/books/new', drive })
    await fillAdd(user, { price: '500' })
    sheets.failNextMethod = { method: 'POST', status: 500 }
    await user.click(screen.getByRole('button', { name: 'Save book' }))

    expect(await screen.findByRole('alert')).toBeInTheDocument()
    expect(location()).toBe('/books/new')
    expect(field(/^Title/)).toHaveValue('Dune')
    expect(field(/Price paid/)).toHaveValue('500')
    expect(screen.getByRole('button', { name: 'Save book' })).toBeEnabled()
    expect(sheets.tabs.Books).toHaveLength(1)

    await user.click(screen.getByRole('button', { name: 'Save book' }))
    await waitFor(() => expect(location()).toBe('/books/B-0001'))
  })

  it('on an expired session: saves the book on this device, goes back to the list, and shows it as pending', async () => {
    const sheets = new FakeSheets()
    sheets.token = 'a-different-token' // Google rejects the token the app holds
    const { user, store } = renderApp({ route: '/books/new', sheets, drive })
    await waitFor(() => expect(store.getState().session.status).toBe('expired')) // the initial load already saw the 401
    await fillAdd(user)
    await user.click(screen.getByRole('button', { name: 'Save book' }))

    await waitFor(() => expect(location()).toBe('/'))
    expect(screen.getByText(/Saved on this device/)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /Pending changes: 1 waiting/ })).toBeInTheDocument()
    expect(store.getState().outbox.entries[0]).toMatchObject({ status: 'pending', summary: 'Add “Dune” by Herbert' })
    expect(sessionStorage.getItem(DRAFT_KEY)).toBeNull() // saved (locally), so the draft is done
    expect(writes(sheets)).toHaveLength(0)
  })

  it('shows "Saving…" and locks the form while the request is in flight', async () => {
    const sheets = new FakeSheets()
    let release: () => void = () => undefined
    const gate = new Promise<void>((resolve) => (release = resolve))
    const fetchImpl: typeof fetch = async (input, init) => {
      if (String(input).includes(':append')) await gate
      return sheets.fetch(input, init)
    }
    const { user } = renderApp({ route: '/books/new', sheets, drive, fetchImpl })
    await fillAdd(user)
    await user.click(screen.getByRole('button', { name: 'Save book' }))

    expect(screen.getByRole('button', { name: 'Saving…' })).toBeDisabled()
    expect(field(/^Title/)).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeDisabled()
    release()
    await waitFor(() => expect(location()).toBe('/books/B-0001'))
  })
})

describe('unsaved drafts', () => {
  it('survives a reload: restored with a notice, and Discard goes back to a blank form', async () => {
    const first = renderApp({ route: '/books/new', drive })
    await first.user.type(field(/^Title/), 'Half typed')
    await first.user.type(field(/Price paid/), '99')
    expect(JSON.parse(sessionStorage.getItem(DRAFT_KEY) ?? '{}')).toMatchObject({ title: 'Half typed', pricePaid: '99' })
    first.unmount()

    const second = renderApp({ route: '/books/new', drive })
    expect(screen.getByRole('status')).toHaveTextContent('Restored your unsaved changes.')
    expect(field(/^Title/)).toHaveValue('Half typed')
    expect(field(/Price paid/)).toHaveValue('99')

    await second.user.click(screen.getByRole('button', { name: 'Discard' }))
    expect(field(/^Title/)).toHaveValue('')
    expect(sessionStorage.getItem(DRAFT_KEY)).toBeNull()
    expect(screen.queryByText('Restored your unsaved changes.')).not.toBeInTheDocument()
  })

  it('never stores a photo or a token in the draft', async () => {
    const { user } = renderApp({ route: '/books/new', drive })
    await fillAdd(user)
    await pickPhoto(user)
    await screen.findByRole('img', { name: 'Selected cover' })
    const stored = sessionStorage.getItem(DRAFT_KEY) ?? ''
    expect(Object.keys(JSON.parse(stored)).sort()).toEqual(['author', 'marketPrice', 'pricePaid', 'purchaseDate', 'title'])
    expect(stored).not.toContain('test-token')
  })

  it('is cleared by a successful save', async () => {
    const { user } = renderApp({ route: '/books/new', drive })
    await fillAdd(user)
    expect(sessionStorage.getItem(DRAFT_KEY)).not.toBeNull()
    await user.click(screen.getByRole('button', { name: 'Save book' }))
    await waitFor(() => expect(location()).toBe('/books/B-0001'))
    expect(sessionStorage.getItem(DRAFT_KEY)).toBeNull()
  })

  it('is cleared by Cancel', async () => {
    const { user } = renderApp({ route: '/books/new', drive })
    await fillAdd(user)
    await user.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(location()).toBe('/')
    expect(sessionStorage.getItem(DRAFT_KEY)).toBeNull()
  })

  it('ignores a corrupt or foreign draft instead of crashing', () => {
    sessionStorage.setItem(DRAFT_KEY, '{"title": 1, "author": ["x"]}')
    renderApp({ route: '/books/new', drive })
    expect(field(/^Title/)).toHaveValue('')
    expect(screen.queryByText('Restored your unsaved changes.')).not.toBeInTheDocument()
  })

  it('does not "restore" a draft identical to the saved values', async () => {
    sessionStorage.setItem('bm.draft.book:B-0001', JSON.stringify({ title: 'Dune', author: 'Herbert', purchaseDate: '2025-12-31', pricePaid: '500', marketPrice: '1200.5' }))
    renderApp({ route: '/books/B-0001/edit', sheets: duneSheet(), drive })
    await screen.findByRole('heading', { name: 'Edit book' })
    expect(screen.queryByText('Restored your unsaved changes.')).not.toBeInTheDocument()
  })
})

describe('Edit book form', () => {
  it('is reached from the detail page and starts with the saved values', async () => {
    const { user } = renderApp({ route: '/books/B-0001', sheets: duneSheet(), drive })
    await user.click(await screen.findByRole('link', { name: 'Edit' }))
    expect(location()).toBe('/books/B-0001/edit')
    expect(await screen.findByRole('heading', { name: 'Edit book' })).toBeInTheDocument()
    expect(field(/^Book ID/)).toHaveValue('B-0001')
    expect(field(/^Book ID/)).toBeDisabled()
    expect(field(/^Title/)).toHaveValue('Dune')
    expect(field(/^Author/)).toHaveValue('Herbert')
    expect(field(/Purchase date/)).toHaveValue('2025-12-31')
    expect(field(/Price paid/)).toHaveValue('500')
    expect(field(/Market price/)).toHaveValue('1200.5')
  })

  it('writes only the changed cell, makes no Drive calls, and returns to the book', async () => {
    const { user, sheets } = renderApp({ route: '/books/B-0001/edit', sheets: duneSheet(), drive })
    await screen.findByRole('heading', { name: 'Edit book' })
    await user.clear(field(/^Title/))
    await user.type(field(/^Title/), 'Dune Messiah')
    sheets.calls = []
    await user.click(screen.getByRole('button', { name: 'Save changes' }))

    await waitFor(() => expect(location()).toBe('/books/B-0001'))
    expect(sheets.tabs.Books[1][1]).toBe('Dune Messiah')
    expect(writes(sheets).map((c) => c.body)).toEqual([{ valueInputOption: 'USER_ENTERED', data: [{ range: 'Books!B2', values: [['Dune Messiah']] }] }])
    expect(drive.calls).toHaveLength(0)
    expect(await screen.findByRole('heading', { level: 1, name: 'Dune Messiah' })).toBeInTheDocument()
  })

  it('sends nothing when nothing changed', async () => {
    const { user, sheets } = renderApp({ route: '/books/B-0001/edit', sheets: duneSheet(), drive })
    await screen.findByRole('heading', { name: 'Edit book' })
    sheets.calls = []
    await user.click(screen.getByRole('button', { name: 'Save changes' }))
    await waitFor(() => expect(location()).toBe('/books/B-0001'))
    expect(sheets.calls).toHaveLength(0)
    expect(drive.calls).toHaveLength(0)
  })

  it('clears an optional cell when its field is emptied', async () => {
    const { user, sheets } = renderApp({ route: '/books/B-0001/edit', sheets: duneSheet(), drive })
    await screen.findByRole('heading', { name: 'Edit book' })
    await user.clear(field(/Market price/))
    await user.click(screen.getByRole('button', { name: 'Save changes' }))
    await waitFor(() => expect(location()).toBe('/books/B-0001'))
    expect(sheets.tabs.Books[1][5]).toBe('')
    expect(sheets.tabs.Books[1][4]).toBe('500')
  })

  it('a new photo uploads, updates the Photo cell, and renames (never deletes) the old cover', async () => {
    const old = drive.seed({ name: 'B-0001.jpg', mimeType: 'image/jpeg', bytes: new Uint8Array([1, 2, 3]) })
    const { user, sheets } = renderApp({ route: '/books/B-0001/edit', sheets: duneSheet(createDriveFileUrl(old.id)), drive })
    await screen.findByRole('heading', { name: 'Edit book' })
    expect(screen.getByText('The current cover stays unless you choose a new photo.')).toBeInTheDocument()
    await pickPhoto(user)
    await screen.findByRole('img', { name: 'Selected cover' })
    await user.click(screen.getByRole('button', { name: 'Save changes' }))
    await waitFor(() => expect(location()).toBe('/books/B-0001'))

    const newId = getDriveFileIdFromUrl(sheets.tabs.Books[1][PHOTO_COLUMN]) ?? ''
    expect(newId).not.toBe(old.id)
    expect([...(drive.files.get(newId)?.bytes ?? [])]).toEqual(STUB_FULL_BYTES)
    expect(drive.files.get(old.id)?.name).toBe('deleted-file-B-0001.jpg')
    expect(drive.files.get(old.id)?.trashed).toBe(false)
    expect(drive.calls.map((c) => c.method)).not.toContain('DELETE')
  })

  it('keeps the form and shows the error when the write fails; the book is unchanged', async () => {
    const { user, sheets } = renderApp({ route: '/books/B-0001/edit', sheets: duneSheet(), drive })
    await screen.findByRole('heading', { name: 'Edit book' })
    await user.clear(field(/^Title/))
    await user.type(field(/^Title/), 'Nope')
    sheets.failNextMethod = { method: 'POST', status: 500 }
    await user.click(screen.getByRole('button', { name: 'Save changes' }))

    expect(await screen.findByRole('alert')).toBeInTheDocument()
    expect(field(/^Title/)).toHaveValue('Nope')
    expect(location()).toBe('/books/B-0001/edit')
    expect(sheets.tabs.Books[1][1]).toBe('Dune')

    await user.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(await screen.findByRole('heading', { level: 1, name: 'Dune' })).toBeInTheDocument() // store rolled back
  })

  it('validates like the add form', async () => {
    const { user, sheets } = renderApp({ route: '/books/B-0001/edit', sheets: duneSheet(), drive })
    await screen.findByRole('heading', { name: 'Edit book' })
    await user.clear(field(/^Author/))
    sheets.calls = []
    await user.click(screen.getByRole('button', { name: 'Save changes' }))
    expect(screen.getByText('Author is required.')).toBeInTheDocument()
    expect(sheets.calls).toHaveLength(0)
  })

  it('does not warn that a book duplicates itself', async () => {
    renderApp({ route: '/books/B-0001/edit', sheets: duneSheet(), drive })
    await screen.findByRole('heading', { name: 'Edit book' })
    expect(screen.queryByText(/already exists/)).not.toBeInTheDocument()
  })

  it('shows loading, then not-found, for an unknown book', async () => {
    renderApp({ route: '/books/B-9999/edit', sheets: duneSheet(), drive })
    expect(screen.getByRole('status')).toHaveTextContent('Loading your library')
    expect(await screen.findByRole('alert')).toHaveTextContent('B-9999 was not found')
  })

  it('offers no delete or remove control', async () => {
    renderApp({ route: '/books/B-0001/edit', sheets: duneSheet(), drive })
    await screen.findByRole('heading', { name: 'Edit book' })
    expect(screen.queryByRole('button', { name: /delete|remove/i })).not.toBeInTheDocument()
  })
})
