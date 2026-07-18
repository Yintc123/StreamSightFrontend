'use client'

// Spec 013b §2.4 — lifecycle actions (archive / unarchive / soft-delete /
// restore) with a confirm sheet. Which buttons show is driven by the tested
// `adminRowActions` matrix; destructive confirm uses bg-danger.

import { useState, useTransition } from 'react'
import { toast } from 'sonner'

import { BottomSheet } from '@/components/ui/BottomSheet'
import type { ClientAdminSummary } from '@/lib/schemas/admin'
import type { AdminRowActions } from '@/lib/cms/adminActions'
import {
  archiveAdmin,
  unarchiveAdmin,
  deleteAdmin,
  restoreAdmin,
  CmsHttpError,
} from './api'

type LifecycleAction = 'archive' | 'unarchive' | 'delete' | 'restore'

const META: Record<
  LifecycleAction,
  { label: string; danger: boolean; confirm: string; run: (id: number) => Promise<unknown> }
> = {
  archive: { label: '封存', danger: false, confirm: '封存後此帳號將無法登入，可日後解除封存。', run: archiveAdmin },
  unarchive: { label: '解除封存', danger: false, confirm: '解除封存後此帳號可再次登入。', run: unarchiveAdmin },
  delete: { label: '刪除', danger: true, confirm: '軟刪除後此帳號將被停用，可於「已刪除」中復原。', run: deleteAdmin },
  restore: { label: '復原', danger: false, confirm: '復原後此帳號回到啟用狀態。', run: restoreAdmin },
}

export function AdminLifecycleMenu({
  admin,
  actions,
  onChanged,
}: {
  admin: ClientAdminSummary
  actions: AdminRowActions
  onChanged: () => void
}) {
  const [pending, setPending] = useState<LifecycleAction | null>(null)
  const [isRunning, startTransition] = useTransition()

  const available: LifecycleAction[] = []
  if (actions.canArchive) available.push('archive')
  if (actions.canUnarchive) available.push('unarchive')
  if (actions.canDelete) available.push('delete')
  if (actions.canRestore) available.push('restore')

  function confirm() {
    if (!pending) return
    const action = pending
    startTransition(async () => {
      try {
        await META[action].run(admin.id)
        toast.success(`${META[action].label}成功`)
        setPending(null)
        onChanged()
      } catch (err) {
        setPending(null)
        if (err instanceof CmsHttpError && err.status === 404) {
          toast.error('該帳號不存在或已刪除')
          onChanged() // refetch to reconcile
          return
        }
        toast.error(err instanceof CmsHttpError ? err.message : '操作失敗')
      }
    })
  }

  return (
    <>
      {available.map((action) => (
        <button
          key={action}
          type="button"
          onClick={() => setPending(action)}
          className={
            'rounded-md px-2 h-8 text-xs font-medium focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 ' +
            (META[action].danger
              ? 'text-danger hover:bg-danger/10 focus-visible:outline-danger'
              : 'text-ink-AA hover:text-ink-AAA hover:bg-brand-overlay focus-visible:outline-brand')
          }
        >
          {META[action].label}
        </button>
      ))}

      <BottomSheet
        open={pending !== null}
        title={pending ? `${META[pending].label}管理員` : ''}
        onClose={() => setPending(null)}
      >
        <div className="flex flex-col gap-5 pb-2">
          <p className="text-sm leading-6 text-ink-AA">
            確定要對
            <span className="font-medium text-ink-AAA">「{admin.name}」</span>
            執行「{pending ? META[pending].label : ''}」嗎？
            <br />
            {pending ? META[pending].confirm : ''}
          </p>
          <div className="flex gap-3">
            <button
              type="button"
              onClick={() => setPending(null)}
              className="flex-1 h-11 rounded-lg border border-line text-sm font-medium text-ink-AA hover:text-ink-AAA"
            >
              取消
            </button>
            <button
              type="button"
              onClick={confirm}
              disabled={isRunning}
              className={
                'flex-1 h-11 rounded-lg text-sm font-semibold text-ink-on-brand disabled:opacity-50 ' +
                (pending && META[pending].danger ? 'bg-danger' : 'bg-brand hover:bg-brand-400')
              }
            >
              {isRunning ? '處理中…' : '確定'}
            </button>
          </div>
        </div>
      </BottomSheet>
    </>
  )
}
