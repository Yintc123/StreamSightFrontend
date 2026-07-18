'use client'

// Spec 013b §2.3 — inline role select (super_admin / editor / viewer) →
// PUT /api/cms/admins/[id]/role. Disabled for protected root / self / non-
// active rows (backend 422 is authoritative; UI pre-disables per §1.2).

import { useState, useTransition } from 'react'
import { toast } from 'sonner'

import type { AdminRole, ClientAdminSummary } from '@/lib/schemas/admin'
import { changeRole, CmsHttpError } from './api'

const ROLES: { value: AdminRole; label: string }[] = [
  { value: 'viewer', label: 'Viewer' },
  { value: 'editor', label: 'Editor' },
  { value: 'super_admin', label: 'Super Admin' },
]

export function AdminRoleControl({
  admin,
  disabled,
  onChanged,
}: {
  admin: ClientAdminSummary
  disabled: boolean
  onChanged: () => void
}) {
  const [value, setValue] = useState<AdminRole>(admin.adminRole)
  const [isPending, startTransition] = useTransition()

  function handleChange(next: AdminRole) {
    const prev = value
    setValue(next)
    startTransition(async () => {
      try {
        await changeRole(admin.id, next)
        toast.success('權限已更新')
        onChanged()
      } catch (err) {
        setValue(prev) // revert optimistic select
        toast.error(err instanceof CmsHttpError ? err.message : '更新權限失敗')
      }
    })
  }

  return (
    <label className="sr-only-label">
      <span className="sr-only">{`${admin.username} 權限`}</span>
      <select
        aria-label={`${admin.username} 權限`}
        value={value}
        disabled={disabled || isPending}
        onChange={(e) => handleChange(e.target.value as AdminRole)}
        className="h-8 rounded-md border border-line bg-surface-card px-2 text-xs text-ink-AAA
                   disabled:opacity-50 focus:outline-none focus:border-brand focus:ring-1 focus:ring-brand"
      >
        {ROLES.map((r) => (
          <option key={r.value} value={r.value}>
            {r.label}
          </option>
        ))}
      </select>
    </label>
  )
}
