'use client'
import type { ReactNode } from 'react'
import { TopNav } from './TopNav'
import { StickyConfirmCta } from './StickyConfirmCta'

type ConfirmPageShellProps = {
  title: string
  ctaLabel: string
  isValid: boolean
  onSubmit: () => void
  children: ReactNode
}

export function ConfirmPageShell({
  title,
  ctaLabel,
  isValid,
  onSubmit,
  children,
}: ConfirmPageShellProps) {
  return (
    <>
      <TopNav title={title} fallback="/" />
      <div aria-hidden className="bg-brand h-32" />
      <form
        onSubmit={(e) => {
          e.preventDefault()
          onSubmit()
        }}
        noValidate
        className="pb-24"
      >
        <main>{children}</main>
        <StickyConfirmCta label={ctaLabel} isValid={isValid} />
      </form>
    </>
  )
}
