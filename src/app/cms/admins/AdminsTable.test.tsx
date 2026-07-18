import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import type { ClientAdminSummary } from '@/lib/schemas/admin'

vi.mock('./api', () => ({
  fetchAdmins: vi.fn(),
  fetchMe: vi.fn(),
  // referenced by child components; unused in these tests
  changeRole: vi.fn(),
  archiveAdmin: vi.fn(),
  unarchiveAdmin: vi.fn(),
  deleteAdmin: vi.fn(),
  restoreAdmin: vi.fn(),
  createAdmin: vi.fn(),
  renameAdmin: vi.fn(),
  CmsHttpError: class extends Error {},
}))

const toast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }))
vi.mock('sonner', () => ({ toast }))

import { fetchAdmins, fetchMe, changeRole } from './api'
import { AdminsTable } from './AdminsTable'

const fetchAdminsMock = vi.mocked(fetchAdmins)
const fetchMeMock = vi.mocked(fetchMe)
const changeRoleMock = vi.mocked(changeRole)

function admin(over: Partial<ClientAdminSummary>): ClientAdminSummary {
  return {
    id: 2,
    username: 'editor1',
    name: 'Editor One',
    adminRole: 'editor',
    isProtected: false,
    isActive: true,
    archivedAt: null,
    archivedBy: null,
    archivedByUsername: null,
    deletedAt: null,
    deletedBy: null,
    deletedByUsername: null,
    createdAt: '2026-07-01T00:00:00Z',
    updatedAt: '2026-07-02T00:00:00Z',
    ...over,
  }
}

function wrapper({ children }: { children: ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>
}

const ROWS = [
  admin({ id: 1, username: 'root', name: 'Root', adminRole: 'super_admin', isProtected: true }),
  admin({ id: 2, username: 'editor1', name: 'Editor One', adminRole: 'editor' }),
  admin({ id: 7, username: 'me', name: 'Me Admin', adminRole: 'editor' }),
]

beforeEach(() => {
  fetchAdminsMock.mockReset().mockResolvedValue({ items: ROWS, total: 3, limit: 200, offset: 0 })
  fetchMeMock.mockReset().mockResolvedValue({ id: 7, username: 'me', name: 'Me Admin', adminRole: 'super_admin' })
})

describe('AdminsTable — action availability', () => {
  it('protected root row: shows "root" marker and no archive/delete buttons', async () => {
    render(<AdminsTable />, { wrapper })
    const row = await screen.findByTestId('admin-row-1')
    expect(within(row).getByText(/root · 不可移除/)).toBeInTheDocument()
    expect(within(row).queryByRole('button', { name: '封存' })).not.toBeInTheDocument()
    expect(within(row).queryByRole('button', { name: '刪除' })).not.toBeInTheDocument()
  })

  it('normal active editor row: archive + delete available', async () => {
    render(<AdminsTable />, { wrapper })
    const row = await screen.findByTestId('admin-row-2')
    expect(within(row).getByRole('button', { name: '封存' })).toBeInTheDocument()
    expect(within(row).getByRole('button', { name: '刪除' })).toBeInTheDocument()
  })

  it('self row: dangerous actions hidden, marked (你自己)', async () => {
    render(<AdminsTable />, { wrapper })
    const row = await screen.findByTestId('admin-row-7')
    expect(within(row).getByText('（你自己）')).toBeInTheDocument()
    expect(within(row).queryByRole('button', { name: '封存' })).not.toBeInTheDocument()
    expect(within(row).queryByRole('button', { name: '刪除' })).not.toBeInTheDocument()
  })
})

describe('AdminsTable — mutation invalidates the list', () => {
  it('a successful role change invalidates ["cms-admins"]', async () => {
    changeRoleMock.mockReset().mockResolvedValueOnce({
      id: 2,
      username: 'editor1',
      name: 'Editor One',
      adminRole: 'viewer',
    })
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    const invalidateSpy = vi.spyOn(qc, 'invalidateQueries')
    render(
      <QueryClientProvider client={qc}>
        <AdminsTable />
      </QueryClientProvider>,
    )
    const row = await screen.findByTestId('admin-row-2') // editor, not self → role editable
    fireEvent.change(within(row).getByLabelText('editor1 權限'), {
      target: { value: 'viewer' },
    })
    await waitFor(() => expect(changeRoleMock).toHaveBeenCalledWith(2, 'viewer'))
    await waitFor(() =>
      expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['cms-admins'] }),
    )
  })
})

describe('AdminsTable — status tabs', () => {
  it('defaults to active, and switching tab refetches with the new status', async () => {
    render(<AdminsTable />, { wrapper })
    await screen.findByTestId('admin-row-2')
    expect(fetchAdminsMock).toHaveBeenCalledWith('active')

    fireEvent.click(screen.getByRole('tab', { name: '已封存' }))
    await waitFor(() => expect(fetchAdminsMock).toHaveBeenCalledWith('archived'))
  })
})
