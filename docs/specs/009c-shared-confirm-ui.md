# Spec 009c：confirm 頁共用 UI primitives

- **狀態**：Draft（v0.2 — 加 `<ReminderNote>` 第 7 個 primitive；參考 IMG_4891）
- **建立日期**：2026-06-15
- **路徑（規劃）**：
  - `src/components/ui/ConfirmPageShell.tsx` + `.test.tsx`
  - `src/components/ui/ConfirmPanel.tsx` + `.test.tsx`
  - `src/components/ui/KeyValueList.tsx` + `.test.tsx`
  - `src/components/ui/DisclaimerBox.tsx` + `.test.tsx`（內 export `DISCLAIMER_PLATFORM` 字串）
  - `src/components/ui/RequiredLabel.tsx` + `.test.tsx`
  - `src/components/ui/StickyConfirmCta.tsx` + `.test.tsx`
  - `src/components/ui/ReminderNote.tsx` + `.test.tsx`（內 export `REMINDER_DONOR_NAME` 字串）
- **依賴**：
  - 既有 design system tokens（[003a](./003a-design-system.md)）
  - 既有 [`<TopNav>`](./003b-topnav.md) + [`useSmartBack`](./005-homepage-auth.md#4-smart-back-navigation-v02-新增)
- **使用方**：
  - [009a DonationConfirm](./009a-donation-confirm.md)
  - [009b PurchaseConfirm](./009b-purchase-confirm.md)
  - 未來其他 confirm-style 頁面（付款 / 結果 / 訂單成立）

---

## 1. 為何拆 spec

009a / 009b 排版高度相同（紅底 hero + 多張白 panel + 置中 h2 + dl key-value row + disclaimer 灰盒 + sticky 紅 pill），v0.1 spec 各自 inline className → 同樣 Tailwind 字串散在兩份 spec、開發後再散在 6+ 個檔。

抽 7 個 small primitives 把「共用視覺 + a11y pattern」固化在元件本身，business form 內容 caller 自接。

對齊既有 `src/components/ui/` 慣例（`<CharityCard>` / `<SearchBar>` / `<TabsRow>` / `<BottomSheet>` 都是 small primitive）。

---

## 2. Primitives

### 2.1 `<ConfirmPageShell>` — 整頁外殼

職責：TopNav + 紅 hero 底色 + `<main>` wrapper + `<form onSubmit>` + 底部 `<StickyConfirmCta>`。Children 為 panels。

```ts
type ConfirmPageShellProps = {
  /** TopNav 標題（confirm family 預設「確認捐款資訊」，但仍 prop 化以利擴充） */
  title: string
  /** Sticky CTA 文字（預設「確認送出」） */
  ctaLabel: string
  /** Sticky CTA disabled gate */
  isValid: boolean
  /** form submit handler；caller 在內呼叫 buildPayload + console.log + toast */
  onSubmit: () => void
  /** panels（≥1） */
  children: ReactNode
}
```

實作 reference：

```tsx
'use client'
import { TopNav } from '@/components/ui/TopNav'
import { StickyConfirmCta } from '@/components/ui/StickyConfirmCta'

export function ConfirmPageShell({
  title, ctaLabel, isValid, onSubmit, children,
}: ConfirmPageShellProps) {
  return (
    <>
      <TopNav title={title} fallback="/" />
      {/* 紅底 hero — 高度 32 / 紅色，Panel 1 用 -mt-6 蓋住底部讓圓角浮現 */}
      <div className="bg-brand h-32" aria-hidden />
      <form
        onSubmit={(e) => { e.preventDefault(); onSubmit() }}
        noValidate
        className="pb-24"      // 預留 sticky CTA 空間
      >
        <main>{children}</main>
        <StickyConfirmCta label={ctaLabel} isValid={isValid} />
      </form>
    </>
  )
}
```

- 紅 hero `h-32`（128px）對齊 detail 頁 hero 高度家族；具體高度可依 Figma 微調
- `pb-24` 預留底部空間，避免最後一個 panel 被 sticky CTA 蓋住
- `<form>` 包整頁 — 任何 panel 內的 input 按 Enter 都會 submit
- 不接 className prop——固定 layout，將來「需要額外行為」就再 prop 化

**為何放 `ui/` 而非 `features/checkout/`**：本元件零 business（不知道是捐款還是購買、不接 store / router）；caller 才知道。對齊既有 `<BottomSheet>`（同樣 portal + a11y 純 UI）放 ui 的慣例。

### 2.2 `<ConfirmPanel>` — 白色卡片

```ts
type ConfirmPanelProps = {
  /** 上方置中 h2；省略 → 不渲染標題列（純白卡） */
  title?: string
  /** 第一個 panel 給 'first' 套 -mt-6 z-10 蓋住紅 hero */
  variant?: 'first' | 'normal'    // 預設 'normal'
  children: ReactNode
}
```

實作 reference：

```tsx
export function ConfirmPanel({ title, variant = 'normal', children }: ConfirmPanelProps) {
  return (
    <section
      className={[
        'bg-surface-card rounded-2xl shadow-sm mx-3 mb-3 px-5 py-5',
        variant === 'first' ? '-mt-6 relative z-10' : '',
      ].join(' ')}
    >
      {title && (
        <h2 className="text-base font-semibold text-ink-AAA text-center mb-4">
          {title}
        </h2>
      )}
      {children}
    </section>
  )
}
```

### 2.3 `<KeyValueList>` — dl 排版

```ts
type KeyValueListProps = {
  /** dt 欄寬度 token（Tailwind grid-cols 用），預設 '6em' */
  labelWidth?: string
  children: ReactNode             // <KeyValueRow> 陣列
}

type KeyValueRowProps = {
  label: string                   // dt
  /** dd 內容；node 可放 `<time>` / 加粗 / 紅字等 */
  children: ReactNode
  /** dd 樣式變體：'emphasized' → brand 紅字加粗（金額用） */
  variant?: 'normal' | 'emphasized'
}
```

實作 reference：

```tsx
export function KeyValueList({ labelWidth = '6em', children }: KeyValueListProps) {
  return (
    <dl
      className="grid gap-y-3 text-sm"
      style={{ gridTemplateColumns: `${labelWidth} 1fr` }}
    >
      {children}
    </dl>
  )
}

export function KeyValueRow({ label, children, variant = 'normal' }: KeyValueRowProps) {
  return (
    <>
      <dt className="text-ink-AA">{label}</dt>
      <dd
        className={[
          'text-right',
          variant === 'emphasized'
            ? 'text-brand text-base font-bold'
            : 'text-ink-AAA line-clamp-2',
        ].join(' ')}
      >
        {children}
      </dd>
    </>
  )
}
```

> KeyValueRow 渲染兩個 element（dt + dd），靠 KeyValueList 的 grid 自動排版。caller 不需要包 wrapper。

### 2.4 `<DisclaimerBox>` — 灰底注意事項框

```ts
type DisclaimerBoxProps = {
  /** 文案；caller 自帶以利將來 i18n */
  children: ReactNode
  className?: string              // 給 caller 微調 margin
}

/** 街口捐款平台 disclaimer 預設文案 — 從 IMG_4888 / 4890 抄錄 */
export const DISCLAIMER_PLATFORM =
  '街口金融科技作為捐款平台之服務提供者，將會蒐集、處理或利用捐款人填寫之個人資料，並僅提供予機關團體作為收據開立及稅務目的之使用。'
```

實作 reference：

```tsx
export function DisclaimerBox({ children, className = '' }: DisclaimerBoxProps) {
  return (
    <p
      className={`bg-black/5 text-xs text-ink-AA p-3 rounded-md leading-5 ${className}`}
    >
      {children}
    </p>
  )
}
```

- 用 `<p>` 而非 `<div>` — SR 讀為段落而非 generic
- 文案 const 跟 component 同檔 export，caller `import { DisclaimerBox, DISCLAIMER_PLATFORM } from '@/components/ui/DisclaimerBox'`

### 2.5 `<RequiredLabel>` — 必填欄位 label

```ts
type RequiredLabelProps = {
  htmlFor?: string                // 連到對應 input id
  children: ReactNode             // label text
  className?: string
}
```

實作 reference：

```tsx
export function RequiredLabel({ htmlFor, children, className = '' }: RequiredLabelProps) {
  return (
    <label htmlFor={htmlFor} className={`block text-sm text-ink-AAA ${className}`}>
      {children}
      {' '}
      <span className="text-brand" aria-hidden>*</span>
      <span className="sr-only">必填</span>
    </label>
  )
}
```

雙重 a11y 標記（紅星 + sr-only）對齊現代 form pattern。

### 2.6 `<StickyConfirmCta>` — sticky 底部送出按鈕

```ts
type StickyConfirmCtaProps = {
  label: string                   // 預設 caller 傳「確認送出」
  isValid: boolean                // disabled gate
}
```

實作 reference：

```tsx
export function StickyConfirmCta({ label, isValid }: StickyConfirmCtaProps) {
  return (
    <div
      className="sticky bottom-0 inset-x-0 bg-surface-card border-t border-line
                 px-5 py-3 pb-[env(safe-area-inset-bottom)] z-30"
    >
      <button
        type="submit"
        disabled={!isValid}
        className="w-full h-12 rounded-full bg-brand text-white text-base font-semibold
                   disabled:bg-black/10 disabled:text-ink-A
                   focus-visible:outline focus-visible:outline-2
                   focus-visible:outline-offset-2 focus-visible:outline-brand"
      >
        {label}
      </button>
    </div>
  )
}
```

- `type="submit"` — 預設給 [`<ConfirmPageShell>`](#21-confirmpageshell--整頁外殼) 的 `<form>` 收到
- 無 `onClick` prop — 行為固定由 form onSubmit 接管；caller 不該繞過

### 2.7 `<ReminderNote>` — 卡內 inline 提醒（v0.2 新增）

灰底 `<DisclaimerBox>` 的鄰居：DisclaimerBox 是「平台 disclaimer」（個資政策、長段法律語），ReminderNote 是「行為提醒」（送出前確認姓名、檢查資料）。視覺上 Disclaimer 為灰盒分塊、Reminder 為卡內 inline 行（白底、icon + 文字、無框）；不混用避免兩種灰盒上下相連。

```ts
type ReminderNoteProps = {
  /** 提醒主文；caller 自帶以利將來 i18n */
  children: ReactNode
  className?: string              // 給 caller 微調 margin
}

/**
 * 送出前確認姓名提醒 — 從 IMG_4891 抄錄。
 * 圖中原文為「姓名與身分證字號」，本頁實際只蒐集姓名（身分證字號在 JKOS
 * 帳戶 KYC），文案對齊本頁可編輯欄位避免使用者找「身分證字號」找不到。
 */
export const REMINDER_DONOR_NAME =
  '送出前請再次確認您填寫的姓名是否正確。若資料有誤將無法申報。'
```

實作 reference：

```tsx
export function ReminderNote({ children, className = '' }: ReminderNoteProps) {
  return (
    <p
      className={`flex items-start gap-2 text-xs text-ink-AA leading-5 ${className}`}
    >
      <ExclamationIcon />
      <span>
        <span className="text-ink-AAA">小提醒：</span>
        {children}
      </span>
    </p>
  )
}

function ExclamationIcon() {
  // 實心黑圓 + 白色 ! — viewBox 16；w-4 h-4 mt-0.5 對齊行高
  return (
    <svg aria-hidden="true" viewBox="0 0 16 16" className="w-4 h-4 mt-0.5 shrink-0 fill-ink-AAA">
      <circle cx="8" cy="8" r="7.5" />
      <rect x="7.1" y="3.6" width="1.8" height="5.6" fill="white" rx="0.4" />
      <rect x="7.1" y="10.4" width="1.8" height="1.8" fill="white" rx="0.4" />
    </svg>
  )
}
```

- 用 `<p>` 而非 `<div>` — SR 讀為段落而非 generic
- 「小提醒：」label 寫死在 primitive 內（同 DisclaimerBox 文案 const 模式：文案結構固定、僅 body 變動）
- icon `aria-hidden` — 純裝飾；文字本身已含「小提醒：」語義
- caller 用 `className="mt-4"` 維持與上一個 form field 的垂直節律

---

## 3. 使用範例（compose 起來）

009a 簡化後（取代原 §4–§6 的 inline JSX）：

```tsx
'use client'
import { ConfirmPageShell } from '@/components/ui/ConfirmPageShell'
import { ConfirmPanel } from '@/components/ui/ConfirmPanel'
import { KeyValueList, KeyValueRow } from '@/components/ui/KeyValueList'
import { DisclaimerBox, DISCLAIMER_PLATFORM } from '@/components/ui/DisclaimerBox'
import { RequiredLabel } from '@/components/ui/RequiredLabel'
import { useDonorInfoForm } from './useDonorInfoForm'

export function DonationConfirmPage({ query, target }) {
  const { form, dispatch, isValid, handleSubmit } = useDonorInfoForm({ query, target })
  return (
    <ConfirmPageShell
      title="確認捐款資訊"
      ctaLabel="確認送出"
      isValid={isValid}
      onSubmit={handleSubmit}
    >
      <ConfirmPanel title="捐款明細" variant="first">
        <KeyValueList>
          <KeyValueRow label="捐款專案">{projectName}</KeyValueRow>
          <KeyValueRow label="捐款對象">{charityName}</KeyValueRow>
          <KeyValueRow label="捐款類型">{typeLabel}</KeyValueRow>
          {query.donationFrequency === 'RECURRING' && (
            <>
              <KeyValueRow label="扣款週期">每月 {BILLING_DAY_LABEL[query.billingDay!]} 日</KeyValueRow>
              <KeyValueRow label="下次扣款日期">
                <time dateTime={iso}>{fmtDate(date)}</time>
              </KeyValueRow>
            </>
          )}
          <KeyValueRow label="捐款金額" variant="emphasized">
            TWD {priceFmt.format(query.amountTwd)}
          </KeyValueRow>
        </KeyValueList>
      </ConfirmPanel>

      <ConfirmPanel title="捐款人基本資料">
        <DisclaimerBox className="mb-4">{DISCLAIMER_PLATFORM}</DisclaimerBox>
        <RequiredLabel htmlFor="receiptOption" className="mb-2">收據開立方式</RequiredLabel>
        <select id="receiptOption" .../>
        <RequiredLabel htmlFor="donorName" className="mt-4 mb-2">捐款人姓名</RequiredLabel>
        <input id="donorName" maxLength={120} .../>
      </ConfirmPanel>
    </ConfirmPageShell>
  )
}
```

對比 009a v0.1：page 從 ~80 行 inline JSX 縮為 ~30 行；視覺改動（panel 圓角、必填 marker 樣式、CTA 高度）只動 6 個小檔的其中一個。

---

## 4. 測試（colocated `.test.tsx`）

每個 primitive 小：3–5 個 test case。focus 在「prop → 渲染結果」與 a11y semantics。

### 4.1 `ConfirmPageShell.test.tsx`

| # | 案例 | 期望 |
|---|---|---|
| 1 | 渲染 TopNav title + 紅 hero + form + children + sticky CTA | OK |
| 2 | 點 sticky button → onSubmit 觸發（透過 form submit event） | OK |
| 3 | 在 children 內 input 按 Enter → onSubmit 觸發 | form semantic |
| 4 | isValid=false → button disabled | UI gate |

### 4.2 `ConfirmPanel.test.tsx`

| # | 案例 | 期望 |
|---|---|---|
| 1 | 有 title → 渲染 h2；無 title → 不渲染 | OK |
| 2 | variant='first' → className 包含 `-mt-6` | UI |
| 3 | variant='normal'（預設）→ 不包含 `-mt-6` | UI |

### 4.3 `KeyValueList.test.tsx`

| # | 案例 | 期望 |
|---|---|---|
| 1 | 多 row → dl 內含對等 dt/dd | OK |
| 2 | row variant='emphasized' → dd 包含 `text-brand` `font-bold` | UI |
| 3 | labelWidth prop → grid-template-columns inline style 對應 | OK |

### 4.4 `DisclaimerBox.test.tsx`

| # | 案例 | 期望 |
|---|---|---|
| 1 | 渲染 children 為 `<p>` semantic | OK |
| 2 | `DISCLAIMER_PLATFORM` 為非空字串 const | OK |

### 4.5 `RequiredLabel.test.tsx`

| # | 案例 | 期望 |
|---|---|---|
| 1 | 渲染 label text + 紅星（aria-hidden）+ sr-only「必填」 | OK |
| 2 | htmlFor prop → `<label for="...">` 屬性對應 | OK |

### 4.6 `StickyConfirmCta.test.tsx`

| # | 案例 | 期望 |
|---|---|---|
| 1 | isValid=true → button enabled、label 顯示 | OK |
| 2 | isValid=false → button disabled、className 含 `disabled:bg-black/10` | OK |
| 3 | button type='submit'（不是 type='button'） | form 整合 |

### 4.7 `ReminderNote.test.tsx`（v0.2 新增）

| # | 案例 | 期望 |
|---|---|---|
| 1 | 渲染 children 在 `<p>` semantic 內 | OK |
| 2 | 預設帶「小提醒：」前綴 | UI |
| 3 | icon 帶 `aria-hidden="true"` | a11y |
| 4 | `className` prop 合併到 `<p>` | OK |
| 5 | `REMINDER_DONOR_NAME` 為非空字串 const | OK |

---

## 5. 開放問題

- **紅 hero 高度 `h-32`**：spec 暫 hardcode；Figma 4888 / 4890 拉到頂可能略不同高，實作時若視覺有差再 prop 化
- **`<ConfirmPanel variant="first">`**：v0.1 只有 'first' / 'normal' 兩種；若未來出現「shadow 更深」「無背景」之類需求再擴 union
- **跨頁未來 reuse**：付款結果頁、訂單成立頁也大機率需要這六件；先以「009a/b」兩處 use case 抽，rule of three 第三處出現時再 promote pattern
- **i18n disclaimer**：`DISCLAIMER_PLATFORM` 字串 hardcode 中文；i18n 上線後改 string table，DisclaimerBox API 不變

---

## 6. 變更紀錄

| 版本 | 日期 | 變更 |
|---|---|---|
| 0.1 | 2026-06-15 | 初版：從 [009a v0.2](./009a-donation-confirm.md) §3–§6 與 [009b v0.2](./009b-purchase-confirm.md) §3–§7 inline 排版抽出 6 個 primitive；對齊 008a BottomSheet 「UI primitive vs business form 分 spec」慣例 |
| 0.2 | 2026-06-16 | **新增 §2.7 `<ReminderNote>`**（卡內 inline 提醒）+ `REMINDER_DONOR_NAME` 文案 const；參考 IMG_4891（donation confirm 截圖）。文案中圖原文「姓名與身分證字號」對齊本頁實際可編輯欄位（僅姓名）做收斂；身分證字號預設來自 JKOS 帳戶 KYC，本頁不蒐集。Test §4.7（5 case）；§1 primitive 數量 6 → 7 |
