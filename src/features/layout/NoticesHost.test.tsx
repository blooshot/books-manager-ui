import { screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { noticeAdded } from '@/store/noticesSlice'
import { renderApp } from '@/test/render'
import { act } from 'react'

describe('NoticesHost', () => {
  it('shows notices raised by the store and dismisses them one at a time', async () => {
    const { store, user } = renderApp()
    await screen.findByRole('heading', { name: 'Books' })
    expect(screen.queryByRole('button', { name: 'Dismiss notice' })).not.toBeInTheDocument()

    act(() => {
      store.dispatch(noticeAdded('First problem'))
      store.dispatch(noticeAdded('Second problem'))
    })
    expect(screen.getAllByRole('status').map((n) => n.textContent)).toEqual(expect.arrayContaining(['First problem', 'Second problem']))

    await user.click(screen.getAllByRole('button', { name: 'Dismiss notice' })[0])
    expect(screen.queryByText('First problem')).not.toBeInTheDocument()
    expect(screen.getByText('Second problem')).toBeInTheDocument()
  })
})
