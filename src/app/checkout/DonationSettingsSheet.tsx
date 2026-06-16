'use client'

// Spec 008b v0.5 — DonationSettingsSheet (pure UI layer).
// All logic lives in useDonationSettingsForm.ts; this file is props→JSX only.

import { BottomSheet } from '@/components/ui/BottomSheet'
import {
  MIN_PRESET_AMOUNT,
  PRESET_AMOUNTS,
  useDonationSettingsForm,
  type Action,
  type BillingDay,
  type DonationFrequency,
  type DonationTarget,
  type FormState,
} from './useDonationSettingsForm'

type Props = {
  open: boolean
  onClose: () => void
  target: DonationTarget
}

const FREQUENCIES: { value: DonationFrequency; label: string }[] = [
  { value: 'RECURRING', label: '每月定期捐款' },
  { value: 'ONE_TIME', label: '單次捐款' },
]

const BILLING_DAYS: { value: BillingDay; label: string }[] = [
  { value: 'DAY_6', label: '每月 6 日' },
  { value: 'DAY_16', label: '每月 16 日' },
  { value: 'DAY_26', label: '每月 26 日' },
]

const priceFmt = new Intl.NumberFormat('zh-TW')

export function DonationSettingsSheet({ open, onClose, target }: Props) {
  const { form, dispatch, isValid, handleSubmit } = useDonationSettingsForm({
    open,
    target,
    onClose,
  })
  return (
    <BottomSheet open={open} title="捐款設定" onClose={onClose}>
      <form
        data-component="DonationSettingsSheet"
        onSubmit={(e) => {
          e.preventDefault()
          handleSubmit()
        }}
        noValidate
      >
        <FrequencySection form={form} dispatch={dispatch} />
        {form.donationFrequency === 'RECURRING' && (
          <BillingDaySection form={form} dispatch={dispatch} />
        )}
        <AmountSection form={form} dispatch={dispatch} />
        <StickyFooter isValid={isValid} />
      </form>
    </BottomSheet>
  )
}

// ─── Sections ──────────────────────────────────────────────────────────

function SectionHeading({ children }: { children: React.ReactNode }) {
  return (
    <h3 className="text-sm font-medium text-ink-AAA mb-2 mt-4 first:mt-0">
      {children}
    </h3>
  )
}

function FrequencySection({
  form,
  dispatch,
}: {
  form: FormState
  dispatch: React.Dispatch<Action>
}) {
  return (
    <section>
      <SectionHeading>捐款類型</SectionHeading>
      <div role="radiogroup" aria-label="捐款類型" className="flex gap-3">
        {FREQUENCIES.map((f) => {
          const selected = form.donationFrequency === f.value
          return (
            <SegmentedButton
              key={f.value}
              selected={selected}
              onClick={() =>
                dispatch({ type: 'SET_FREQUENCY', donationFrequency: f.value })
              }
              label={f.label}
            />
          )
        })}
      </div>
    </section>
  )
}

function BillingDaySection({
  form,
  dispatch,
}: {
  form: FormState
  dispatch: React.Dispatch<Action>
}) {
  return (
    <section>
      <SectionHeading>扣款日期</SectionHeading>
      <div
        role="radiogroup"
        aria-label="扣款日期"
        className="grid grid-cols-3 gap-3"
      >
        {BILLING_DAYS.map((d) => {
          const selected = form.billingDay === d.value
          return (
            <PillButton
              key={d.value}
              selected={selected}
              onClick={() =>
                dispatch({ type: 'SET_BILLING_DAY', billingDay: d.value })
              }
              label={d.label}
            />
          )
        })}
      </div>
    </section>
  )
}

function AmountSection({
  form,
  dispatch,
}: {
  form: FormState
  dispatch: React.Dispatch<Action>
}) {
  // v0.6 — below-min hint. Only triggers when the user has parsed a real
  // number that's below MIN_PRESET_AMOUNT. Empty input / non-numeric stays
  // silent (different kind of invalid, not a min-amount problem).
  const showMinHint =
    form.amount !== null && form.amount.value < MIN_PRESET_AMOUNT

  return (
    <section>
      <SectionHeading>扣款金額</SectionHeading>
      <div
        role="radiogroup"
        aria-label="扣款金額"
        className="grid grid-cols-3 gap-3 mb-3"
      >
        {PRESET_AMOUNTS.map((p) => {
          const selected =
            form.amount?.source === 'preset' && form.amount.value === p
          return (
            <PillButton
              key={p}
              selected={selected}
              onClick={() => dispatch({ type: 'SET_PRESET', value: p })}
              label={`TWD ${priceFmt.format(p)}`}
            />
          )
        })}
      </div>
      <div
        className="flex items-center h-12 rounded-lg border border-line bg-surface-card
                   px-4 focus-within:border-2 focus-within:border-ink-AAA"
      >
        <span className="text-sm text-ink-AAA mr-3 select-none">TWD</span>
        <input
          type="text"
          inputMode="numeric"
          pattern="[0-9]*"
          aria-label="自訂金額"
          placeholder="請輸入金額"
          value={form.amountInputRaw}
          onChange={(e) =>
            dispatch({ type: 'SET_INPUT', raw: e.target.value })
          }
          className="flex-1 bg-transparent text-sm text-ink-AAA
                     placeholder:text-ink-A focus:outline-none"
          aria-invalid={showMinHint || undefined}
          aria-describedby={showMinHint ? 'amount-min-hint' : undefined}
        />
      </div>
      {showMinHint && (
        <p
          id="amount-min-hint"
          role="alert"
          className="mt-2 text-xs text-brand"
        >
          本專案最低捐款金額為 {MIN_PRESET_AMOUNT}
        </p>
      )}
    </section>
  )
}

function StickyFooter({ isValid }: { isValid: boolean }) {
  return (
    <div
      className="sticky bottom-0 -mx-5 -mb-4 px-5 py-3 pt-2 mt-6
                 bg-surface-card border-t border-line"
    >
      <button
        type="submit"
        disabled={!isValid}
        className="w-full h-12 rounded-full bg-brand text-white text-base font-semibold
                   disabled:bg-black/10 disabled:text-ink-A
                   focus-visible:outline focus-visible:outline-2
                   focus-visible:outline-offset-2 focus-visible:outline-brand"
      >
        下一步
      </button>
    </div>
  )
}

// ─── Building blocks ───────────────────────────────────────────────────

const SEGMENTED_BASE =
  'flex-1 h-12 rounded-lg bg-surface-card text-sm text-ink-AAA relative'

function SegmentedButton({
  selected,
  onClick,
  label,
}: {
  selected: boolean
  onClick: () => void
  label: string
}) {
  const cls = selected
    ? `${SEGMENTED_BASE} border-2 border-ink-AAA font-medium`
    : `${SEGMENTED_BASE} border border-line`
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      onClick={onClick}
      className={cls}
    >
      {label}
      {selected && <CheckmarkBadge />}
    </button>
  )
}

const PILL_BASE =
  'h-12 rounded-lg bg-surface-card text-sm text-ink-AAA hover:bg-black/5'

function PillButton({
  selected,
  onClick,
  label,
}: {
  selected: boolean
  onClick: () => void
  label: string
}) {
  const cls = selected
    ? `${PILL_BASE} border-2 border-ink-AAA font-medium`
    : `${PILL_BASE} border border-line`
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      onClick={onClick}
      className={cls}
    >
      {label}
    </button>
  )
}

function CheckmarkBadge() {
  return (
    <span
      aria-hidden
      className="absolute right-0 bottom-0 w-5 h-5 bg-ink-AAA
                 rounded-tl-md flex items-center justify-center"
    >
      <svg viewBox="0 0 12 12" className="w-3 h-3 text-white" aria-hidden>
        <path
          d="M2.5 6L5 8.5L9.5 4"
          stroke="currentColor"
          strokeWidth={1.5}
          strokeLinecap="round"
          strokeLinejoin="round"
          fill="none"
        />
      </svg>
    </span>
  )
}
