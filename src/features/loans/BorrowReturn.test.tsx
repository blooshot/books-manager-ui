import { act, fireEvent, screen, waitFor, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { FakeSheets } from '@/test/fakeSheets'
import { bookRow, loanRow } from '@/test/fixtures'
import { tokenExpired } from '@/store/sessionSlice'
import { renderApp } from '@/test/render'

/** Books.: B-0001 Dune, B-0002 Emma. Borrowers: whatever loans the test passes in. */
function library(loans: Parameters<typeof loanRow>[0][] = []) {
  const sheets = new FakeSheets()
  sheets.tabs.Books.push(bookRow({ id: 'B-0001', title: 'Dune', author: 'Herbert' }), bookRow({ id: 'B-0002', title: 'Emma', author: 'Austen' }))
  for (const loan of loans) sheets.tabs.Borrowers.push(loanRow(loan))
  return sheets
}
const dune = { bookId: 'B-0001', borrower: 'Ravi', date: '2026-09-01', time: '10:00', place: 'Office' }
const dialog = (name: string) => screen.getByRole('dialog', { name })
const loanRows = (sheets: FakeSheets) => sheets.tabs.Borrowers.slice(1)
const writes = (sheets: FakeSheets) => sheets.calls.filter((c) => c.method === 'POST')
const badge = () => screen.getByText(/^(Available|Borrowed)$/, { selector: '[data-slot="badge"]' })

async function openBorrow(options: Parameters<typeof renderApp>[0] = {}) {
  const view = renderApp({ route: '/books/B-0001', ...options })
  await view.user.click(await screen.findByRole('button', { name: 'Borrow' }))
  return { ...view, dlg: dialog('Borrow this book') }
}

describe('which actions are offered', () => {
  it('an available book can be borrowed, not returned', async () => {
    renderApp({ route: '/books/B-0001', sheets: library() })
    expect(await screen.findByRole('button', { name: 'Borrow' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Mark returned' })).not.toBeInTheDocument()
    expect(badge()).toHaveTextContent('Available')
  })

  it('a borrowed book can be returned (now, or earlier), not borrowed', async () => {
    renderApp({ route: '/books/B-0001', sheets: library([dune]) })
    expect(await screen.findByRole('button', { name: 'Mark returned' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Returned earlier…' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Borrow' })).not.toBeInTheDocument()
  })
})

describe('borrow dialog', () => {
  it('starts with today and the current time, and is a bottom sheet on phones', async () => {
    const { dlg } = await openBorrow({ sheets: library(), viewport: 'phone' })
    expect(dlg).toHaveAttribute('data-presentation', 'sheet')
    expect(within(dlg).getByLabelText(/^Date/)).toHaveValue('2026-09-18')
    expect(within(dlg).getByLabelText(/^Time/)).toHaveValue('14:05')
    expect(within(dlg).getByLabelText(/^Borrower/)).toHaveValue('')
    expect(dlg).toHaveAccessibleDescription(/Dune/)
  })

  it('is a centred dialog on desktop', async () => {
    const { dlg } = await openBorrow({ sheets: library(), viewport: 'desktop' })
    expect(dlg).toHaveAttribute('data-presentation', 'dialog')
  })

  it('closes with Cancel or Escape without saving anything', async () => {
    const { user, sheets } = await openBorrow({ sheets: library() })
    await user.click(within(dialog('Borrow this book')).getByRole('button', { name: 'Cancel' }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Borrow' }))
    await user.keyboard('{Escape}')
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(writes(sheets)).toHaveLength(0)
  })

  it('reopens blank after being cancelled', async () => {
    const { user } = await openBorrow({ sheets: library() })
    await user.type(within(dialog('Borrow this book')).getByLabelText(/^Borrower/), 'Half')
    await user.click(within(dialog('Borrow this book')).getByRole('button', { name: 'Cancel' }))
    await user.click(screen.getByRole('button', { name: 'Borrow' }))
    expect(within(dialog('Borrow this book')).getByLabelText(/^Borrower/)).toHaveValue('')
  })

  it('requires a borrower and a valid date, and sends nothing until they are fixed', async () => {
    const { user, dlg, sheets } = await openBorrow({ sheets: library() })
    fireEvent.change(within(dlg).getByLabelText(/^Date/), { target: { value: '' } })
    await user.click(within(dlg).getByRole('button', { name: 'Borrow' }))
    expect(within(dlg).getByText('Enter who is borrowing the book.')).toBeInTheDocument()
    expect(within(dlg).getByText('Enter a valid date.')).toBeInTheDocument()
    expect(within(dlg).getByLabelText(/^Borrower/)).toHaveAttribute('aria-invalid', 'true')
    expect(writes(sheets)).toHaveLength(0)
    expect(screen.getByRole('dialog')).toBeInTheDocument()
  })

  it('suggests each past borrower once, from all earlier loans', async () => {
    const sheets = library([
      { bookId: 'B-0002', borrower: 'ravi', date: '2026-01-01', returnedDate: '2026-01-05' },
      { bookId: 'B-0002', borrower: 'Asha', date: '2026-02-01', returnedDate: '2026-02-05' },
      { bookId: 'B-0002', borrower: 'RAVI', date: '2026-03-01', returnedDate: '2026-03-05' },
    ])
    const { dlg } = await openBorrow({ sheets })
    const options = [...dlg.querySelectorAll('datalist option')].map((o) => o.getAttribute('value'))
    expect(options).toEqual(['Asha', 'RAVI'])
    expect(within(dlg).getByLabelText(/^Borrower/)).toHaveAttribute('list')
  })

  it('records the loan: Sheet row, closed dialog, Borrowed status, history, and the Return actions', async () => {
    const { user, dlg, sheets } = await openBorrow({ sheets: library() })
    await user.type(within(dlg).getByLabelText(/^Borrower/), '  Ravi ')
    await user.type(within(dlg).getByLabelText(/^Place/), 'Office')
    await user.click(within(dlg).getByRole('button', { name: 'Borrow' }))

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(loanRows(sheets)).toHaveLength(1)
    expect(loanRows(sheets)[0].slice(0, 6)).toEqual(['B-0001', 'Ravi', '2026-09-18', '14:05', 'Office', 'No'])
    expect(badge()).toHaveTextContent('Borrowed')
    expect(screen.getByText(/with Ravi since/)).toBeInTheDocument()
    const history = screen.getByRole('region', { name: 'Borrow history' })
    expect(within(history).getByText('Still out')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Mark returned' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Borrow' })).not.toBeInTheDocument()
  })

  it('can record a loan from earlier (date and time editable)', async () => {
    const { user, dlg, sheets } = await openBorrow({ sheets: library() })
    await user.type(within(dlg).getByLabelText(/^Borrower/), 'Asha')
    fireEvent.change(within(dlg).getByLabelText(/^Date/), { target: { value: '2026-09-10' } })
    fireEvent.change(within(dlg).getByLabelText(/^Time/), { target: { value: '08:30' } })
    await user.click(within(dlg).getByRole('button', { name: 'Borrow' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(loanRows(sheets)[0].slice(2, 4)).toEqual(['2026-09-10', '08:30'])
  })

  it('on a failed write keeps the dialog and what was typed, leaves the book available, and works on retry', async () => {
    const { user, dlg, sheets } = await openBorrow({ sheets: library() })
    await user.type(within(dlg).getByLabelText(/^Borrower/), 'Ravi')
    sheets.failNextMethod = { method: 'POST', status: 500 }
    await user.click(within(dlg).getByRole('button', { name: 'Borrow' }))

    expect(await within(dlg).findByRole('alert')).toBeInTheDocument()
    expect(within(dlg).getByLabelText(/^Borrower/)).toHaveValue('Ravi')
    expect(within(dlg).getByRole('button', { name: 'Borrow' })).toBeEnabled()
    expect(loanRows(sheets)).toHaveLength(0)
    expect(badge()).toHaveTextContent('Available')

    await user.click(within(dlg).getByRole('button', { name: 'Borrow' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(loanRows(sheets)).toHaveLength(1)
  })

  it('when the list was out of date (someone else has it), explains and offers Refresh, which shows the truth', async () => {
    const sheets = library()
    const { user, dlg } = await openBorrow({ sheets })
    sheets.tabs.Borrowers.push(loanRow({ bookId: 'B-0001', borrower: 'Asha', date: '2026-09-15' })) // changed in the Sheet meanwhile
    await user.type(within(dlg).getByLabelText(/^Borrower/), 'Ravi')
    await user.click(within(dlg).getByRole('button', { name: 'Borrow' }))

    const alert = await within(dlg).findByRole('alert')
    expect(alert).toHaveTextContent('already borrowed by Asha')
    expect(alert).toHaveTextContent('out of date')
    expect(loanRows(sheets)).toHaveLength(1) // nothing added

    await user.click(within(alert).getByRole('button', { name: 'Refresh' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(await screen.findByText(/with Asha since/)).toBeInTheDocument()
    expect(badge()).toHaveTextContent('Borrowed')
  })

  it('on an expired session keeps the dialog and what was typed, says to reconnect, and saves nothing', async () => {
    const sheets = library()
    const { user, dlg, store } = await openBorrow({ sheets })
    await user.type(within(dlg).getByLabelText(/^Borrower/), 'Ravi')
    act(() => {
      store.dispatch(tokenExpired()) // the ~1 hour token ran out while the dialog was open
    })
    await user.click(within(dlg).getByRole('button', { name: 'Borrow' }))

    const alert = await within(dlg).findByRole('alert')
    expect(alert).toHaveTextContent(/reconnect/i)
    expect(alert).toHaveTextContent(/nothing was saved/i)
    expect(alert).not.toHaveTextContent(/out of date/i)
    expect(within(dlg).queryByRole('button', { name: 'Refresh' })).not.toBeInTheDocument()
    expect(within(dlg).getByLabelText(/^Borrower/)).toHaveValue('Ravi')
    expect(store.getState().session.status).toBe('expired')
    expect(screen.getByText(/Session expired/)).toBeInTheDocument() // the reconnect banner behind the dialog
    expect(loanRows(sheets)).toHaveLength(0)
    expect(badge()).toHaveTextContent('Available')
  })

  it('keeps the dialog open, with its state, while the save is in flight (the book flips to Borrowed optimistically)', async () => {
    const sheets = library()
    let release: () => void = () => undefined
    const gate = new Promise<void>((resolve) => (release = resolve))
    const fetchImpl: typeof fetch = async (input, init) => {
      if (String(input).includes(':append')) await gate
      return sheets.fetch(input, init)
    }
    const { user, dlg } = await openBorrow({ sheets, fetchImpl })
    await user.type(within(dlg).getByLabelText(/^Borrower/), 'Ravi')
    await user.click(within(dlg).getByRole('button', { name: 'Borrow' }))

    expect(within(dlg).getByRole('button', { name: 'Saving…' })).toBeDisabled()
    expect(dialog('Borrow this book')).toBe(dlg) // the same dialog, not a remounted one
    expect(within(dlg).getByLabelText(/^Borrower/)).toHaveValue('Ravi')
    release()
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
  })
})

describe('return', () => {
  it('one tap records the return now: Sheet row, Available status, history', async () => {
    const sheets = library([dune])
    const { user } = renderApp({ route: '/books/B-0001', sheets })
    await user.click(await screen.findByRole('button', { name: 'Mark returned' }))

    await waitFor(() => expect(badge()).toHaveTextContent('Available'))
    expect(loanRows(sheets)[0].slice(5)).toEqual(['Yes', '2026-09-18', '14:05'])
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(within(screen.getByRole('region', { name: 'Borrow history' })).getByText(/Returned/)).toHaveTextContent('Returned 2026-09-18 14:05')
    expect(screen.getByRole('button', { name: 'Borrow' })).toBeInTheDocument()
  })

  it('a failed return shows an error and the book stays borrowed', async () => {
    const sheets = library([dune])
    const { user } = renderApp({ route: '/books/B-0001', sheets })
    await screen.findByRole('button', { name: 'Mark returned' })
    sheets.failNextMethod = { method: 'POST', status: 500 }
    await user.click(screen.getByRole('button', { name: 'Mark returned' }))

    expect(await screen.findByRole('alert')).toBeInTheDocument()
    expect(badge()).toHaveTextContent('Borrowed')
    expect(loanRows(sheets)[0][5]).toBe('No')
    expect(screen.getByRole('button', { name: 'Mark returned' })).toBeEnabled()
  })

  it('when the loan was already closed elsewhere, explains and Refresh shows the truth', async () => {
    const sheets = library([dune])
    const { user } = renderApp({ route: '/books/B-0001', sheets })
    await screen.findByRole('button', { name: 'Mark returned' })
    sheets.tabs.Borrowers[1][5] = 'Yes'
    sheets.tabs.Borrowers[1][6] = '2026-09-10'
    await user.click(screen.getByRole('button', { name: 'Mark returned' }))

    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent('not currently borrowed')
    await user.click(within(alert).getByRole('button', { name: 'Refresh' }))
    await waitFor(() => expect(badge()).toHaveTextContent('Available'))
  })

  it('"Returned earlier…" records the chosen date and time', async () => {
    const sheets = library([dune])
    const { user } = renderApp({ route: '/books/B-0001', sheets })
    await user.click(await screen.findByRole('button', { name: 'Returned earlier…' }))
    const dlg = dialog('Return this book')
    expect(dlg).toHaveAccessibleDescription(/borrowed by Ravi on 2026-09-01 at 10:00/)
    expect(within(dlg).getByLabelText(/Date returned/)).toHaveValue('2026-09-18')
    fireEvent.change(within(dlg).getByLabelText(/Date returned/), { target: { value: '2026-09-10' } })
    fireEvent.change(within(dlg).getByLabelText(/Time returned/), { target: { value: '09:00' } })
    await user.click(within(dlg).getByRole('button', { name: 'Mark returned' }))

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(loanRows(sheets)[0].slice(5)).toEqual(['Yes', '2026-09-10', '09:00'])
    expect(badge()).toHaveTextContent('Available')
  })

  it('refuses a return dated before the book was borrowed, without saving', async () => {
    const sheets = library([dune])
    const { user } = renderApp({ route: '/books/B-0001', sheets })
    await user.click(await screen.findByRole('button', { name: 'Returned earlier…' }))
    const dlg = dialog('Return this book')
    fireEvent.change(within(dlg).getByLabelText(/Date returned/), { target: { value: '2026-08-31' } })
    sheets.calls = []
    await user.click(within(dlg).getByRole('button', { name: 'Mark returned' }))

    expect(within(dlg).getByText(/can't be returned before it was borrowed \(2026-09-01 10:00\)/)).toBeInTheDocument()
    expect(within(dlg).getByLabelText(/Date returned/)).toHaveAttribute('aria-invalid', 'true')
    expect(writes(sheets)).toHaveLength(0)
    expect(screen.getByRole('dialog')).toBeInTheDocument()
  })
})

describe('no destructive controls (ADR-0004)', () => {
  it('offers no delete or remove anywhere, including inside the dialogs', async () => {
    const { user } = renderApp({ route: '/books/B-0001', sheets: library() })
    await user.click(await screen.findByRole('button', { name: 'Borrow' }))
    expect(screen.queryByRole('button', { name: /delete|remove/i })).not.toBeInTheDocument()
  })
})
