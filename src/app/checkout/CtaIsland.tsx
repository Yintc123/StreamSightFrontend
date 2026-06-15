'use client'

// Spec 008 §4 — CtaIsland.
//
// Glue between detail-page CTA placement and the donation/purchase sheets.
// Detail pages just declare "what flow + what target/item + which label
// + sticky?" and CtaIsland takes care of the open state, the trigger
// button itself, the focus-return-on-close ([008a §6.3]), and which sheet
// to mount underneath.
//
// `sticky` is a position concern, not a flow concern: charity detail wants
// in-card placement (spec 004a v0.2), donation/sale-item want sticky bottom
// (spec 004b/c). Z-30 matches TopNav so both ends of the chrome layer share
// a z-index and the modal backdrop (z-40) covers them when a sheet opens.

import { useRef, useState } from 'react'
import { DonationSettingsSheet } from './DonationSettingsSheet'
import { PurchaseQtySheet } from './PurchaseQtySheet'
import type { DonationTarget } from './useDonationSettingsForm'
import type { PurchaseItem } from './usePurchaseQtyForm'

type CtaIslandProps = {
  label: string
  /** true → wrap the trigger in a sticky bottom chrome row */
  sticky?: boolean
} & (
  | { kind: 'donation'; target: DonationTarget }
  | { kind: 'purchase'; item: PurchaseItem }
)

export function CtaIsland(props: CtaIslandProps) {
  const [open, setOpen] = useState(false)
  const triggerRef = useRef<HTMLButtonElement>(null)

  const close = () => {
    setOpen(false)
    // Spec 008a §6.3 — focus return is the caller's responsibility.
    triggerRef.current?.focus()
  }

  const button = (
    <button
      ref={triggerRef}
      type="button"
      onClick={() => setOpen(true)}
      className="w-full h-12 rounded-full bg-brand text-white text-base font-semibold
                 focus-visible:outline focus-visible:outline-2
                 focus-visible:outline-offset-2 focus-visible:outline-brand"
    >
      {props.label}
    </button>
  )

  const wrapper = props.sticky ? (
    <div
      className="sticky bottom-0 inset-x-0 bg-surface-card border-t border-line
                 px-5 py-3 pb-[env(safe-area-inset-bottom)] z-30"
    >
      {button}
    </div>
  ) : (
    button
  )

  return (
    <>
      {wrapper}
      {props.kind === 'donation' ? (
        <DonationSettingsSheet
          open={open}
          onClose={close}
          target={props.target}
        />
      ) : (
        <PurchaseQtySheet open={open} onClose={close} item={props.item} />
      )}
    </>
  )
}
