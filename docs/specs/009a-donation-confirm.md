# Spec 009a：`/checkout/donation` 捐款確認頁

- **狀態**：Draft（v0.12 — 加 `<ReminderNote>` 到 Panel 2 底部，參考 IMG_4891）
- **路徑（規劃）**：
  - `src/app/checkout/donation/page.tsx`（RSC）
  - `src/app/checkout/donation/useDonorInfoForm.ts` + `.test.ts`（v0.2 — pure logic hook）
  - `src/app/checkout/donation/DonorInfoForm.tsx` + `.test.tsx`（v0.2 起為純 UI）
- **依賴**：
  - [009 index §2 routing](./009-checkout-confirm.md#2-routing) — 接收 query params
  - [009c shared confirm UI](./009c-shared-confirm-ui.md) — `<ConfirmPageShell>` / `<ConfirmPanel>` / `<KeyValueList>` / `<DisclaimerBox>` / `<RequiredLabel>` / `<ReminderNote>` 等 primitive
  - 既有 RSC fetcher：`fetchCharityDetail` / `fetchDonationDetail`（[004 §3](./004-detail-pages.md)）
  - [008b v0.2 reducer pattern](./008b-donation-settings-sheet.md#32-reducer-patternv02--取代-v01-的-usestate--setform)（form state 套路）
- **Figma 對應**：IMG_4888（charity 直接捐款）+ IMG_4889（donation 專案捐款，layout 完全相同）+ IMG_4891（v0.12 Panel 2 底部小提醒）

---

## 1. 職責

接收 [008b 捐款設定 sheet](./008b-donation-settings-sheet.md)「下一步」傳來的 query payload，顯示：

1. **捐款明細**（read-only summary，根據 target 是 charity / donation 取對應名稱）
2. **捐款人基本資料**表單（收據開立方式 dropdown + 姓名 input + disclaimer）
3. **送出按鈕**（sticky bottom，validated 才 enabled）

送出 = **`POST /api/checkout/donation` → BFF Zod 驗 + 轉發到 BE 022 §4.1 (CHARITY) 或 §4.2 (DONATION_PROJECT) 對應 endpoint → BE 建單 PENDING → 回 `{ orderId, status }`**（v0.5；本期不打 mock-confirm-payment，依 brief.md「不接金流」）。失敗一律 `toast.error('送出失敗，請稍後再試')`；2xx → `toast.success('已送出（demo 不接金流）')`。

---

## 2. URL Query → Page Props

`/checkout/donation?targetType=CHARITY&targetId=<uuid>&donationFrequency=RECURRING&billingDay=DAY_16&amountTwd=500`

```ts
// page.tsx
import { z } from 'zod'
import { notFound } from 'next/navigation'

// Zod enum 值對齊 BE 021 §5 Prisma enum
const Query = z.object({
  targetType: z.enum(['CHARITY', 'DONATION_PROJECT']),
  targetId: z.string().uuid(),
  donationFrequency: z.enum(['ONE_TIME', 'RECURRING']),
  billingDay: z.enum(['DAY_6', 'DAY_16', 'DAY_26']).optional(),
  amountTwd: z.coerce.number().int().min(1).max(1_000_000),
}).refine(
  (q) => q.donationFrequency === 'ONE_TIME' || q.billingDay !== undefined,
  { message: 'billingDay required when donationFrequency=RECURRING' },
).refine(
  (q) => q.donationFrequency !== 'ONE_TIME' || q.billingDay === undefined,
  { message: 'billingDay must be omitted when donationFrequency=ONE_TIME' },
)

export type DonationCheckoutQuery = z.infer<typeof Query>

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const sp = await searchParams
  const parsed = Query.safeParse(sp)
  if (!parsed.success) notFound()
  const q = parsed.data

  // 撈 target 顯示名稱（CHARITY → charity detail；DONATION_PROJECT → project detail）
  const target = q.targetType === 'CHARITY'
    ? await fetchCharityDetail(q.targetId)
    : await fetchDonationDetail(q.targetId)
  if (!target) notFound()

  return <DonationConfirmPage query={q} target={target} />
}
```

Zod 不通過或 fetch 404 → Next 404 page。Zod schema 與 [BE 022 §4.1/§4.2 TypeBox](../../../backend/docs/specs/022-donation-order-api.md) 完全一致；BFF route handler 接收 form payload 後可直接 forward 給 BE。

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
│   捐款專案     直接捐款給團體 |        │  ← targetType=CHARITY 顯示固定字串
│              專案名稱                  │  ← targetType=DONATION_PROJECT 顯示 project.name
│   捐款對象     {charity.name}         │
│   捐款類型     定期捐款 | 單次捐款     │  ← RECURRING / ONE_TIME
│   扣款週期     每月 N 日              │  ← 只在 RECURRING 顯示
│   下次扣款日期 YYYY/MM/DD             │  ← 只在 RECURRING 顯示
│   捐款金額     TWD N                  │  ← brand 紅字加重
└──────────────────────────────────────┘
```

### 4.1 「捐款專案」一行的內容

| `targetType` | 「捐款專案」顯示 |
|---|---|
| `'CHARITY'` | `"直接捐款給團體"`（hardcoded 字串）|
| `'DONATION_PROJECT'` | `target.name`（捐款專案名稱，如 "偏鄉AI 數位學習計畫－給孩子一雙探索未來的雙手"） |

「捐款對象」一行：

| `targetType` | 顯示 | 來源 |
|---|---|---|
| `'CHARITY'` | `target.name`（charity 名）| [BE 017 §3.1 charity detail](../../../backend/docs/specs/017-detail-apis.md) |
| `'DONATION_PROJECT'` | `target.charity.name`（該專案的主辦團體名稱）| [BE 017 §4.1 project detail 的 nested `charity`](../../../backend/docs/specs/017-detail-apis.md) |

### 4.2 「下次扣款日期」計算（v0.4 — 對齊 BE 021 §7.7）

```ts
// 規則完全對齊 backend 021 §7.7 computeNextChargeAt：
// - UTC 時間
// - 嚴格 less-than（todayUtcDate < day 才在當月；否則推下個月）
// - billingDay enum 對應的 int { DAY_6: 6, DAY_16: 16, DAY_26: 26 }
type BillingDay = 'DAY_6' | 'DAY_16' | 'DAY_26'

function computeNextChargeAt(billingDay: BillingDay, now: Date = new Date()): Date {
  const day = ({ DAY_6: 6, DAY_16: 16, DAY_26: 26 } as const)[billingDay]
  const todayUtcDate = now.getUTCDate()
  return new Date(Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth() + (todayUtcDate < day ? 0 : 1),
    day, 0, 0, 0, 0,
  ))
}

// 顯示格式 yyyy/MM/dd，跟 IMG_4888 對齊；用 UTC 取避免 timezone shift
function fmtDate(d: Date): string {
  return `${d.getUTCFullYear()}/${String(d.getUTCMonth()+1).padStart(2,'0')}/${String(d.getUTCDate()).padStart(2,'0')}`
}
```

> **v0.4 改動**：v0.1~0.3 用 client local time + `>=`（含當天）會跟 [BE 021 §7.7](../../../backend/docs/specs/021-donation-order-data-model.md) UTC + `<`（嚴格小於、當天視已過）錯位每月 3 天（6/16/26）。v0.4 改用同 BE 規則的純函式，避免 demo 階段 confirm 頁顯示與 BE 寫入錯位。**接 BE 真打 endpoint 後**改用 response `nextChargeAt` 為準，移除 client 計算。

### 4.3 完整渲染 reference

```tsx
import { ConfirmPanel } from '@/components/ui/ConfirmPanel'
import { KeyValueList, KeyValueRow } from '@/components/ui/KeyValueList'

const BILLING_DAY_LABEL: Record<BillingDay, number> = { DAY_6: 6, DAY_16: 16, DAY_26: 26 }

function DonationDetailPanel({ query, target }: {
  query: DonationCheckoutQuery
  target: CharityDetail | DonationDetail
}) {
  const projectName = query.targetType === 'CHARITY'
    ? '直接捐款給團體'
    : (target as DonationDetail).name
  const charityName = query.targetType === 'CHARITY'
    ? (target as CharityDetail).name
    : (target as DonationDetail).charity.name
  const typeLabel = query.donationFrequency === 'RECURRING' ? '定期捐款' : '單次捐款'
  const nextChargeAt = query.donationFrequency === 'RECURRING'
    ? computeNextChargeAt(query.billingDay!)
    : null

  return (
    <ConfirmPanel title="捐款明細" variant="first">
      <KeyValueList>
        <KeyValueRow label="捐款專案">{projectName}</KeyValueRow>
        <KeyValueRow label="捐款對象">{charityName}</KeyValueRow>
        <KeyValueRow label="捐款類型">{typeLabel}</KeyValueRow>
        {query.donationFrequency === 'RECURRING' && (
          <>
            <KeyValueRow label="扣款週期">每月 {BILLING_DAY_LABEL[query.billingDay!]} 日</KeyValueRow>
            <KeyValueRow label="下次扣款日期">
              <time dateTime={nextChargeAt!.toISOString().slice(0, 10)}>
                {fmtDate(nextChargeAt!)}
              </time>
            </KeyValueRow>
          </>
        )}
        <KeyValueRow label="捐款金額" variant="emphasized">
          TWD {priceFmt.format(query.amountTwd)}
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
│  │ 請選擇收據開立方式      ▼     │    │  ← <select> placeholder（v0.9 預設未選；選後才顯示姓名 input）
│  └─────────────────────────────┘    │
│                                       │
│  捐款人姓名 *                         │
│  ┌─────────────────────────────┐    │
│  │ 請填寫姓名                    │    │  ← <input> text
│  └─────────────────────────────┘    │
│                                       │
│  ☐ 我要匿名捐款                       │  ← v0.8 checkbox
│                                       │
│  ❗ 小提醒：送出前請再次確認您填寫的    │  ← v0.12 ReminderNote (IMG_4891)
│     姓名是否正確。若資料有誤將無法申報。│
└──────────────────────────────────────┘
```

### 5.1 Disclaimer

實作於 [`<DisclaimerBox>`](./009c-shared-confirm-ui.md#24-disclaimerbox--灰底注意事項框)；預設文案 `DISCLAIMER_PLATFORM` 同檔 export：

```tsx
import { DisclaimerBox, DISCLAIMER_PLATFORM } from '@/components/ui/DisclaimerBox'

<DisclaimerBox className="mb-4">{DISCLAIMER_PLATFORM}</DisclaimerBox>
```

文案內容：「街口金融科技作為捐款平台之服務提供者，將會蒐集、處理或利用捐款人填寫之個人資料，並僅提供予機關團體作為收據開立及稅務目的之使用。」

### 5.2 收據開立方式 dropdown（v0.4 — 5 個 BE enum 值）

`<select>`，options 對齊 [BE 022 §4.1 ReceiptOption](../../../backend/docs/specs/022-donation-order-api.md) 完整 5 值：

```ts
// 值 = BE Prisma enum；label = UI 顯示文字
type ReceiptOption =
  | 'NONE'                  // 都不需要（Figma 4888 default）
  | 'INDIVIDUAL'            // 個人
  | 'CORPORATE'             // 公司
  | 'GOVERNMENT_DONATION'   // 政府捐款抵稅
  | 'DEFER'                 // 稍後決定

const RECEIPT_OPTIONS: { value: ReceiptOption; label: string }[] = [
  { value: 'NONE', label: '都不需要' },
  { value: 'INDIVIDUAL', label: '個人' },
  { value: 'CORPORATE', label: '公司' },
  { value: 'GOVERNMENT_DONATION', label: '政府捐款抵稅' },
  { value: 'DEFER', label: '稍後決定' },
]

// v0.9 — 不再 hardcode default：FormState.receiptOption 預設 null（未選），
// <select> 顯示 placeholder「請選擇收據開立方式」。捐款人姓名 input + 匿名
// checkbox 在 `receiptOption !== null` 時才條件渲染（避免使用者直接填姓名
// 卻沒選收據方式造成 mismatch UX；同時 isValid 也 gate 此條件）。
```

> Figma 4888 只展示 default `都不需要`、沒拉開 dropdown。v0.4 預設提供完整 5 個 option 字串、label 採直翻；未來 design / PM 補完 Figma 後對齊。「個人 / 公司」選後是否要展開統編 / 抬頭 / 地址，仍列為 [009 §6 開放問題](./009-checkout-confirm.md#6-開放問題跨-spec)。

### 5.3 捐款人姓名 input

`<input type="text" maxLength={120}>`，required（client 端非空驗證；長度上限對齊 [BE 022 §4.1 donorName 1-120 字](../../../backend/docs/specs/022-donation-order-api.md)）。

### 5.3a 卡內小提醒（v0.12 — 參考 IMG_4891）

實作於 [`<ReminderNote>`](./009c-shared-confirm-ui.md#27-remindernote--卡內-inline-提醒v02-新增)；預設文案 `REMINDER_DONOR_NAME` 同檔 export：

```tsx
import { ReminderNote, REMINDER_DONOR_NAME } from '@/components/ui/ReminderNote'

<ReminderNote className="mt-4">{REMINDER_DONOR_NAME}</ReminderNote>
```

文案內容：「送出前請再次確認您填寫的姓名是否正確。若資料有誤將無法申報。」

**位置**：Panel 2 的最後一個元素（匿名 checkbox 下方、conditional render 之外）。即使收據方式未選、姓名 input 尚未出現也常駐顯示，避免使用者誤以為填完才會看到此提醒。

**文案差異說明**：IMG_4891 原文為「姓名與**身分證字號**是否正確」，但本頁實際只蒐集 `donorName`（身分證字號預設來自 JKOS 帳戶 KYC，本頁不編輯）。文案收斂為僅「姓名」，避免使用者找不到「身分證字號」欄位的混淆 UX。設計補上身分證字號 input 時可同步把「與身分證字號」加回 `REMINDER_DONOR_NAME` const。

### 5.4 Form state（reducer，對齊 [008b §3.2](./008b-donation-settings-sheet.md)；v0.4 — 命名對齊 BE）

```ts
interface FormState {
  receiptOption: ReceiptOption | null  // v0.9 — null = 未選；姓名 input 條件渲染
  donorName: string                // 受控原始字串；validation 在 submit 算
}

const DEFAULT_FORM: FormState = {
  receiptOption: null,                  // v0.9 — 未選
  donorName: '',
}

type Action =
  | { type: 'SET_RECEIPT_OPTION'; value: ReceiptOption }
  | { type: 'SET_DONOR_NAME'; value: string }

function reducer(s: FormState, a: Action): FormState {
  switch (a.type) {
    case 'SET_RECEIPT_OPTION': return { ...s, receiptOption: a.value }
    case 'SET_DONOR_NAME':     return { ...s, donorName: a.value }
  }
}
```

> 跟 [008b](./008b-donation-settings-sheet.md) 一樣，input value 直接綁 state、不需 raw/parsed 拆兩欄（姓名是純字串、無 parse 步驟、不會 ghost-reset）。

### 5.5 Validation

```ts
// v0.9 — 收據未選也算 invalid（雖然 UI 已隱藏姓名 input；雙重保險）
const isValid =
  form.receiptOption !== null &&
  form.donorName.trim().length > 0 &&
  form.donorName.length <= 120
```

`receiptOption` 永遠有 default、不會 invalid。對齊 BE 022 §4.1 `donorName: { minLength: 1, maxLength: 120 }`。

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
  const trimmedName = form.donorName.trim()
  // v0.9 — 收據選了才算 valid
  const isValid =
    form.receiptOption !== null &&
    trimmedName.length > 0 &&
    form.donorName.length <= 120

  const handleSubmit = async () => {     // v0.5 — async：要 await fetch
    if (!isValid) return
    const payload = buildPayload(opts.query, opts.target, form)
    // payload shape 完全對齊 BE 022 §4.1 / §4.2；BFF 看 `_endpoint` discriminator
    // 決定送 /charity-donation 或 /project-donation
    try {
      const res = await fetch('/api/checkout/donation', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload),
      })
      if (!res.ok) {
        toast.error('送出失敗，請稍後再試')
        return
      }
      toast.success('已送出（demo 不接金流）')
    } catch {
      // network failure / abort — 同等 UX
      toast.error('送出失敗，請稍後再試')
    }
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
import { ReminderNote, REMINDER_DONOR_NAME } from '@/components/ui/ReminderNote'
import { RequiredLabel } from '@/components/ui/RequiredLabel'

type DonorInfoFormPanelProps = {
  form: FormState
  dispatch: React.Dispatch<Action>
}

export function DonorInfoFormPanel({ form, dispatch }: DonorInfoFormPanelProps) {
  return (
    <ConfirmPanel title="捐款人基本資料">
      <DisclaimerBox className="mb-4">{DISCLAIMER_PLATFORM}</DisclaimerBox>

      <RequiredLabel htmlFor="receiptOption" className="mb-2">收據開立方式</RequiredLabel>
      <select
        id="receiptOption"
        value={form.receiptOption}
        onChange={(e) => dispatch({ type: 'SET_RECEIPT_OPTION', value: e.target.value as ReceiptOption })}
        className="w-full h-12 rounded-lg border border-line bg-surface-card px-3 text-sm text-ink-AAA mb-4"
      >
        {RECEIPT_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>

      {/* v0.9 — 收據未選不顯示姓名 input；v0.12 — 不論是否選收據都掛小提醒在 panel 底部 */}
      {form.receiptOption !== null && (
        <>
          <RequiredLabel htmlFor="donorName" className="mb-2">捐款人姓名</RequiredLabel>
          <input
            id="donorName"
            type="text"
            maxLength={120}                        // 對齊 BE 022 §4.1 donorName 上限
            placeholder="請填寫姓名"
            value={form.donorName}
            onChange={(e) => dispatch({ type: 'SET_DONOR_NAME', value: e.target.value })}
            className="w-full h-12 rounded-lg border border-line bg-surface-card px-3 text-sm text-ink-AAA placeholder:text-ink-A focus:border-2 focus:border-ink-AAA focus:outline-none"
          />
          {/* 匿名 checkbox 詳見 §5.8 v0.8 */}
        </>
      )}

      <ReminderNote className="mt-4">{REMINDER_DONOR_NAME}</ReminderNote>
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

### 6.1 Submit payload shape（v0.4 — 完全對齊 BE 022 §4.1/§4.2 body）

```ts
// payload shape = BE 022 §4.1 CharityDonationBody（targetType=CHARITY）
//                 或 §4.2 ProjectDonationBody（targetType=DONATION_PROJECT）。
// 兩條 endpoint body 結構幾乎一致、只差 charityId vs donationProjectId。
type DonationConfirmPayload =
  | {
      _endpoint: '/user/v1/donation/orders/charity-donation'
      donorName: string                                    // 1-120
      isAnonymous: false                                    // v0.4 — UI 無 checkbox，固定 false
      receiptOption: ReceiptOption                          // 5 個 BE enum 值之一
      charityId: string                                     // uuid
      donationFrequency: 'ONE_TIME' | 'RECURRING'
      billingDay?: 'DAY_6' | 'DAY_16' | 'DAY_26'           // RECURRING 必設；ONE_TIME omit
      amountTwd: number                                     // 1 ~ 1_000_000
    }
  | {
      _endpoint: '/user/v1/donation/orders/project-donation'
      donorName: string
      isAnonymous: false
      receiptOption: ReceiptOption
      donationProjectId: string                             // uuid
      donationFrequency: 'ONE_TIME' | 'RECURRING'
      billingDay?: 'DAY_6' | 'DAY_16' | 'DAY_26'
      amountTwd: number
    }
```

> `_endpoint` 是 FE-side discriminator（不送 BE，BFF 看了之後決定 forward 給哪條 BE endpoint）。BE 022 body 本身不含此欄位（[v0.7 strict `additionalProperties: false`](../../../backend/docs/specs/022-donation-order-api.md) 會拒絕未宣告欄位），BFF route handler 在 forward 前需要 `_endpoint` 移除。

```ts
function buildPayload(
  query: DonationCheckoutQuery,
  target: CharityDetail | DonationDetail,
  form: FormState,
): DonationConfirmPayload {
  const base = {
    donorName: form.donorName.trim(),
    isAnonymous: false as const,
    receiptOption: form.receiptOption,
    donationFrequency: query.donationFrequency,
    ...(query.billingDay !== undefined && { billingDay: query.billingDay }),
    amountTwd: query.amountTwd,
  }
  return query.targetType === 'CHARITY'
    ? { _endpoint: '/user/v1/donation/orders/charity-donation', ...base, charityId: query.targetId }
    : { _endpoint: '/user/v1/donation/orders/project-donation', ...base, donationProjectId: query.targetId }
}
```

> `nextChargeAt` **不**在 FE payload 內：BE 021 §7.7 規約「create 時 server 算」；FE confirm 頁顯示用的 client `computeNextChargeAt`（§4.2）是 demo display-only，不送 BE。

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
| R1 | SET_RECEIPT_OPTION 'INDIVIDUAL' → state.receiptOption='INDIVIDUAL' | OK |
| R2 | SET_DONOR_NAME "Alice" → state.donorName="Alice" | OK |
| R3 | SET_DONOR_NAME "" → state.donorName="" | OK |

### 8.2 Hook integration tests（`useDonorInfoForm.test.ts`，v0.2）

mock `sonner.toast`，用 `renderHook()`：

| # | 案例 | 期望 |
|---|---|---|
| H1 | 初始 isValid=false（donorName=''、receiptOption='NONE'） | OK |
| H2 | dispatch SET_DONOR_NAME "Alice" → isValid=true | OK |
| H3 | dispatch SET_DONOR_NAME "   " → isValid=false（trim 後空） | OK |
| H4 | dispatch SET_DONOR_NAME 121 字 → isValid=false（超過 BE 1-120） | OK |
| H5 | handleSubmit (isValid，targetType='CHARITY') → toast.success called + payload 含 `_endpoint='/user/v1/donation/orders/charity-donation'` + `charityId` + `donorName=trim` + `receiptOption` + `donationFrequency` + `billingDay`(RECURRING) + `amountTwd` + `isAnonymous=false` | OK |
| H6 | handleSubmit (isValid，targetType='DONATION_PROJECT') → payload 改 `_endpoint='/user/v1/donation/orders/project-donation'` + `donationProjectId` | OK |
| H7 | handleSubmit (!isValid) → toast.success **not** called（雙重保險） | OK |
| H8 | handleSubmit (donationFrequency='ONE_TIME') → payload **不**含 `billingDay` 欄位（對齊 BE 022 ONE_TIME 禁設規約） | OK |

### 8.3 Component visual tests（`DonorInfoForm.test.tsx`，v0.2 — 變薄）

| # | 案例 | 期望 |
|---|---|---|
| 1 | 渲染 「捐款明細」+「捐款人基本資料」panel + sticky CTA | OK |
| 2 | submit button 視 isValid disabled/enabled 切換 | UI |
| 3 | 在姓名 input 打字 → input value 跟著變、submit button 由 disabled 變 enabled | UI 整合 |
| 4 | 在姓名 input 按 Enter → form onSubmit handler 觸發 | form semantic |

### 8.3 Page-level（integration / e2e 可選）

- `/checkout/donation?targetType=CHARITY&targetId=<valid>&donationFrequency=RECURRING&billingDay=DAY_16&amountTwd=500` → 200 + 各欄位顯示對
- 同上但 amountTwd=0 → 404
- 同上但 amountTwd=1_000_001（超過 BE 上限）→ 404
- 同上但 billingDay 缺（RECURRING 必須有）→ 404
- 同上但 donationFrequency=ONE_TIME 卻帶 billingDay → 404
- 同上但 targetId 不存在 → 404

E2E 後續可加，本 v0.1 不強制。

---

## 9. 開放問題

- **收據選項展開欄位**：個人選後是否要填統編 / 抬頭 / 地址？公司同理？等設計確認；BE 022 §11 OQ 也未決
- **截圖未顯示完整 form 欄位**：4888 拉到底可能還有電話 / email / 地址；BE 022 body 目前不含這些欄位，FE 不擴
- ~~**`isAnonymous` UI 缺口**：BE 三類訂單共用 `isAnonymous`，但 Figma 4888 / 4889 沒匿名 checkbox（只 IMG_4890 sale-item 有）；FE 固定送 `false`、不影響 BE optional default。未來 design 補匿名 UI 時拉到捐款流程，移除 hardcoded `false`~~ → ✅ v0.8 解決：「我要匿名捐款」checkbox 加進 Panel 2 「捐款人基本資料」（姓名 input 下方）；對齊 IMG_4890 同樣文案、視覺；FormState 加 `isAnonymous` + `SET_ANONYMOUS` Action + reducer case；buildPayload 改吃 `form.isAnonymous`；payload 型別從 `false` literal 改 `boolean`。此舉跨 charity / project / sale-item 三類確認頁統一
- **`note` 欄位**：[BE 022 §4.1 / §4.2 TypeBox `note: Type.Optional(Type.Union([Type.Null(), Type.String({ maxLength: 500 })]))`](../../../backend/docs/specs/022-donation-order-api.md)；Figma 4888 / 4889 無 textarea，FE form / BFF schema 都不開、不送。BE 接受 omit。**v0.11 audit 確認**：BFF `route.ts` Zod 也沒帶 `note`；若未來設計補 UI，只需在 FormState 加 `note: string` + buildPayload 帶值 + BFF `BASE` schema 加 `note: z.string().max(500).optional()` 即可。
- **client-side 算下次扣款日期**：v0.4 已對齊 BE UTC + 嚴格 `<` 規則；prod 改用 BE response `nextChargeAt` 為準
- **i18n disclaimer**：街口金融科技字串 hardcode 中文；i18n 上線後抽 string table

---

## 10. 變更紀錄

| 版本 | 日期 | 變更 |
|---|---|---|
| 0.1 | 2026-06-15 | 初版：對應 IMG_4888 / 4889；定義 Zod query schema、target fetch 流程、capture 兩種 targetType 的「捐款專案 / 對象」對應邏輯、下次扣款日期 client computation、reducer + 6 個 component test |
| 0.2 | 2026-06-15 | **抽 `useDonorInfoForm` custom hook**：對齊 [008b v0.4](./008b-donation-settings-sheet.md) container / presentational 分層；hook 包 useReducer + isValid + handleSubmit + sonner toast。三層 test plan：reducer R1~R3 / hook H1~H5 / component 4 個視覺 |
| 0.3 | 2026-06-15 | **改用 [009c shared confirm UI](./009c-shared-confirm-ui.md) primitives**：整頁外殼換 `<ConfirmPageShell>`、明細 panel 換 `<ConfirmPanel>` + `<KeyValueList>`、disclaimer 換 `<DisclaimerBox>` + `DISCLAIMER_PLATFORM` const、必填 label 換 `<RequiredLabel>`、sticky CTA 由 shell 內部接管。移除 §4.3 / §5.1 / §6 inline className；新增 §5.7 `<DonorInfoFormPanel>` reference 完整 JSX |
| 0.4 | 2026-06-15 | **query / form / payload 全面對齊 [backend 022](../../../backend/docs/specs/022-donation-order-api.md)**（Option C）：(a) §2 Zod query 用 BE enum 值（`CHARITY`/`DONATION_PROJECT`、`ONE_TIME`/`RECURRING`、`DAY_6/16/26`、`amountTwd` 1-1_000_000）+ ONE_TIME/RECURRING ↔ billingDay 雙 refine；(b) §4.2 `computeNextChargeDate` → `computeNextChargeAt`，規約對齊 BE 021 §7.7（UTC + 嚴格 `<`），解 client/server 錯位每月 3 天的 bug；(c) §4.3 渲染 reference 全用 BE 命名；(d) §5.2 `RECEIPT_TYPES` 中文 3 值 → `RECEIPT_OPTIONS` 對齊 BE `ReceiptOption` 完整 5 值（NONE/INDIVIDUAL/CORPORATE/GOVERNMENT_DONATION/DEFER）+ value/label 分離；(e) §5.3 donorName `maxLength={120}` 對齊 BE；(f) §5.4 FormState `receiptType` → `receiptOption`、Action 同步 rename；(g) §5.5 isValid 加 120 字上限；(h) §6.1 payload shape 完全對齊 BE 022 §4.1/§4.2 body（discriminated union `_endpoint` + `charityId` vs `donationProjectId` + `isAnonymous=false` hardcode）；(i) §8 test cases 升級 R1/H1~H8/component 4/page 6 個；(j) §9 OQ 補 `isAnonymous` UI 缺口 + `note` 欄位差 + receiptOption 5 值 sync |
| 0.5 | 2026-06-15 | **handleSubmit 改 fetch BFF**：替換 v0.4 的 `console.log + toast.success` 為 `await fetch('/api/checkout/donation', { method: 'POST', body: payload })`；2xx → toast.success；非 2xx 或 throw → `toast.error('送出失敗，請稍後再試')`。`useDonorInfoForm` 變 async。Test 升級：H5 改驗 fetch 被呼叫 + body 形狀；新增 H9 (BFF 5xx)、H10 (network throw) 兩個錯誤路徑；component test 5 同樣驗 fetch call。對應 [spec 009 §5 BFF route](./009-checkout-confirm.md#5-bff-route-handlerv04-新)（`/api/checkout/donation`）與 [spec 022 §4.1/4.2](../../../backend/docs/specs/022-donation-order-api.md)。本期不打 mock-confirm-payment（留給未來付款頁），brief.md「不接金流」靠「BE 建單只到 PENDING」達成 |
| 0.6 | 2026-06-15 | **送出成功 → 導回 entry detail page**：useDonorInfoForm 加 `useRouter()`；handleSubmit 成功路徑加 `router.replace(entryUrl(query))`，依 targetType 計算：CHARITY → `/charities/${targetId}`、DONATION_PROJECT → `/donation-projects/${targetId}`。**用 replace 而非 push**：confirm 頁完成任務後不該留 history（避免「按返回又看到已送出頁 / 又能再點送出」）。失敗時不導頁，留在 confirm 頁顯示 toast.error 讓使用者重試。Test 升級：H5 / H6 加 `routerReplaceMock` 斷言；H9 / H10 加「失敗不導頁」反向斷言 |
| 0.7 | 2026-06-15 | **URL query → in-memory draft store**（隱私 / 統一處理 refresh）：見 [009 §2 / §2.1](./009-checkout-confirm.md#2-routingv05--bare-path--in-memory-draft-store) 完整改寫說明。本 spec 對應更新：(a) §2 RSC 不再 Zod 解析 query — page.tsx 變 RSC shell + `DonationConfirmPageEntry`（client）peek `donation/draft-store.ts`；(b) `DonationCheckoutQuery` 型別與相關 const 移除；(c) `buildPayload` / `useDonorInfoForm` opts 從 `{query, target}` 收成 `{draft: DonationDraft}`，draft 自帶 `target.detail.id` 取代 `targetId`；(d) `DonationConfirmPage` props 從 `{query, target}` 收成 `{draft}`，內部讀 draft.donationFrequency / billingDay / amountTwd / target.detail.name 等。(e) CtaIsland donation 變數 `target: { type, detail: CharityDetail \| DonationDetail }`，sheet 寫 draft 時把整 detail 帶進去。(f) submit 成功 `clearDonationDraft()` 再 `router.replace(entryUrl)`。所有 hook / component / page tests 同步重寫（renderHook 餵 `{ draft: ... }` 不再 `{ query, target }`）|
| 0.8 | 2026-06-15 | **補「我要匿名捐款」checkbox 到 donation flow**：原本只 009b sale-item 有，依使用者要求 charity / project 捐款頁也補上（對齊 BE 022 isAnonymous 跨三類訂單）。FormState 加 `isAnonymous: boolean`、Action 加 `SET_ANONYMOUS`、reducer 加對等映射；DEFAULT_FORM.isAnonymous=false；buildPayload 從 `form.isAnonymous` 讀；payload 型別 `isAnonymous: false` literal 改 `boolean`。`<DonorInfoFormPanel>` 在姓名 input 下方加 checkbox（樣式同 [009b §6.4](./009b-purchase-confirm.md)）。Test 新增：R4/R5 reducer pure、H11 hook（勾匿名 + submit → payload.isAnonymous=true）、component 5b/5c。§9 OQ 「isAnonymous UI 缺口」標為 ✅ 已解 |
| 0.9 | 2026-06-15 | **收據開立方式預設未選 → 姓名 input 條件渲染**：FormState `receiptOption` 從 `ReceiptOption` 改為 `ReceiptOption \| null`，DEFAULT_FORM 改 `null`；`DEFAULT_RECEIPT_OPTION` const 移除。Action `SET_RECEIPT_OPTION` value 也允許 null（使用者反悔選 placeholder）。`<select>` 新增 placeholder option（value=""、disabled、「請選擇收據開立方式」）；當 state 是 null 時 select 顯示 placeholder。**捐款人姓名 input + 匿名 checkbox 整段在 `receiptOption !== null` 時才條件渲染**（避免姓名先填、收據未選的 mismatch UX）。`isValid` + `buildPayload` 都加上「receiptOption !== null」gate；buildPayload 在斷言點做 type narrow。Test 升級：R6/R7 reducer pure、H1/H2 預期改、H2b/H3/H4/H5/H6/H8/H9/H10/H11 都先 dispatch SET_RECEIPT_OPTION；component test 4/4b/5/5b/5c/6 改成「先 selectOption 再 type」的流程；test 6 斷言 `<select>` 共 6 個 options（5 BE enum + 1 placeholder） |
| 0.10 | 2026-06-16 | **`_endpoint` cutover 到 `/user/v1/donation/orders/*`**（對齊 [backend spec 023 §2.4](../../../backend/docs/specs/023-api-routing-versioning.md)）：§6.1 payload `DonationConfirmPayload` 兩個 discriminator 字面值（`charity-donation` / `project-donation`）、`buildPayload` 範例、§8.2 Hook integration test H5 / H6 斷言全部從 `/v1/donation/orders/*` 改 `/user/v1/donation/orders/*`。BE 022 body shape 本身無變動；FE 端只是 discriminator 字面值跟著 BE wire path 走。 |
| 0.11 | 2026-06-16 | **BE 022 contract audit fixes**（隨 [spec 009 v0.8](./009-checkout-confirm.md)）：本 spec 對應更新 §9 OQ「`note` 欄位」改寫為較完整的「BE 接受但 UI 未開」說明 + 補上 BFF schema 也未帶 note 的事實 + 未來補 UI 的 3-點 checklist。本 spec 描述的 form state / payload / response 行為皆無變動（變動都在 BFF route + mock + 加入 6 個 BFF test），故 §5 / §6 / §8 文案不需改。 |
| 0.12 | 2026-06-16 | **新增 §5.3a 卡內小提醒**（參考 IMG_4891）：Panel 2 底部常駐 `<ReminderNote>{REMINDER_DONOR_NAME}</ReminderNote>`，文案「送出前請再次確認您填寫的姓名是否正確。若資料有誤將無法申報。」放在 conditional render 之外（即收據未選也顯示）。圖中原文「姓名與身分證字號」收斂為僅「姓名」對齊本頁實際可編輯欄位；身分證字號目前由 JKOS 帳戶 KYC 提供、本頁不蒐集。§5.7 panel reference JSX 同步加 import + 元素；ASCII layout 加 checkbox + reminder 兩行。Primitive 新增於 [009c v0.2 §2.7](./009c-shared-confirm-ui.md#27-remindernote--卡內-inline-提醒v02-新增)。Form state / payload / submit 行為無變動 |
