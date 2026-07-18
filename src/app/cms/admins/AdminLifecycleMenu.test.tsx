import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react'
import type { ClientAdminSummary } from '@/lib/schemas/admin'
import { adminRowActions } from '@/lib/cms/adminActions'

vi.mock('./api', () => ({
  archiveAdmin: vi.fn(),
  unarchiveAdmin: vi.fn(),
  deleteAdmin: vi.fn(),
  restoreAdmin: vi.fn(),
  CmsHttpError: class CmsHttpError extends Error {
    constructor(
      public status: number,
      public code: string | null,
      message: string,
    ) {
      super(message)
    }
  },
}))
const toast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }))
vi.mock('sonner', () => ({ toast }))

import { archiveAdmin, unarchiveAdmin, deleteAdmin, restoreAdmin, CmsHttpError } from './api'
import { AdminLifecycleMenu } from './AdminLifecycleMenu'

const archiveMock = vi.mocked(archiveAdmin)
const unarchiveMock = vi.mocked(unarchiveAdmin)
const deleteMock = vi.mocked(deleteAdmin)
const restoreMock = vi.mocked(restoreAdmin)

function admin(over: Partial<ClientAdminSummary> = {}): ClientAdminSummary {
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

function renderFor(a: ClientAdminSummary, onChanged = vi.fn()) {
  const actions = adminRowActions(a, 99) // not self
  render(<AdminLifecycleMenu admin={a} actions={actions} onChanged={onChanged} />)
  return { onChanged }
}

beforeEach(() => {
  archiveMock.mockReset()
  unarchiveMock.mockReset()
  deleteMock.mockReset()
  restoreMock.mockReset()
  toast.success.mockReset()
  toast.error.mockReset()
})

describe('AdminLifecycleMenu — button visibility per status', () => {
  it('active editor: shows 封存 + 刪除, not 解除封存/復原', () => {
    renderFor(admin())
    expect(screen.getByRole('button', { name: '封存' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '刪除' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '解除封存' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '復原' })).not.toBeInTheDocument()
  })

  it('archived: shows 解除封存 only', () => {
    renderFor(admin({ isActive: false, archivedAt: '2026-07-05T00:00:00Z' }))
    expect(screen.getByRole('button', { name: '解除封存' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '封存' })).not.toBeInTheDocument()
  })

  it('deleted: shows 復原 only', () => {
    renderFor(admin({ isActive: false, deletedAt: '2026-07-06T00:00:00Z' }))
    expect(screen.getByRole('button', { name: '復原' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '刪除' })).not.toBeInTheDocument()
  })
})

describe('AdminLifecycleMenu — confirm flow', () => {
  it('封存 → 開確認 → 確定 → archiveAdmin(id) + onChanged + success toast', async () => {
    archiveMock.mockResolvedValueOnce(admin({ isActive: false, archivedAt: '2026-07-11T00:00:00Z' }))
    const { onChanged } = renderFor(admin())
    fireEvent.click(screen.getByRole('button', { name: '封存' }))
    const dialog = await screen.findByRole('dialog')
    fireEvent.click(within(dialog).getByRole('button', { name: '確定' }))
    await waitFor(() => expect(archiveMock).toHaveBeenCalledWith(2))
    expect(onChanged).toHaveBeenCalled()
    expect(toast.success).toHaveBeenCalled()
  })

  it('取消 → 不呼叫 api', async () => {
    renderFor(admin())
    fireEvent.click(screen.getByRole('button', { name: '刪除' }))
    const dialog = await screen.findByRole('dialog')
    fireEvent.click(within(dialog).getByRole('button', { name: '取消' }))
    expect(deleteMock).not.toHaveBeenCalled()
  })

  it('404 → error toast + onChanged (refetch to reconcile)', async () => {
    deleteMock.mockRejectedValueOnce(new CmsHttpError(404, 'not_found', '不存在'))
    const { onChanged } = renderFor(admin())
    fireEvent.click(screen.getByRole('button', { name: '刪除' }))
    const dialog = await screen.findByRole('dialog')
    fireEvent.click(within(dialog).getByRole('button', { name: '確定' }))
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('該帳號不存在或已刪除'))
    expect(onChanged).toHaveBeenCalled()
  })
})
