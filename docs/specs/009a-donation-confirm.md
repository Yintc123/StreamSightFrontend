# Spec 009a：`/checkout/donation` 捐款確認頁

- **狀態**：Draft（v0.3 — 改用 [009c shared confirm UI](./009c-shared-confirm-ui.md) primitives，移除 inline className）
- **路徑（規劃）**：
  - `src/app/checkout/donation/page.tsx`（RSC）
  - `src/app/checkout/donation/useDonorInfoForm.ts` + `.test.ts`（v0.2 — pure logic hook）
  - `src/app/checkout/donation/DonorInfoForm.tsx` + `.test.tsx`（v0.2 起為純 UI）
- **依賴**：
  - [009 index §2 routing](./009-checkout-confirm.md#2-routing) — 接收 query params
  - [009c shared confirm UI](./009c-shared-confirm-ui.md) — `<ConfirmPageShell>` / `<ConfirmPanel>` / `<KeyValueList>` / `<DisclaimerBox>` / `<RequiredLabel>` 等 primitive
  - 既有 RSC fetcher：`fetchCharityDetail` / `fetchDonationDetail`（[004 §3](./004-detail-pages.md)）
  - [008b v0.2 reducer pattern](./008b-donation-settings-sheet.md#32-reducer-patternv02--取代-v01-的-usestate--setform)（form state 套路）
- **Figma 對應**：IMG_4888（charity 直接捐款）+ IMG_4889（donation 專案捐款，layout 完全相同）

---

## 1. 職責

接收 [008b 捐款設定 sheet](./008b-donation-settings-sheet.md)「下一步」傳來的 query payload，顯示：

1. **捐款明細**（read-only summary，根據 target 是 charity / donation 取對應名稱）
2. **捐款人基本資料**表單（收據開立方式 dropdown + 姓名 input + disclaimer）
3. **送出按鈕**（sticky bottom，validated 才 enabled）

送出 = `console.log(完整 payload) + toast.success('已送出') + （未來 router.push 付款頁）`。

---

## 2. URL Query → Page Props

`/checkout/donation?targetType=charity&targetId=<uuid>&donationType=monthly&chargeDay=16&amount=500`

```ts
// page.tsx
import { z } from 'zod'
import { notFound } from 'next/navigation'

const Query = z.object({
  targetType: z.enum(['charity', 'donation']),
  targetId: z.string().uuid(),
  donationType: z.enum(['monthly', 'oneTime']),
  chargeDay: z.coerce.number().int().refine((n): n is 6 | 16 | 26 =>
    [6, 16, 26].includes(n),
  ).optional(),
  amount: z.coerce.number().int().min(1),
}).refine(
  (q) => q.donationType === 'oneTime' || q.chargeDay !== undefined,
  { message: 'chargeDay required when monthly' },
)

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const sp = await searchParams
  const parsed = Query.safeParse(sp)
  if (!parsed.success) notFound()
  const q = parsed.data

  // 撈 target 顯示名稱
  const target = q.targetType === 'charity'
    ? await fetchCharityDetail(q.targetId)
    : await fetchDonationDetail(q.targetId)
  if (!target) notFound()

  return <DonationConfirmPage query={q} target={target} />
}
```

Zod 不通過或 fetch 404 → Next 404 page。

---

## 3. 元件結構

```
<page.tsx> (RSC, async)
  ├─ Zod validate searchParams
  ├─ fetch target by id
  └─ <DonationConfirmPage> ('use client')
        └─ <ConfirmPageShell title="確認捐款資訊" ctaLabel="確認送出" isValid onSubmit>
              ├─ <ConfirmPanel title="捐款明細" variant="first">     ← Panel 1
              │     └─ <KeyValueList> + <KeyValueRow> × N
              └─ <ConfirmPanel title="捐款人基本資料">                ← Panel 2
                    ├─ <DisclaimerBox>{DISCLAIMER_PLATFORM}</DisclaimerBox>
                    ├─ <RequiredLabel htmlFor="receiptType">收據開立方式</RequiredLabel>
                    │  + <select>...</select>
                    └─ <RequiredLabel htmlFor="donorName">捐款人姓名</RequiredLabel>
                       + <input>
```

整頁 `<form>` + 紅 hero + TopNav + sticky CTA 由 [`<ConfirmPageShell>`](./009c-shared-confirm-ui.md#21-confirmpageshell--整頁外殼) 接管，本 spec 不複述。

> **為何 `<DonationConfirmPage>` 是 client**：要持 form state（reducer）+ 處理 submit + 接 toast。`<ConfirmPanel>` 等 primitive 本身可 server-render，但 wrapper 是 client → 整棵自然 client 化；對 demo 規模不影響。

---

## 4. Panel 1：捐款明細

對齊 IMG_4888 / 4889（兩張 layout 完全相同，只是資料來源不同）：

```
┌──────────────────────────────────────┐
│           捐款明細                    │  ← h2 置中
│                                       │
│   捐款專案     直接捐款給團體 |        │  ← charity 直捐 vs donation 專案
│              專案名稱                  │
│   捐款對象     {charity.name}         │
│   捐款類型     定期捐款 | 單次捐款     │
│   扣款週期     每月 N 日              │  ← 只在 monthly 顯示
│   下次扣款日期 YYYY/MM/DD             │  ← 只在 monthly 顯示
│   捐款金額     TWD N                  │  ← brand 紅字加重
└──────────────────────────────────────┘
```

### 4.1 「捐款專案」一行的內容

| `targetType` | 「捐款專案」顯示 |
|---|---|
| `'charity'` | `"直接捐款給團體"`（hardcoded 字串）|
| `'donation'` | `target.name`（捐款專案名稱，如 "偏鄉AI 數位學習計畫－給孩子一雙探索未來的雙手"） |

「捐款對象」一行：

| `targetType` | 顯示 |
|---|---|
| `'charity'` | `target.name`（charity 名）|
| `'donation'` | `target.charity.name`（該專案的主辦團體名稱，從 `DonationDetail.charity` 取）|

### 4.2 「下次扣款日期」計算

```ts
function computeNextChargeDate(chargeDay: 6 | 16 | 26, today = new Date()): Date {
  const thisMonth = new Date(today.getFullYear(), today.getMonth(), chargeDay)
  if (thisMonth >= today) return thisMonth
  return new Date(today.getFullYear(), today.getMonth() + 1, chargeDay)
}

// 顯示格式 yyyy/MM/dd，跟 IMG_4888 對齊
function fmtDate(d: Date): string {
  return `${d.getFullYear()}/${String(d.getMonth()+1).padStart(2,'0')}/${String(d.getDate()).padStart(2,'0')}`
}
```

> 用 client local time。Demo 不接 server time / 時區同步；真實金流 production 應 server 算避免使用者改本機時鐘繞 schedule（v0.1 開放問題 [009 §6](./009-checkout-confirm.md#6-開放問題跨-spec)）。

### 4.3 完整渲染 reference

```tsx
import { ConfirmPanel } from '@/components/ui/ConfirmPanel'
import { KeyValueList, KeyValueRow } from '@/components/ui/KeyValueList'

function DonationDetailPanel({ query, target }: {
  query: DonationCheckoutQuery
  target: CharityDetail | DonationDetail
}) {
  const projectName = query.targetType === 'charity'
    ? '直接捐款給團體'
    : (target as DonationDetail).name
  const charityName = query.targetType === 'charity'
    ? (target as CharityDetail).name
    : (target as DonationDetail).charity.name
  const typeLabel = query.donationType === 'monthly' ? '定期捐款' : '單次捐款'
  const nextChargeDate = query.donationType === 'monthly'
    ? computeNextChargeDate(query.chargeDay!)
    : null

  return (
    <ConfirmPanel title="捐款明細" variant="first">
      <KeyValueList>
        <KeyValueRow label="捐款專案">{projectName}</KeyValueRow>
        <KeyValueRow label="捐款對象">{charityName}</KeyValueRow>
        <KeyValueRow label="捐款類型">{typeLabel}</KeyValueRow>
        {query.donationType === 'monthly' && (
          <>
            <KeyValueRow label="扣款週期">每月 {query.chargeDay} 日</KeyValueRow>
            <KeyValueRow label="下次扣款日期">
              <time dateTime={nextChargeDate!.toISOString().slice(0, 10)}>
                {fmtDate(nextChargeDate!)}
              </time>
            </KeyValueRow>
          </>
        )}
        <KeyValueRow label="捐款金額" variant="emphasized">
          TWD {priceFmt.format(query.amount)}
        </KeyValueRow>
      </KeyValueList>
    </ConfirmPanel>
  )
}
```

> `<ConfirmPanel variant="first">` 自帶 `-mt-6` 蓋紅 hero；`<KeyValueRow variant="emphasized">` 自帶 brand 紅字加粗。className 細節見 [009c §2.2 / §2.3](./009c-shared-confirm-ui.md#22-confirmpanel--白色卡片)。

---

## 5. Panel 2：捐款人基本資料

對齊 IMG_4888：

```
┌──────────────────────────────────────┐
│         捐款人基本資料                │  ← h2 置中
│                                       │
│  ┌─────────────────────────────┐    │  ← Disclaimer 灰色背景 / 邊框
│  │ 街口金融科技作為捐款平台之     │    │
│  │ 服務提供者，將會蒐集、處理…    │    │
│  └─────────────────────────────┘    │
│                                       │
│  收據開立方式 *                       │
│  ┌─────────────────────────────┐    │
│  │ 都不需要              ▼      │    │  ← <select> dropdown
│  └─────────────────────────────┘    │
│                                       │
│  捐款人姓名 *                         │
│  ┌─────────────────────────────┐    │
│  │ 請填寫姓名                    │    │  ← <input> text
│  └─────────────────────────────┘    │
│                                       │
│  (其他欄位 — 截圖未拉到底，TBD)        │
└──────────────────────────────────────┘
```

### 5.1 Disclaimer

實作於 [`<DisclaimerBox>`](./009c-shared-confirm-ui.md#24-disclaimerbox--灰底注意事項框)；預設文案 `DISCLAIMER_PLATFORM` 同檔 export：

```tsx
import { DisclaimerBox, DISCLAIMER_PLATFORM } from '@/components/ui/DisclaimerBox'

<DisclaimerBox className="mb-4">{DISCLAIMER_PLATFORM}</DisclaimerBox>
```

文案內容：「街口金融科技作為捐款平台之服務提供者，將會蒐集、處理或利用捐款人填寫之個人資料，並僅提供予機關團體作為收據開立及稅務目的之使用。」

### 5.2 收據開立方式 dropdown

`<select>`，v0.1 options：

```ts
const RECEIPT_TYPES = ['都不需要', '個人', '公司'] as const
type ReceiptType = (typeof RECEIPT_TYPES)[number]
const DEFAULT_RECEIPT_TYPE: ReceiptType = '都不需要'
```

> 完整 options 與「個人 / 公司」選後是否要展開額外欄位（統編 / 抬頭 / 地址），列入 [009 §6 開放問題](./009-checkout-confirm.md#6-開放問題跨-spec)。v0.1 只保 select 三個值，不展開條件 fields。

### 5.3 捐款人姓名 input

`<input type="text">`，required（client 端非空驗證）。

### 5.4 Form state（reducer，對齊 [008b §3.2](./008b-donation-settings-sheet.md)）

```ts
interface FormState {
  receiptType: ReceiptType
  donorName: string         // 受控原始字串；validation 在 submit 算
}

const DEFAULT_FORM: FormState = {
  receiptType: DEFAULT_RECEIPT_TYPE,
  donorName: '',
}

type Action =
  | { type: 'SET_RECEIPT_TYPE'; value: ReceiptType }
  | { type: 'SET_DONOR_NAME'; value: string }

function reducer(s: FormState, a: Action): FormState {
  switch (a.type) {
    case 'SET_RECEIPT_TYPE': return { ...s, receiptType: a.value }
    case 'SET_DONOR_NAME':   return { ...s, donorName: a.value }
  }
}
```

> 跟 [008b](./008b-donation-settings-sheet.md) 一樣，input value 直接綁 state、不需 raw/parsed 拆兩欄（姓名是純字串、無 parse 步驟、不會 ghost-reset）。

### 5.5 Validation

```ts
const isValid = form.donorName.trim().length > 0
```

`receiptType` 永遠有 default、不會 invalid。

### 5.6 `useDonorInfoForm` hook（v0.2 — container 邏輯抽出）

對齊 [008b §3.6](./008b-donation-settings-sheet.md) container / presentational 分層：useReducer + isValid + handleSubmit 搬進 hook，DonorInfoForm component 變純 UI。

```ts
// src/app/checkout/donation/useDonorInfoForm.ts
'use client'
import { useReducer } from 'react'
import { toast } from 'sonner'

export type UseDonorInfoFormOpts = {
  query: DonationCheckoutQuery
  target: CharityDetail | DonationDetail
}

export type UseDonorInfoFormReturn = {
  form: FormState
  dispatch: React.Dispatch<Action>
  isValid: boolean
  handleSubmit: () => void
}

export function useDonorInfoForm(
  opts: UseDonorInfoFormOpts,
): UseDonorInfoFormReturn {
  const [form, dispatch] = useReducer(reducer, DEFAULT_FORM)
  const isValid = form.donorName.trim().length > 0

  const handleSubmit = () => {
    if (!isValid) return
    const payload = buildPayload(opts.query, opts.target, form)
    console.log('[checkout/donation/confirm]', payload)
    toast.success('已送出（demo 不接金流）')
    // 未來：router.push('/checkout/payment?...')
  }

  return { form, dispatch, isValid, handleSubmit }
}
```

**Page-level component（純 UI）**：見 [§6 整頁外殼 + Sticky CTA](#6-整頁外殼--sticky-cta)，用 `<ConfirmPageShell>` 包 `<DonationDetailPanel>`（§4.3）+ `<DonorInfoFormPanel>`（§5.7）即可。

### 5.7 `<DonorInfoFormPanel>` reference

純 props-driven Panel 2 內容（disclaimer + 收據 dropdown + 姓名 input），無自己的 state：

```tsx
import { ConfirmPanel } from '@/components/ui/ConfirmPanel'
import { DisclaimerBox, DISCLAIMER_PLATFORM } from '@/components/ui/DisclaimerBox'
import { RequiredLabel } from '@/components/ui/RequiredLabel'

type DonorInfoFormPanelProps = {
  form: FormState
  dispatch: React.Dispatch<Action>
}

export function DonorInfoFormPanel({ form, dispatch }: DonorInfoFormPanelProps) {
  return (
    <ConfirmPanel title="捐款人基本資料">
      <DisclaimerBox className="mb-4">{DISCLAIMER_PLATFORM}</DisclaimerBox>

      <RequiredLabel htmlFor="receiptType" className="mb-2">收據開立方式</RequiredLabel>
      <select
        id="receiptType"
        value={form.receiptType}
        onChange={(e) => dispatch({ type: 'SET_RECEIPT_TYPE', value: e.target.value as ReceiptType })}
        className="w-full h-12 rounded-lg border border-line bg-surface-card px-3 text-sm text-ink-AAA mb-4"
      >
        {RECEIPT_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
      </select>

      <RequiredLabel htmlFor="donorName" className="mb-2">捐款人姓名</RequiredLabel>
      <input
        id="donorName"
        type="text"
        placeholder="請填寫姓名"
        value={form.donorName}
        onChange={(e) => dispatch({ type: 'SET_DONOR_NAME', value: e.target.value })}
        className="w-full h-12 rounded-lg border border-line bg-surface-card px-3 text-sm text-ink-AAA placeholder:text-ink-A focus:border-2 focus:border-ink-AAA focus:outline-none"
      />
    </ConfirmPanel>
  )
}
```

---

## 6. 整頁外殼 + Sticky CTA

整頁 `<form>` + 紅 hero + TopNav + sticky「確認送出」按鈕由 [`<ConfirmPageShell>`](./009c-shared-confirm-ui.md#21-confirmpageshell--整頁外殼) 統一接管：

```tsx
import { ConfirmPageShell } from '@/components/ui/ConfirmPageShell'

export function DonationConfirmPage({ query, target }: Props) {
  const { form, dispatch, isValid, handleSubmit } = useDonorInfoForm({ query, target })
  return (
    <ConfirmPageShell
      title="確認捐款資訊"
      ctaLabel="確認送出"
      isValid={isValid}
      onSubmit={handleSubmit}
    >
      <DonationDetailPanel query={query} target={target} />
      <DonorInfoFormPanel form={form} dispatch={dispatch} />
    </ConfirmPageShell>
  )
}
```

submit 行為（`console.log` + `toast.success` + future `router.push`）封裝在 [`useDonorInfoForm.handleSubmit`](#56-usedonorinfoform-hookv02--container-邏輯抽出)；page component 不重複寫。

`<StickyConfirmCta>` 在 `<ConfirmPageShell>` 內部由 [009c §2.6](./009c-shared-confirm-ui.md#26-stickyconfirmcta--sticky-底部送出按鈕) 渲染，caller 不需手動掛。

### 6.1 Submit payload shape

```ts
type DonationConfirmPayload = {
  target: { type: 'charity' | 'donation'; id: string; name: string }
  donationType: 'monthly' | 'oneTime'
  chargeDay: 6 | 16 | 26 | null
  amount: number
  nextChargeDate: string | null     // yyyy/MM/dd; oneTime → null
  donor: {
    receiptType: ReceiptType
    name: string
  }
}
```

---

## 7. a11y

- 整 page 包 `<form>`、submit button `type="submit"`
- Required 欄位用 `<span aria-hidden>*</span>` + `<span className="sr-only">必填</span>` 雙重標記
- `<select>` 用原生 element 確保鍵盤 / VoiceOver 行為正確（避免自製 dropdown 的 a11y 雷區）
- disclaimer 用 `<p>` 而非 `<div>`（SR 讀為段落而非 generic）
- next charge date 用 `<time dateTime="2026-06-16">2026/06/16</time>` semantic

---

## 8. 測試

三層測：reducer pure / hook integration / component visual。

### 8.1 Reducer pure unit tests

| # | 案例 | 期望 |
|---|---|---|
| R1 | SET_RECEIPT_TYPE → state.receiptType 更新 | OK |
| R2 | SET_DONOR_NAME "Alice" → state.donorName="Alice" | OK |
| R3 | SET_DONOR_NAME "" → state.donorName="" | OK |

### 8.2 Hook integration tests（`useDonorInfoForm.test.ts`，v0.2）

mock `sonner.toast`，用 `renderHook()`：

| # | 案例 | 期望 |
|---|---|---|
| H1 | 初始 isValid=false（donorName=''） | OK |
| H2 | dispatch SET_DONOR_NAME "Alice" → isValid=true | OK |
| H3 | dispatch SET_DONOR_NAME "   " → isValid=false（trim 後空） | OK |
| H4 | handleSubmit (isValid) → toast.success called + console.log 印出含 query/target/form 的 payload | OK |
| H5 | handleSubmit (!isValid) → toast.success **not** called（雙重保險） | OK |

### 8.3 Component visual tests（`DonorInfoForm.test.tsx`，v0.2 — 變薄）

| # | 案例 | 期望 |
|---|---|---|
| 1 | 渲染 「捐款明細」+「捐款人基本資料」panel + sticky CTA | OK |
| 2 | submit button 視 isValid disabled/enabled 切換 | UI |
| 3 | 在姓名 input 打字 → input value 跟著變、submit button 由 disabled 變 enabled | UI 整合 |
| 4 | 在姓名 input 按 Enter → form onSubmit handler 觸發 | form semantic |

### 8.3 Page-level（integration / e2e 可選）

- `/checkout/donation?targetType=charity&targetId=<valid>&donationType=monthly&chargeDay=16&amount=500` → 200 + 各欄位顯示對
- 同上但 amount=0 → 404
- 同上但 chargeDay 缺（monthly 必須有）→ 404
- 同上但 targetId 不存在 → 404

E2E 後續可加，本 v0.1 不強制。

---

## 9. 開放問題

- **收據選項展開欄位**：個人選後是否要填統編 / 抬頭 / 地址？公司同理？等設計確認
- **截圖未顯示完整 form 欄位**：4888 拉到底可能還有電話 / email / 地址，等補圖
- **client-side 算下次扣款日期**：見 [009 §6](./009-checkout-confirm.md#6-開放問題跨-spec)，prod 改 server time
- **i18n disclaimer**：街口金融科技字串 hardcode 中文；i18n 上線後抽 string table

---

## 10. 變更紀錄

| 版本 | 日期 | 變更 |
|---|---|---|
| 0.1 | 2026-06-15 | 初版：對應 IMG_4888 / 4889；定義 Zod query schema、target fetch 流程、capture 兩種 targetType 的「捐款專案 / 對象」對應邏輯、下次扣款日期 client computation、reducer + 6 個 component test |
| 0.2 | 2026-06-15 | **抽 `useDonorInfoForm` custom hook**：對齊 [008b v0.4](./008b-donation-settings-sheet.md) container / presentational 分層；hook 包 useReducer + isValid + handleSubmit + sonner toast。三層 test plan：reducer R1~R3 / hook H1~H5 / component 4 個視覺 |
| 0.3 | 2026-06-15 | **改用 [009c shared confirm UI](./009c-shared-confirm-ui.md) primitives**：整頁外殼換 `<ConfirmPageShell>`、明細 panel 換 `<ConfirmPanel>` + `<KeyValueList>`、disclaimer 換 `<DisclaimerBox>` + `DISCLAIMER_PLATFORM` const、必填 label 換 `<RequiredLabel>`、sticky CTA 由 shell 內部接管。移除 §4.3 / §5.1 / §6 inline className；新增 §5.7 `<DonorInfoFormPanel>` reference 完整 JSX |
