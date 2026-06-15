# Spec 008b：`<DonationSettingsSheet>` 捐款設定 sheet

- **狀態**：Draft（v0.6 — 點 preset 自動帶入 input；自訂金額 < min preset 顯示紅字提示 + gate submit）
- **路徑（規劃）**：
  - `src/app/checkout/useDonationSettingsForm.ts` + `.test.ts`（v0.4 — pure logic hook）
  - `src/app/checkout/DonationSettingsSheet.tsx` + `.test.tsx`（v0.4 起為純 UI；charity / donation 兩個詳情頁共用）
- **依賴**：
  - [008a BottomSheet](./008a-bottom-sheet.md) — UI primitive
  - 既有 design system tokens（[003a](./003a-design-system.md)）
  - **Backend enum source**（[backend spec 021 §5](../../../backend/docs/specs/021-donation-order-data-model.md) / [022 §4](../../../backend/docs/specs/022-donation-order-api.md)）：`DonationFrequency` / `BillingDay` / `OrderSubjectType` 一律從 Prisma 產出，FE 沿用同名同值，避免 BFF mapping 層
- **使用方**：
  - [008 §4.1](./008-donation-checkout-sheets.md) charity detail（CTA「直接捐款給團體」）
  - [008 §4.2](./008-donation-checkout-sheets.md) donation detail（CTA「立即捐款」）
- **Figma 對應**：IMG_4885（charity）/ IMG_4886（donation，與 4885 完全相同）

---

## 1. 職責

讓使用者設定**定期 / 單次**、**扣款日期**（限定期）、**扣款金額**（preset 或自訂），按「下一步」`console.log` payload + 關閉 sheet。

> **範圍邊界**：依 brief.md「捐款流程 CTA 只刻 UI 不接金流」，「下一步」不導向、不打 API。

---

## 2. 內容區塊

```
[ BottomSheet title="捐款設定" ]

捐款類型
┌──────────────────┬──────────────────┐
│ 每月定期捐款  ▼✓ │ 單次捐款          │  ← 2 個 segmented，預設左
└──────────────────┴──────────────────┘
  (黑色右下角勾標 = 選中態；對齊 IMG_4885)

扣款日期                                  ← 只在 donationFrequency = 'RECURRING' 顯示
┌──────────┬──────────┬──────────┐
│ 每月 6 日 │ 每月 16 日│ 每月 26 日│  ← 3 個 pill 按鈕，3 選 1
└──────────┴──────────┴──────────┘

扣款金額
┌──────────┬──────────┬──────────┐
│ TWD 100  │ TWD 500  │ TWD 1,000│  ← 3 個 preset pill，3 選 1（互斥）
└──────────┴──────────┴──────────┘
┌──────────────────────────────────┐
│ TWD │ 請輸入金額                  │  ← TWD 前綴 + number input
└──────────────────────────────────┘

[       下一步       ]               ← sticky footer，valid 才 enabled
```

---

## 3. State model（v0.2 — useReducer + amountInputRaw；v0.5 — 全面對齊 BE enum）

### 3.1 Type

> v0.5：所有 form 欄位、enum 值、payload key 都直接沿用 [backend 021 §5 Prisma enum](../../../backend/docs/specs/021-donation-order-data-model.md) / [022 §4 body shape](../../../backend/docs/specs/022-donation-order-api.md) 的命名。BFF route handler 收到 form 後不需要做 enum mapping，可直接 forward 給 BE。

```ts
// 對應 BE Prisma enum (021 §5)
type DonationFrequency = 'ONE_TIME' | 'RECURRING'     // 預設 'RECURRING'（IMG_4885 已選「每月定期」）
type BillingDay = 'DAY_6' | 'DAY_16' | 'DAY_26'        // RECURRING 必設；ONE_TIME 禁設

// 「目前金額」帶 source 區分是 preset 還是 input。
// 即使 input 打到 500，source='input' → preset 500 視覺仍未亮。
type AmountState =
  | { source: 'preset'; value: 100 | 500 | 1000 }
  | { source: 'input'; value: number }       // value 已 parse 為 integer
  | null                                       // 未選 / input 不合規

interface FormState {
  donationFrequency: DonationFrequency
  billingDay: BillingDay | null    // null = 未選；ONE_TIME 切換時 reducer 強制清為 null
  amount: AmountState              // 驗證後的 — 給 isValid / buildPayload 用
  amountInputRaw: string           // v0.2 — 使用者原始輸入字串，給 <input value> 用
}

const DEFAULT_FORM: FormState = {
  donationFrequency: 'RECURRING',
  billingDay: null,
  amount: null,
  amountInputRaw: '',
}
```

> Billing day pill UI label 「每月 6 / 16 / 26 日」由 view-layer 從 enum 對應顯示文字（`{ DAY_6: 6, DAY_16: 16, DAY_26: 26 }`）。enum 不存 int 是因為 BE Prisma 用字串 enum；DB 端 `DAY_6 / 16 / 26` 命名空間獨立、未來想加 `DAY_END_OF_MONTH` 不會撞號碼。

**為何 `amountInputRaw` 跟 `amount` 拆開**：

```
使用者輸入「100」 → amount={source:'input',value:100}、raw='100' → input 顯示 "100" ✓
使用者刪 "1" → input value 變 "00" → parseAmount("00")=0 → 不合規
```

若 input value 仍 controlled 綁 `amount.value`，瞬間 amount=null → input 重 render → value='' → 使用者看到「我只想刪一個字、結果整欄被清空」。

v0.2 拆兩個欄位：input value 永遠跟著 `amountInputRaw`（"00" 也保留顯示），`amount` 並行算 valid 但不影響 input 內容。

### 3.2 Reducer pattern（v0.2 — 取代 v0.1 的 useState + setForm；v0.5 — Action 命名對齊 BE enum）

form 有 4 條 cross-field transition（切 ONE_TIME 清 billingDay、點 preset 清 raw、input 改 raw 同步算 amount、reset）。用 `useReducer` 把每個 transition 集中、明示、好測：

```ts
type Action =
  | { type: 'SET_FREQUENCY'; donationFrequency: DonationFrequency }
  | { type: 'SET_BILLING_DAY'; billingDay: BillingDay }
  | { type: 'SET_PRESET'; value: 100 | 500 | 1000 }
  | { type: 'SET_INPUT'; raw: string }
  | { type: 'RESET' }

function reducer(state: FormState, action: Action): FormState {
  switch (action.type) {
    case 'SET_FREQUENCY':
      return {
        ...state,
        donationFrequency: action.donationFrequency,
        billingDay: action.donationFrequency === 'ONE_TIME' ? null : state.billingDay,
      }
    case 'SET_BILLING_DAY':
      return { ...state, billingDay: action.billingDay }
    case 'SET_PRESET':
      return {
        ...state,
        amount: { source: 'preset', value: action.value },
        amountInputRaw: '',                              // 點 preset 清 input 顯示
      }
    case 'SET_INPUT': {
      const parsed = parseAmount(action.raw)
      return {
        ...state,
        amountInputRaw: action.raw,                      // 一律保留原始輸入
        amount: parsed !== null ? { source: 'input', value: parsed } : null,
      }
    }
    case 'RESET':
      return DEFAULT_FORM
  }
}
```

> reducer 本身是 pure function、可獨立 unit test（不需 React mount）。

### 3.3 Preset / Input 互動規則（v0.2）

| 互動 | dispatch | UI 行為 |
|---|---|---|
| 點 preset 100 / 500 / 1000 | `{type:'SET_PRESET', value}` | amount.source='preset'；**input 自動帶入該金額 `raw=String(value)`**（v0.6）；對應 preset selected |
| input onChange（任何字串） | `{type:'SET_INPUT', raw}` | raw 一律保留；amount 視 parseAmount 結果可能 null |
| 點 RECURRING / ONE_TIME segmented | `{type:'SET_FREQUENCY', donationFrequency}` | ONE_TIME 額外清 billingDay |
| 點扣款日 6/16/26 pill | `{type:'SET_BILLING_DAY', billingDay}` | billingDay 切換 |
| open=true 觸發 effect | `{type:'RESET'}` | 整 form 回 DEFAULT_FORM |

**Preset selected 條件**：

```ts
const isPresetSelected = (presetValue: 100 | 500 | 1000) =>
  form.amount?.source === 'preset' && form.amount.value === presetValue
```

**Input value 受控綁定**（v0.2 — 綁 `amountInputRaw`）：

```tsx
<input
  value={form.amountInputRaw}                         // ← raw，不是 amount.value
  onChange={(e) => dispatch({ type: 'SET_INPUT', raw: e.target.value })}
/>
```

### 3.4 `parseAmount` 規則（v0.5 — 補 BE 上限）

```ts
const AMOUNT_MIN = 1
const AMOUNT_MAX = 1_000_000              // 對齊 BE 022 §4.1 amountTwd 上限

function parseAmount(raw: string): number | null {
  const digitsOnly = raw.replace(/[^0-9]/g, '')   // 容錯「1,000」「TWD 500」
  if (!digitsOnly) return null
  const n = parseInt(digitsOnly, 10)
  return n >= AMOUNT_MIN && n <= AMOUNT_MAX ? n : null
}
```

### 3.5 Form reset on open

caller 始終把 `<DonationSettingsSheet open={open} ...>` 渲染在樹中（**不**用 `{open && ...}`、**不**換 `key`，否則破壞 [008a §4 isExiting 退場動畫](./008a-bottom-sheet.md#4-動畫機制isexiting-pattern)）。Sheet 內 useEffect 監聽 `open` 變 true 時 dispatch RESET：

```tsx
useEffect(() => {
  if (open) dispatch({ type: 'RESET' })
}, [open])
```

> v0.4：此 useEffect 連同 useReducer 都搬進 [§3.6 useDonationSettingsForm hook](#36-usedonationsettingsform-hookv04--container-邏輯抽出)。

### 3.6 `useDonationSettingsForm` hook（v0.4 — container 邏輯抽出）

把 React 整合層（useReducer call site + isValid 計算 + useEffect reset + handleSubmit + router.push）從 sheet component 抽到 custom hook，sheet component 變成純 UI 層。

**為何分層**：

- Hook 是純 logic、用 `renderHook()` 獨立測（不需 mount DOM、不需 mock sonner toast）
- Component 變成「props → JSX」純展示，視覺改動不會碰邏輯
- 未來換 form library（react-hook-form / formik）或加 TanStack mutation submit 只動 hook 一個檔
- 對齊 spec 008 index §5 v0.6 cross-spec 共同決策

**Hook 簽名**：

```ts
// src/app/checkout/useDonationSettingsForm.ts
'use client'
import { useEffect, useReducer } from 'react'
import { useRouter } from 'next/navigation'

// 對應 BE OrderSubjectType（021 §5）的 CHARITY / DONATION_PROJECT 兩值
// SALE_ITEM 走 008c PurchaseQtySheet，這個 sheet 不會收到
export type DonationTarget = {
  type: 'CHARITY' | 'DONATION_PROJECT'
  id: string                              // uuid
}

export type UseDonationSettingsFormOpts = {
  open: boolean
  target: DonationTarget
  onClose: () => void
}

export type UseDonationSettingsFormReturn = {
  form: FormState
  dispatch: React.Dispatch<Action>
  isValid: boolean
  handleSubmit: () => void
}

export function useDonationSettingsForm(
  opts: UseDonationSettingsFormOpts,
): UseDonationSettingsFormReturn {
  const router = useRouter()
  const [form, dispatch] = useReducer(reducer, DEFAULT_FORM)

  useEffect(() => {
    if (opts.open) dispatch({ type: 'RESET' })
  }, [opts.open])

  const isValid =
    form.amount !== null &&
    (form.donationFrequency === 'ONE_TIME' || form.billingDay !== null)

  const handleSubmit = () => {
    if (!isValid) return                  // 雙重保險；button disabled 已 gate
    const payload = buildPayload(form, opts.target)
    const params = new URLSearchParams({
      targetType: payload.target.type,         // 'CHARITY' | 'DONATION_PROJECT'
      targetId: payload.target.id,
      donationFrequency: payload.donationFrequency,
      ...(payload.billingDay !== null && { billingDay: payload.billingDay }),
      amountTwd: String(payload.amountTwd),
    })
    router.push(`/checkout/donation?${params.toString()}`)
    opts.onClose()
  }

  return { form, dispatch, isValid, handleSubmit }
}
```

`reducer` / `parseAmount` / `buildPayload` 仍與 hook 在同檔（也是 pure），便於一起 import / test。

**Component 變成純 UI 層**：

```tsx
// src/app/checkout/DonationSettingsSheet.tsx
'use client'
import { BottomSheet } from '@/components/ui/BottomSheet'
import { useDonationSettingsForm } from './useDonationSettingsForm'

type Props = {
  open: boolean
  onClose: () => void
  target: DonationTarget
}

export function DonationSettingsSheet({ open, onClose, target }: Props) {
  const { form, dispatch, isValid, handleSubmit } = useDonationSettingsForm({
    open, target, onClose,
  })
  return (
    <BottomSheet open={open} title="捐款設定" onClose={onClose}>
      <form onSubmit={(e) => { e.preventDefault(); handleSubmit() }} noValidate>
        {/* segmented / pill groups / TWD input — 純 props 綁 form / dispatch */}
      </form>
    </BottomSheet>
  )
}
```

Component 內部完全沒有 `useReducer` / `useEffect` / `useRouter` — 邏輯改動只動 hook。

---

## 4. 視覺規格（對齊 IMG_4885）

### 4.1 Section heading

```tsx
<h3 className="text-sm font-medium text-ink-AAA mb-2">捐款類型</h3>
```

### 4.2 Segmented control（捐款類型 2 選 1）

兩顆按鈕並排、外無 grouping border：

| 狀態 | className |
|---|---|
| Unselected | `flex-1 h-12 rounded-lg border border-line bg-surface-card text-sm text-ink-AAA` |
| Selected | `flex-1 h-12 rounded-lg border-2 border-ink-AAA bg-surface-card text-sm font-medium text-ink-AAA relative` + 右下角 checkmark badge |

選中態的「黑色勾標」(IMG_4885)：

```tsx
{selected && (
  <span
    aria-hidden
    className="absolute right-0 bottom-0 w-5 h-5
               bg-ink-AAA rounded-tl-md flex items-center justify-center"
  >
    <svg viewBox="0 0 12 12" className="w-3 h-3 text-white">
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
)}
```

兩顆 segmented 之間用 `gap-3`（12px），不用實線 divider。

### 4.3 Pill button group（扣款日期 / 扣款金額 preset，3 選 1）

3 顆等寬 pill：`grid grid-cols-3 gap-3`：

| 狀態 | className |
|---|---|
| Unselected | `h-12 rounded-lg border border-line bg-surface-card text-sm text-ink-AAA hover:bg-black/5` |
| Selected | `h-12 rounded-lg border-2 border-ink-AAA bg-surface-card text-sm font-medium text-ink-AAA` |

差別在 `border` vs `border-2 border-ink-AAA`。**不**用 brand 紅選中，對齊 Figma（中性深色 outline 表 active）。

### 4.4 Amount input（TWD 前綴）

實作為 `<div>` wrapper 包 `<span>` 前綴 + `<input>`，**不**用 `input` 的 padding 模擬前綴：

```tsx
<div className="flex items-center h-12 rounded-lg border border-line bg-surface-card
                px-4 focus-within:border-2 focus-within:border-ink-AAA">
  <span className="text-sm text-ink-AAA mr-3 select-none">TWD</span>
  <input
    type="text"
    inputMode="numeric"
    pattern="[0-9]*"
    aria-label="自訂金額"
    placeholder="請輸入金額"
    value={form.amountInputRaw}                                     // v0.2 — 綁 raw
    onChange={(e) => dispatch({ type: 'SET_INPUT', raw: e.target.value })}
    className="flex-1 bg-transparent text-sm text-ink-AAA
               placeholder:text-ink-A focus:outline-none"
  />
</div>
```

- `type="text"` + `inputMode="numeric"` + `pattern="[0-9]*"`：觸發手機數字鍵盤，避開 iOS Safari `type=number` 的 e/-/0~9 廣鍵盤；同時讓 `parseInt` 前 strip 非數字（容錯「1,000」「TWD 500」）
- type=text 自然無 spinner 箭頭
- 不寫死 max 字數，靠 `parseAmount` 規則：strip 非數字 → integer → `>= 1` 才視為 valid

### 4.5 整體 `<form>` semantic + sticky footer（v0.2 — submit-on-Enter）

整個 sheet body 用 `<form onSubmit>` 包起來，「下一步」是 `type="submit"`。理由：

- **使用者在 input 按 Enter** 自動觸發 submit（行動裝置軟鍵盤的「Done / Go」鍵也對應）
- HTML semantic 對 screen reader / 測試工具友善（`getByRole('form')` / role="form" 可用）
- disabled state 由 `<button type="submit" disabled={!isValid}>` 直接 gate；Enter 在 disabled 時 native 不會觸發 submit handler

```tsx
<form
  onSubmit={(e) => {
    e.preventDefault()
    handleSubmit()           // v0.4：router.push 串 009a confirm 頁；hook 內已 gate isValid
  }}
>
  {/* segmented / pills / input */}
  <div className="sticky bottom-0 -mx-5 -mb-4 px-5 py-3 pt-2 bg-surface-card
                  border-t border-line">
    <button
      type="submit"                                         // v0.2 — 不再是 type="button"
      disabled={!isValid}
      className="w-full h-12 rounded-full bg-brand text-white text-base font-semibold
                 disabled:bg-black/10 disabled:text-ink-A
                 focus-visible:outline focus-visible:outline-2
                 focus-visible:outline-offset-2 focus-visible:outline-brand"
    >
      下一步
    </button>
  </div>
</form>
```

> Disabled 樣式：4885 是**淺灰 bg + 淡灰字**（非降低 brand red opacity），用 `disabled:bg-black/10 disabled:text-ink-A` 對齊。

---

## 5. 驗證 / 「下一步」

### 5.1 enabled 條件（v0.6 — 加最小金額 gate）

```ts
const isValid =
  form.amount !== null &&
  form.amount.value >= MIN_PRESET_AMOUNT &&             // v0.6 — 最小金額 = preset 最小值
  (form.donationFrequency === 'ONE_TIME' || form.billingDay !== null)
```

> ONE_TIME 不需 billingDay；RECURRING 三條件都要（對應 BE 022 §4.1 INVALID_BILLING_DAY 規約）。
>
> **v0.6 — 最小金額**：`MIN_PRESET_AMOUNT = Math.min(...PRESET_AMOUNTS)`（目前 100）。`PRESET_AMOUNTS` 從 component 提升到 `useDonationSettingsForm.ts` export，讓 hook（isValid）跟 component（min hint + preset 渲染）共用一份 source of truth。
>
> **UI 行為**：自訂金額被 `parseAmount` 接受但 `value < MIN_PRESET_AMOUNT` 時，input 下方出現紅色提示「本專案最低捐款金額為 {MIN_PRESET_AMOUNT}」（`<p role="alert" className="text-brand text-xs">`），同時 input 帶 `aria-invalid` + `aria-describedby`。空 input / 非數字 input 不顯示此提示（屬於另一種「沒輸入有效金額」狀態，UI 已透過 disabled submit 表達）。

### 5.2 Submit payload（v0.5 — 對齊 BE 022 body）

```ts
// 對齊 BE 022 §4.1 / §4.2 CharityDonationBody / ProjectDonationBody 部分子集。
// 缺 donorName / receiptOption / isAnonymous（在 [009a confirm 頁](./009a-donation-confirm.md) 補；本 sheet 只收捐款設定）。
type DonationSettingsPayload = {
  target: { type: 'CHARITY' | 'DONATION_PROJECT'; id: string }
  donationFrequency: 'ONE_TIME' | 'RECURRING'
  billingDay: 'DAY_6' | 'DAY_16' | 'DAY_26' | null   // ONE_TIME 時必為 null
  amountTwd: number                                    // 已驗證 1 ~ 1_000_000
}

function buildPayload(form: FormState, target: DonationTarget): DonationSettingsPayload {
  return {
    target,
    donationFrequency: form.donationFrequency,
    billingDay: form.donationFrequency === 'ONE_TIME' ? null : form.billingDay,
    amountTwd: form.amount!.value,    // isValid 已 guard；命名對齊 BE Order.amountTwd
  }
}

// handleSubmit (v0.5 — 串接 spec 009a confirm 頁，query 命名全用 BE enum):
const payload = buildPayload(form, target)
const params = new URLSearchParams({
  targetType: payload.target.type,                      // 'CHARITY' | 'DONATION_PROJECT'
  targetId: payload.target.id,
  donationFrequency: payload.donationFrequency,          // 'ONE_TIME' | 'RECURRING'
  ...(payload.billingDay !== null && { billingDay: payload.billingDay }),  // 'DAY_6' | 'DAY_16' | 'DAY_26'
  amountTwd: String(payload.amountTwd),
})
router.push(`/checkout/donation?${params.toString()}`)
onClose()
```

跳轉到 [009a `/checkout/donation` 確認頁](./009a-donation-confirm.md)。Confirm 頁 RSC 用 Zod 重新驗證 query params（防使用者亂改 URL），fail → 404。

> v0.1~0.2 用 `console.log` 是因為 confirm 頁還沒存在。v0.3 接上 009a 後 UI 流程完整。confirm 頁的「確認送出」按鈕仍是 `console.log` placeholder（依 brief.md「不接金流」）。

---

## 6. a11y

- segmented + pill group 用 `<button role="radio">` 與 `<div role="radiogroup" aria-label="...">` 包起、`aria-checked` 表選中狀態
- Amount input：`type="text" inputMode="numeric" pattern="[0-9]*"`、`aria-label="自訂金額"`
- 切換 RECURRING → ONE_TIME 時隱藏扣款日期 section（DOM 上 unmount，不是 `display:none`），SR 讀者能感知 section 數變化

> 其餘 modal 級 a11y（focus trap / scroll lock / esc / role=dialog）由 [008a §6](./008a-bottom-sheet.md#6-a11y--鍵盤) 提供，本元件不重複。

---

## 7. 測試（colocated `DonationSettingsSheet.test.tsx`）

| # | 案例 | 期望 |
|---|---|---|
分三層測：reducer pure / hook 整合 / UI 渲染。pure function 最便宜，UI 最貴，遵循「能在底層測就不要拉到上層」。

### 7.1 Reducer pure unit tests（無 React mount，最便宜）

`reducer` 是 pure function，可直接 import 測：

| # | 案例 | 期望 |
|---|---|---|
| R1 | `reducer(DEFAULT_FORM, {type:'SET_FREQUENCY', donationFrequency:'ONE_TIME'})` | billingDay 自動變 null |
| R2 | SET_PRESET → state.amount = {source:'preset', value}；**amountInputRaw=String(value)**（v0.6 — 自動帶入 input） | OK |
| R3 | SET_INPUT "100" → amount = {source:'input', value:100}；raw="100" | OK |
| R4 | SET_INPUT "00" → amount=null；raw="00"（**raw 保留**，不被清空） | 解 ghost-reset |
| R5 | SET_INPUT "1,500" → amount.value=1500（parseAmount strip 逗號）；raw="1,500" | OK |
| R6 | SET_INPUT "" → amount=null；raw="" | OK |
| R7 | RESET → DEFAULT_FORM | OK |

### 7.2 Hook integration tests（`useDonationSettingsForm.test.ts`，v0.4）

用 `renderHook()` from `@testing-library/react`，mock `next/navigation` 的 `useRouter`。**不需要** 真正 mount UI、不需要 sonner。

| # | 案例 | 期望 |
|---|---|---|
| H1 | 初始 hook → isValid=false、form=DEFAULT_FORM（donationFrequency='RECURRING'） | OK |
| H2 | dispatch SET_PRESET 100 + 預設 RECURRING + billingDay 仍 null → isValid=false | OK |
| H3 | dispatch SET_BILLING_DAY 'DAY_16' + SET_PRESET 100 → isValid=true | OK |
| H3b (v0.6) | SET_INPUT "50" (< MIN_PRESET_AMOUNT) + DAY_6 → isValid=false（金額未達 min） | OK |
| H3c (v0.6) | SET_INPUT "100" (= MIN_PRESET_AMOUNT) + DAY_6 → isValid=true | OK |
| H4 | dispatch SET_FREQUENCY 'ONE_TIME' + SET_PRESET 100 → isValid=true（不需 day） | OK |
| H5 | handleSubmit (isValid) → routerPush called with URL 包含 `targetType=CHARITY` + `donationFrequency=RECURRING` + `billingDay=DAY_16` + `amountTwd=100` + onClose called | mock router |
| H6 | handleSubmit (!isValid) → routerPush **not** called（雙重保險） | OK |
| H7 | opts.open false → true rerender → form 重置（即使 dispatch 過內容） | useEffect-on-open |

> Hook 測試 ≈ 7 個整合行為點。比 component test 跑得快（無 DOM）、比 reducer test 涵蓋面廣（含 router 整合）。

### 7.3 Component visual tests（`DonationSettingsSheet.test.tsx`，v0.4 — 變薄）

UI 渲染端，可大幅縮減（邏輯已在 hook test 覆蓋）：

| # | 案例 | 期望 |
|---|---|---|
| 1 | 渲染 sheet header + 三個 section（捐款類型 / 扣款日期 / 扣款金額）+ submit button | OK |
| 2 | RECURRING → 扣款日期 section 渲染；ONE_TIME → 扣款日期 section unmount | UI 條件渲染 |
| 3 | 點 preset 100 → 該 pill 渲染為 selected 樣式（`border-2 border-ink-AAA`）| 視覺 |
| 3b (v0.6) | 點 preset → input value 跟著變成該金額字串（"500" / "1000"） | 自動帶入 |
| 5b (v0.6) | 自訂金額 50 → 顯示「本專案最低捐款金額為 100」紅字 + submit disabled | min hint |
| 5c (v0.6) | 自訂金額 100 → 不顯示紅字 | 等於 min 不算違反 |
| 5d (v0.6) | 空 input → 不顯示紅字（只有 disabled submit） | UI 不打擾 |
| 4 | input value 等於 form.amountInputRaw（受控） | bug 5 regression guard |
| 5 | submit button 在 isValid=false 時 disabled / true 時 enabled | 視覺 |
| 6 | 在 input 按 Enter → form submit handler 被叫 | form semantic |

> Component test 可以用 mock 過的 hook（`vi.mock('./useDonationSettingsForm')` 回 stub 值）測純視覺；或用整合方式測「component 渲染後 hook 真實邏輯也跑通」。v0.4 建議**整合測**——hook 已有 H1~H7 純測，component test 多覆蓋一次視覺整合也只多花 ~50ms。

---

## 8. 開放問題

- **草稿保留**：v0.1 每次 open 都 reset；商業考量在「結帳放棄率」高時值得加 sessionStorage
- **min/max amount**：v0.5 起 `parseAmount` 上限改 `<= 1_000_000`（對齊 BE 022 §4.1 `amountTwd: Type.Integer({ minimum: 1, maximum: 1_000_000 })`），sheet 內 UI 不顯式提示但內部 gate 一致
- **金額顯示格式**：preset 寫死「TWD 100 / 500 / 1,000」（最大有千分位）；自訂金額 input 不格式化（純數字）。若要 input 也顯示千分位，需額外 mask 邏輯，v0.1 不做

---

## 9. 變更紀錄

| 版本 | 日期 | 變更 |
|---|---|---|
| 0.1 | 2026-06-15 | 從 [spec 008 v0.3](./008-donation-checkout-sheets.md) §3.2 抽出獨立 spec |
| 0.2 | 2026-06-15 | 三個 production 最佳實踐補完：(a) **`amountInputRaw` 跟 `amount` 拆兩欄**——解 v0.1 「使用者刪一個字、整欄被清空」的 ghost-reset bug；input value 永遠綁 raw，amount 並行算 valid；(b) **`useState` → `useReducer`**——4 條 cross-field transition 集中、pure function 可獨立 unit test、補 R1~R7 reducer tests；(c) **整 sheet body 用 `<form onSubmit>` + button `type="submit"`**——支援 input Enter submit / iOS Done 鍵、SR friendly、native disabled gate |
| 0.3 | 2026-06-15 | submit handler 從 `console.log` 改為 `router.push('/checkout/donation?...')`，串接 [009a confirm 頁](./009a-donation-confirm.md) |
| 0.4 | 2026-06-15 | **抽 `useDonationSettingsForm` custom hook**：把 useReducer call site + useEffect reset + isValid + handleSubmit + router.push 整合層搬出 component；component 變純 UI 層、零 React hook 呼叫（除了 hook 本身）。三層 test plan：reducer R1~R7 pure / hook H1~H7 integration / component 6 個視覺。pattern 對齊 [008 index §5 v0.6 共同決策](./008-donation-checkout-sheets.md#5-共同決策跨-spec-一次說清楚) |
| 0.5 | 2026-06-15 | **enum / payload / URL 全面對齊 backend spec 021 / 022**（Option C）：(a) `DonationType: 'monthly'\|'oneTime'` → `DonationFrequency: 'ONE_TIME'\|'RECURRING'`；(b) `ChargeDay: 6\|16\|26` (int) → `BillingDay: 'DAY_6'\|'DAY_16'\|'DAY_26'` (string enum)；(c) `target.type: 'charity'\|'donation'` → `'CHARITY'\|'DONATION_PROJECT'`（對應 BE OrderSubjectType）；(d) Payload field rename `amount` → `amountTwd`；(e) Action rename `SET_TYPE/SET_DAY` → `SET_FREQUENCY/SET_BILLING_DAY`；(f) `parseAmount` 加上限 `<= 1_000_000`；(g) DEFAULT_FORM `donationFrequency` 預設改 `RECURRING`（同義對齊原 `monthly` default）；(h) router.push query params 用 BE enum 值。BFF 收到 form payload 後可直接 forward 給 BE 022 endpoint，無需 mapping 層 |
| 0.6 | 2026-06-15 | **UX 強化兩條**：(a) 點 preset 不再清空 input；改為 `raw = String(value)` 自動帶入「請輸入金額」欄位（行為更直覺、preset / input 視覺一致）；(b) 引入**最小金額 gate**：`PRESET_AMOUNTS` 跟 `MIN_PRESET_AMOUNT` 從 component 升到 hook 模組 export；`isValid` 加 `>= MIN_PRESET_AMOUNT` 條件；當 input 已 parse 出 `value < MIN_PRESET_AMOUNT` 時 input 下方渲染紅字 `<p role="alert" className="text-brand text-xs">本專案最低捐款金額為 {MIN_PRESET_AMOUNT}</p>`，並把 `aria-invalid` / `aria-describedby` 連到 input 上。空 input / 非數字 input 不顯示此 hint（不打擾）。新增 R2 改寫、H3b/H3c、component 3b/5b/5c/5d 共 7 個測試案例。對應 spec 008b §3.3 / §3.4 / §4.4 / §5.1 |
