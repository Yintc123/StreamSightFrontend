'use client'
import type { ReactNode } from 'react'
import { TopNav } from '@/components/ui/TopNav'

type AdminPageShellProps = {
  title: string
  backHref: string
  /** 底部 sticky actions 群；省略 → 不渲染 sticky bar */
  actions?: ReactNode
  /** form-wrap 整個 main；省略 → 純內容（list 頁適用） */
  onSubmit?: () => void
  children: ReactNode
}

export function AdminPageShell({
  title,
  backHref,
  actions,
  onSubmit,
  children,
}: AdminPageShellProps) {
  const content = (
    <>
      <main className="flex-1 px-5 py-5">{children}</main>
      {actions && (
        <div
          className="sticky bottom-0 inset-x-0 bg-surface-card border-t border-line
                     px-5 pt-2 pb-[max(0.75rem,env(safe-area-inset-bottom))]
                     flex items-center gap-2 z-30"
        >
          {actions}
        </div>
      )}
    </>
  )
  return (
    <div
      data-component="AdminPageShell"
      className="min-h-dvh bg-surface-page flex flex-col"
    >
      <TopNav title={title} backHref={backHref} />
      {onSubmit ? (
        <form
          onSubmit={(e) => {
            e.preventDefault()
            onSubmit()
          }}
          noValidate
          className="flex-1 flex flex-col"
        >
          {content}
        </form>
      ) : (
        content
      )}
    </div>
  )
}
