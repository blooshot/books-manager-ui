import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import { describe, expect, it } from 'vitest'
import { Sidebar } from '@/features/layout/Sidebar'

// The sidebar is hidden in the app for now (SHOW_SIDEBAR in AppLayout) but kept working, so it keeps its own tests.
describe('Sidebar (hidden in the app, kept working)', () => {
  it('marks the current page', () => {
    render(<MemoryRouter initialEntries={['/lent-out']}><Sidebar /></MemoryRouter>)
    const nav = screen.getByRole('navigation', { name: 'Main' })
    expect(within(nav).getByRole('link', { name: 'Lent out' })).toHaveAttribute('aria-current', 'page')
    expect(within(nav).getByRole('link', { name: 'Books' })).not.toHaveAttribute('aria-current')
  })

  it('remembers a collapsed sidebar across visits, keeping the labels for screen readers', async () => {
    const user = userEvent.setup()
    const first = render(<MemoryRouter><Sidebar /></MemoryRouter>)
    await user.click(screen.getByRole('button', { name: 'Collapse sidebar' }))
    expect(localStorage.getItem('bm.sidebarCollapsed')).toBe('1')
    expect(screen.getByRole('button', { name: 'Expand sidebar' })).toBeInTheDocument()
    expect(within(screen.getByRole('navigation', { name: 'Main' })).getByRole('link', { name: 'Books' })).toBeInTheDocument()
    first.unmount()

    render(<MemoryRouter><Sidebar /></MemoryRouter>)
    expect(screen.getByRole('button', { name: 'Expand sidebar' })).toBeInTheDocument()
  })
})
