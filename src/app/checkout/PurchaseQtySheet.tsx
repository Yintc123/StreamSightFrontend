'use client'

// Spec 008c v0.5 — PurchaseQtySheet (pure UI layer).
// All logic lives in usePurchaseQtyForm.ts.

import { BottomSheet } from '@/components/ui/BottomSheet'
import { QtyStepper } from '@/components/ui/QtyStepper'
import type { ItemDetail } from '@/lib/schemas/detail'
import {
  MAX_QUANTITY,
  MIN_QUANTITY,
  usePurchaseQtyForm,
} from './usePurchaseQtyForm'

type Props = {
  open: boolean
  onClose: () => void
  item: ItemDetail
}

const priceFmt = new Intl.NumberFormat('zh-TW')

export function PurchaseQtySheet({ open, onClose, item }: Props) {
  const { quantity, setQuantity, subtotal, shipping, total, handleSubmit } =
    usePurchaseQtyForm({ open, item, onClose })
  return (
    <BottomSheet open={open} title="購買數量" onClose={onClose}>
      <form
        data-component="PurchaseQtySheet"
        onSubmit={(e) => {
          e.preventDefault()
          handleSubmit()
        }}
        noValidate
      >
        <ItemRow
          item={item}
          quantity={quantity}
          setQuantity={setQuantity}
          subtotal={subtotal}
        />
        <Totals shipping={shipping} total={total} />
        <StickyFooter />
      </form>
    </BottomSheet>
  )
}

function ItemRow({
  item,
  quantity,
  setQuantity,
  subtotal,
}: {
  item: ItemDetail
  quantity: number
  setQuantity: (n: number) => void
  subtotal: number
}) {
  return (
    <div className="flex items-start gap-4 py-4">
      <div className="flex-1 min-w-0">
        <p className="text-sm text-ink-AAA leading-5 line-clamp-2">
          {item.name}
        </p>
        <p className="text-xs text-ink-A leading-5 mt-1">
          TWD {priceFmt.format(item.priceTwd)}
        </p>
      </div>
      <QtyStepper
        value={quantity}
        onChange={setQuantity}
        min={MIN_QUANTITY}
        max={MAX_QUANTITY}
      />
      <p className="text-sm text-ink-AAA font-medium w-20 text-right shrink-0">
        TWD {priceFmt.format(subtotal)}
      </p>
    </div>
  )
}

function Totals({ shipping, total }: { shipping: number; total: number }) {
  return (
    <dl className="border-t border-line px-1 py-3 space-y-1 text-sm">
      <div className="flex justify-between">
        <dt className="text-ink-AA">運費</dt>
        <dd className="text-ink-AAA">TWD {priceFmt.format(shipping)}</dd>
      </div>
      <div className="flex justify-between items-baseline">
        <dt className="text-ink-AAA">總計</dt>
        <dd className="text-brand text-lg font-bold">
          TWD {priceFmt.format(total)}
        </dd>
      </div>
    </dl>
  )
}

function StickyFooter() {
  return (
    <div
      className="sticky bottom-0 -mx-5 -mb-4 px-5 py-3 pt-2 mt-2
                 bg-surface-card border-t border-line"
    >
      <button
        type="submit"
        className="w-full h-12 rounded-full bg-brand text-white text-base font-semibold
                   focus-visible:outline focus-visible:outline-2
                   focus-visible:outline-offset-2 focus-visible:outline-brand"
      >
        下一步
      </button>
    </div>
  )
}
