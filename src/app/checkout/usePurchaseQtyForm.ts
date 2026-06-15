'use client'

// Spec 008c v0.5 — PurchaseQty form hook (sale-item purchase sheet).
//
// Simpler than 008b: just a single integer (`quantity`), defaults to 1,
// clamped 1-100 (matches BE 022 §4.3 items[].quantity). Subtotal / total
// are derived; shipping is hardcoded 0 (BE spec also has no
// shippingFeeTwd column in this phase).
//
// Naming follows ADR 012: query params `saleItemId` / `quantity` map
// directly onto BE 022 §4.3 SaleItemPurchaseBody — the BFF route handler
// can forward without translation.

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import type { Item } from '@/lib/schemas/list'

export const DEFAULT_QUANTITY = 1
export const MIN_QUANTITY = 1
export const MAX_QUANTITY = 100

export type UsePurchaseQtyFormOpts = {
  open: boolean
  item: Item
  onClose: () => void
}

export type UsePurchaseQtyFormReturn = {
  quantity: number
  setQuantity: (next: number) => void
  subtotal: number
  shipping: number
  total: number
  handleSubmit: () => void
}

export function usePurchaseQtyForm(
  opts: UsePurchaseQtyFormOpts,
): UsePurchaseQtyFormReturn {
  const router = useRouter()
  const [quantity, setQuantity] = useState(DEFAULT_QUANTITY)

  // Form reset on open=true (same pattern as 008b §3.5 / BottomSheet alive
  // mirror). The setState-in-effect is the load-bearing semantic — caller
  // always mounts the sheet, so we can't reset via unmount/remount.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (opts.open) setQuantity(DEFAULT_QUANTITY)
  }, [opts.open])

  const subtotal = opts.item.priceTwd * quantity
  const shipping = 0
  const total = subtotal + shipping

  const handleSubmit = () => {
    const params = new URLSearchParams({
      saleItemId: opts.item.id,
      quantity: String(quantity),
    })
    router.push(`/checkout/purchase?${params.toString()}`)
    opts.onClose()
  }

  return { quantity, setQuantity, subtotal, shipping, total, handleSubmit }
}
