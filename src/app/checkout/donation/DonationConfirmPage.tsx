'use client'

// Spec 009a v0.7 — donation confirm page (charity + project share this UI).
// Pure UI layer composing 009c primitives + business panels; all logic
// lives in useDonorInfoForm. v0.7 props collapsed from { query, target }
// down to a single { draft } from the in-memory draft store.

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
import type { DonationDetail } from '@/lib/schemas/detail'
import { computeNextChargeAt, fmtDate } from './computeNextChargeAt'
import type { DonationDraft } from './draft-store'
import {
  useDonorInfoForm,
  RECEIPT_OPTIONS,
  type Action,
  type FormState,
  type ReceiptOption,
} from './useDonorInfoForm'
import type { BillingDay } from '../useDonationSettingsForm'

type Props = {
  draft: DonationDraft
}

const BILLING_DAY_LABEL: Record<BillingDay, number> = {
  DAY_6: 6,
  DAY_16: 16,
  DAY_26: 26,
}

const priceFmt = new Intl.NumberFormat('zh-TW')

export function DonationConfirmPage({ draft }: Props) {
  const { form, dispatch, isValid, handleSubmit } = useDonorInfoForm({ draft })
  return (
    <ConfirmPageShell
      title="確認捐款資訊"
      ctaLabel="確認送出"
      isValid={isValid}
      onSubmit={handleSubmit}
    >
      <DonationDetailPanel draft={draft} />
      <DonorInfoFormPanel form={form} dispatch={dispatch} />
    </ConfirmPageShell>
  )
}

function DonationDetailPanel({ draft }: Props) {
  const projectName =
    draft.target.type === 'CHARITY'
      ? '直接捐款給團體'
      : draft.target.detail.name
  const charityName =
    draft.target.type === 'CHARITY'
      ? draft.target.detail.name
      : (draft.target.detail as DonationDetail).charity.name
  const typeLabel =
    draft.donationFrequency === 'RECURRING' ? '定期捐款' : '單次捐款'
  const nextChargeAt =
    draft.donationFrequency === 'RECURRING' && draft.billingDay
      ? computeNextChargeAt(draft.billingDay)
      : null

  return (
    <ConfirmPanel title="捐款明細" variant="first">
      <KeyValueList>
        <KeyValueRow label="捐款專案">{projectName}</KeyValueRow>
        <KeyValueRow label="捐款對象">{charityName}</KeyValueRow>
        <KeyValueRow label="捐款類型">{typeLabel}</KeyValueRow>
        {draft.donationFrequency === 'RECURRING' && draft.billingDay && (
          <>
            <KeyValueRow label="扣款週期">
              每月 {BILLING_DAY_LABEL[draft.billingDay]} 日
            </KeyValueRow>
            <KeyValueRow label="下次扣款日期">
              <time dateTime={nextChargeAt!.toISOString().slice(0, 10)}>
                {fmtDate(nextChargeAt!)}
              </time>
            </KeyValueRow>
          </>
        )}
        <KeyValueRow label="捐款金額" variant="emphasized">
          TWD {priceFmt.format(draft.amountTwd)}
        </KeyValueRow>
      </KeyValueList>
    </ConfirmPanel>
  )
}

function DonorInfoFormPanel({
  form,
  dispatch,
}: {
  form: FormState
  dispatch: Dispatch<Action>
}) {
  return (
    <ConfirmPanel title="捐款人基本資料">
      <DisclaimerBox className="mb-4">{DISCLAIMER_PLATFORM}</DisclaimerBox>

      <RequiredLabel htmlFor="receiptOption" className="mb-2">
        收據開立方式
      </RequiredLabel>
      <select
        id="receiptOption"
        // v0.9 — empty string represents the "尚未選擇" placeholder option.
        // Maps onto the FormState's null state.
        value={form.receiptOption ?? ''}
        onChange={(e) =>
          dispatch({
            type: 'SET_RECEIPT_OPTION',
            value: (e.target.value || null) as ReceiptOption | null,
          })
        }
        className="w-full h-12 rounded-lg border border-line bg-surface-card
                   px-3 text-sm text-ink-AAA mb-4"
      >
        <option value="" disabled>
          請選擇收據開立方式
        </option>
        {RECEIPT_OPTIONS.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>

      {/* v0.9 — donor name + 匿名 checkbox 只在「已選收據方式」後出現。
          排序：收據未選 → 整段隱藏；選後一起顯示，避免反覆閃現姓名欄。 */}
      {form.receiptOption !== null && (
        <>
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
        </>
      )}

      <ReminderNote className="mt-4">{REMINDER_DONOR_NAME}</ReminderNote>
    </ConfirmPanel>
  )
}
