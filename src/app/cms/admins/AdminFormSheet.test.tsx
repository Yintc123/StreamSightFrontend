import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'

vi.mock('./api', () => ({
  createAdmin: vi.fn(),
  renameAdmin: vi.fn(),
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

import { createAdmin, renameAdmin, CmsHttpError } from './api'
import { AdminFormSheet } from './AdminFormSheet'

const createMock = vi.mocked(createAdmin)
const renameMock = vi.mocked(renameAdmin)

beforeEach(() => {
  createMock.mockReset()
  renameMock.mockReset()
})

function fillCreate(over: { username?: string; name?: string; password?: string } = {}) {
  fireEvent.change(screen.getByLabelText('帳號'), { target: { value: over.username ?? 'jane' } })
  fireEvent.change(screen.getByLabelText('顯示名稱'), { target: { value: over.name ?? 'Jane' } })
  fireEvent.change(screen.getByLabelText('密碼'), { target: { value: over.password ?? 'secret12' } })
}

describe('AdminFormSheet — create', () => {
  it('submit disabled until required fields valid', () => {
    render(<AdminFormSheet open mode="create" initial={null} onClose={() => {}} onSuccess={() => {}} />)
    const submit = screen.getByRole('button', { name: '建立' })
    expect(submit).toBeDisabled()
    fillCreate()
    expect(submit).toBeEnabled()
  })

  it('short password → inline error, no API call', async () => {
    render(<AdminFormSheet open mode="create" initial={null} onClose={() => {}} onSuccess={() => {}} />)
    fillCreate({ password: 'short' })
    fireEvent.click(screen.getByRole('button', { name: '建立' }))
    expect(await screen.findByText(/至少 8/)).toBeInTheDocument()
    expect(createMock).not.toHaveBeenCalled()
  })

  it('409 conflict → inline "帳號已被使用"', async () => {
    createMock.mockRejectedValueOnce(new CmsHttpError(409, 'conflict', '帳號已被使用'))
    const onSuccess = vi.fn()
    render(<AdminFormSheet open mode="create" initial={null} onClose={() => {}} onSuccess={onSuccess} />)
    fillCreate({ username: 'dup' })
    fireEvent.click(screen.getByRole('button', { name: '建立' }))
    expect(await screen.findByText('帳號已被使用')).toBeInTheDocument()
    expect(onSuccess).not.toHaveBeenCalled()
  })

  it('success → calls createAdmin with values + onSuccess', async () => {
    createMock.mockResolvedValueOnce({ id: 9, username: 'jane', name: 'Jane', adminRole: 'viewer' })
    const onSuccess = vi.fn()
    render(<AdminFormSheet open mode="create" initial={null} onClose={() => {}} onSuccess={onSuccess} />)
    fillCreate()
    fireEvent.click(screen.getByRole('button', { name: '建立' }))
    await waitFor(() => expect(onSuccess).toHaveBeenCalled())
    expect(createMock).toHaveBeenCalledWith(
      expect.objectContaining({ username: 'jane', name: 'Jane', password: 'secret12', adminRole: 'viewer' }),
    )
  })
})

describe('AdminFormSheet — edit (rename)', () => {
  const initial = { id: 5, username: 'editor1', name: 'Editor One', adminRole: 'editor' as const }

  it('username is read-only; only name is editable', () => {
    render(<AdminFormSheet open mode="edit" initial={initial} onClose={() => {}} onSuccess={() => {}} />)
    expect(screen.getByLabelText('帳號')).toHaveAttribute('readonly')
    expect(screen.queryByLabelText('密碼')).not.toBeInTheDocument()
  })

  it('rename success → renameAdmin(id, name) + onSuccess', async () => {
    renameMock.mockResolvedValueOnce({ id: 5, username: 'editor1', name: 'Renamed', adminRole: 'editor' })
    const onSuccess = vi.fn()
    render(<AdminFormSheet open mode="edit" initial={initial} onClose={() => {}} onSuccess={onSuccess} />)
    fireEvent.change(screen.getByLabelText('顯示名稱'), { target: { value: 'Renamed' } })
    fireEvent.click(screen.getByRole('button', { name: '儲存' }))
    await waitFor(() => expect(onSuccess).toHaveBeenCalled())
    expect(renameMock).toHaveBeenCalledWith(5, 'Renamed')
  })
})
