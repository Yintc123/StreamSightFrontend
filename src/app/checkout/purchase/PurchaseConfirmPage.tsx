'use client'

// Spec 009b v0.4 — sale-item purchase confirm page (pure UI layer).
// Three panels: purchase detail (item + qty + totals) / disclaimer-only /
// receipt info (donorName + isAnonymous). Logic in useReceiptInfoForm.

import type { Dispatch } from 'react'
import { ConfirmPageShell } from '@/components/ui/ConfirmPageShell'
import { ConfirmPanel } from '@/components/ui/ConfirmPanel'
import { KeyValueList, KeyValueRow } from '@/components/ui/KeyValueList'
import {
  DisclaimerBox,
  DISCLAIMER_PLATFORM,
} from '@/components/ui/DisclaimerBox'
import {
  ReminderNote,
  REMINDER_DONOR_NAME,
} from '@/components/ui/ReminderNote'
import { RequiredLabel } from '@/components/ui/RequiredLabel'
import type { ItemDetail } from '@/lib/schemas/detail'
import type { PurchaseDraft } from './draft-store'
import {
  useReceiptInfoForm,
  type Action,
  type FormState,
} from './useReceiptInfoForm'

type Props = {
  draft: PurchaseDraft
}

const priceFmt = new Intl.NumberFormat('zh-TW')

export function PurchaseConfirmPage({ draft }: Props) {
  const { form, dispatch, isValid, subtotal, shipping, total, handleSubmit } =
    useReceiptInfoForm({ draft })
  return (
    <ConfirmPageShell
      title="確認捐款資訊"
      ctaLabel="確認送出"
      isValid={isValid}
      onSubmit={handleSubmit}
    >
      <PurchaseDetailPanel
        item={draft.item}
        quantity={draft.quantity}
        subtotal={subtotal}
        shipping={shipping}
        total={total}
      />
      <DisclaimerPanel />
      <ReceiptInfoFormPanel form={form} dispatch={dispatch} />
    </ConfirmPageShell>
  )
}

function PurchaseDetailPanel({
  item,
  quantity,
  subtotal,
  shipping,
  total,
}: {
  item: ItemDetail
  quantity: number
  subtotal: number
  shipping: number
  total: number
}) {
  return (
    <ConfirmPanel title="購買明細" variant="first">
      <KeyValueList>
        <KeyValueRow label="商品">{item.name}</KeyValueRow>
        <KeyValueRow label="團體">{item.charity.name}</KeyValueRow>
      </KeyValueList>

      <div className="border-t border-line pt-3 mt-3">
        <p className="text-sm text-ink-AAA mb-2">購買品項</p>
        <div className="flex items-start text-sm">
          <p className="flex-1 text-ink-AAA leading-5 line-clamp-2">
            {item.name}
          </p>
          <p className="text-ink-AA w-24 text-right shrink-0">
            TWD {priceFmt.format(item.priceTwd)} × {quantity}
          </p>
          <p className="text-ink-AAA w-20 text-right shrink-0">
            TWD {priceFmt.format(subtotal)}
          </p>
        </div>
      </div>

      <div className="border-t border-line pt-3 mt-3">
        <KeyValueList>
          <KeyValueRow label="運費">TWD {priceFmt.format(shipping)}</KeyValueRow>
          <KeyValueRow label="總計" variant="emphasized">
            TWD {priceFmt.format(total)}
          </KeyValueRow>
        </KeyValueList>
      </div>
    </ConfirmPanel>
  )
}

function DisclaimerPanel() {
  return (
    <ConfirmPanel title="捐款人基本資料">
      <DisclaimerBox>{DISCLAIMER_PLATFORM}</DisclaimerBox>
    </ConfirmPanel>
  )
}

function ReceiptInfoFormPanel({
  form,
  dispatch,
}: {
  form: FormState
  dispatch: Dispatch<Action>
}) {
  return (
    <ConfirmPanel title="收據資訊">
      <RequiredLabel htmlFor="donorName" className="mb-2">
        捐款人姓名
      </RequiredLabel>
      <input
        id="donorName"
        type="text"
        maxLength={120}
        placeholder="請填寫姓名"
        value={form.donorName}
        onChange={(e) =>
          dispatch({ type: 'SET_DONOR_NAME', value: e.target.value })
        }
        className="w-full h-12 rounded-lg border border-line bg-surface-card
                   px-3 text-sm text-ink-AAA placeholder:text-ink-A
                   focus:border-2 focus:border-ink-AAA focus:outline-none mb-4"
      />

      <label className="flex items-center gap-2 text-sm text-ink-AAA">
        <input
          type="checkbox"
          checked={form.isAnonymous}
          onChange={(e) =>
            dispatch({ type: 'SET_ANONYMOUS', value: e.target.checked })
          }
          className="w-4 h-4 rounded border-line text-brand
                     focus-visible:outline focus-visible:outline-2
                     focus-visible:outline-offset-2 focus-visible:outline-brand"
        />
        <span>我要匿名捐款</span>
      </label>

      <ReminderNote className="mt-4">{REMINDER_DONOR_NAME}</ReminderNote>
    </ConfirmPanel>
  )
}
