import { render, screen, waitFor } from '@testing-library/react'
import { Provider } from 'react-redux'
import { describe, expect, it, vi } from 'vitest'
import { CoverImage } from '@/features/covers/CoverImage'
import { CoverProvider } from '@/features/covers/CoverProvider'
import { SessionExpiredError } from '@/services/google/errors'
import type { CoverLoader } from '@/services/drive/covers'
import { makeStore } from '@/store'
import { signIn } from '@/store/sessionSlice'
import { stubCoverLoader, NOW } from '@/test/render'

const ID = '1aBcDeFgHiJkLmNoPqRsTuVwXyZ123456'
const LINK = `https://drive.google.com/file/d/${ID}/view?usp=drivesdk`

function setup(loader: CoverLoader, book = { title: 'Dune', photoUrl: LINK as string | undefined }, variant: 'thumb' | 'full' = 'thumb') {
  const store = makeStore()
  store.dispatch(signIn.fulfilled({ accessToken: 't', expiresAt: NOW.getTime() + 3_600_000, email: 'me@example.com' }, 'req', undefined))
  render(
    <Provider store={store}>
      <CoverProvider loader={loader}>
        <CoverImage book={book} variant={variant} />
      </CoverProvider>
    </Provider>,
  )
  return store
}

describe('CoverImage', () => {
  it('shows a busy placeholder while loading, then the image', async () => {
    let resolve: (url: string) => void = () => undefined
    const loader: CoverLoader = { getCoverUrl: () => new Promise((r) => (resolve = r)), releaseAll: () => undefined }
    setup(loader)
    expect(screen.getByRole('img', { name: 'Loading cover for Dune' })).toHaveAttribute('aria-busy', 'true')
    resolve('blob:x/1')
    expect(await screen.findByRole('img', { name: 'Cover of Dune' })).toHaveAttribute('src', 'blob:x/1')
  })

  it('asks the loader for the requested variant of the file named in the link', async () => {
    const loader = stubCoverLoader()
    setup(loader, { title: 'Dune', photoUrl: LINK }, 'full')
    await screen.findByRole('img', { name: 'Cover of Dune' })
    expect(loader.getCoverUrl).toHaveBeenCalledWith(ID, 'full')
  })

  it.each([
    ['no photo link', undefined],
    ['a link that is not a Drive file', 'https://example.com/cover.jpg'],
  ])('shows the placeholder without asking the loader for %s', (_label, photoUrl) => {
    const loader = stubCoverLoader()
    setup(loader, { title: 'dune', photoUrl })
    expect(screen.getByRole('img', { name: 'No cover for dune' })).toHaveTextContent('D')
    expect(loader.getCoverUrl).not.toHaveBeenCalled()
  })

  it('falls back to the placeholder when the cover cannot be loaded', async () => {
    const loader: CoverLoader = { getCoverUrl: vi.fn().mockRejectedValue(new Error('404')), releaseAll: () => undefined }
    setup(loader)
    expect(await screen.findByRole('img', { name: 'No cover for Dune' })).toBeInTheDocument()
  })

  it('raises the reconnect banner (session expired) when the cover request says the token expired', async () => {
    const loader: CoverLoader = { getCoverUrl: vi.fn().mockRejectedValue(new SessionExpiredError()), releaseAll: () => undefined }
    const store = setup(loader)
    await waitFor(() => expect(store.getState().session.status).toBe('expired'))
    expect(screen.getByRole('img', { name: 'No cover for Dune' })).toBeInTheDocument()
  })

  it('uses the first letter of the title, or ? for a blank title', () => {
    setup(stubCoverLoader(), { title: '  ', photoUrl: undefined })
    expect(screen.getByRole('img')).toHaveTextContent('?')
  })
})
