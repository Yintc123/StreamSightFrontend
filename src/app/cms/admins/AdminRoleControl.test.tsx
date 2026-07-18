import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import type { ClientAdminSummary } from '@/lib/schemas/admin'

vi.mock('./api', () => ({
  changeRole: vi.fn(),
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

import { changeRole, CmsHttpError } from './api'
import { AdminRoleControl } from './AdminRoleControl'

const changeRoleMock = vi.mocked(changeRole)

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

beforeEach(() => {
  changeRoleMock.mockReset()
  toast.success.mockReset()
  toast.error.mockReset()
})

describe('AdminRoleControl', () => {
  it('renders a select preset to the current role', () => {
    render(<AdminRoleControl admin={admin()} disabled={false} onChanged={() => {}} />)
    const select = screen.getByLabelText('editor1 權限') as HTMLSelectElement
    expect(select.value).toBe('editor')
  })

  it('changing role → changeRole(id, next) + onChanged + success toast', async () => {
    changeRoleMock.mockResolvedValueOnce({ id: 2, username: 'editor1', name: 'Editor One', adminRole: 'super_admin' })
    const onChanged = vi.fn()
    render(<AdminRoleControl admin={admin()} disabled={false} onChanged={onChanged} />)
    fireEvent.change(screen.getByLabelText('editor1 權限'), { target: { value: 'super_admin' } })
    await waitFor(() => expect(onChanged).toHaveBeenCalled())
    expect(changeRoleMock).toHaveBeenCalledWith(2, 'super_admin')
    expect(toast.success).toHaveBeenCalled()
  })

  it('on error → reverts the select + error toast + no onChanged', async () => {
    changeRoleMock.mockRejectedValueOnce(new CmsHttpError(422, 'business_rule_violation', '不可提權'))
    const onChanged = vi.fn()
    render(<AdminRoleControl admin={admin()} disabled={false} onChanged={onChanged} />)
    const select = screen.getByLabelText('editor1 權限') as HTMLSelectElement
    fireEvent.change(select, { target: { value: 'super_admin' } })
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('不可提權'))
    expect(select.value).toBe('editor') // reverted
    expect(onChanged).not.toHaveBeenCalled()
  })

  it('disabled prop → select is disabled', () => {
    render(<AdminRoleControl admin={admin()} disabled onChanged={() => {}} />)
    expect(screen.getByLabelText('editor1 權限')).toBeDisabled()
  })
})
