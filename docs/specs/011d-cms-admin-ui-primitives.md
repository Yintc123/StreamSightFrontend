# Spec 011d：CMS admin UI primitives

- **狀態**：Draft（v0.1 — 從 011a charity admin 抽出 form / list / page-shell 共用件；對齊 009c 慣例）
- **建立日期**：2026-06-16
- **路徑（規劃）**：
  - `src/components/cms/AdminPageShell.tsx` + `.test.tsx`
  - `src/components/cms/AdminTable.tsx` + `.test.tsx`
  - `src/components/cms/FormField.tsx` + `.test.tsx`
  - `src/components/cms/Input.tsx` + `.test.tsx`
  - `src/components/cms/Textarea.tsx` + `.test.tsx`
  - `src/components/cms/NumberInput.tsx` + `.test.tsx`
  - `src/components/cms/DateTimeInput.tsx` + `.test.tsx`
  - `src/components/cms/MultiSelectChips.tsx` + `.test.tsx`
- **依賴**：
  - 既有 design tokens（[003a](./003a-design-system.md)）
  - 既有 [`<TopNav>`](./003b-topnav.md)（v0.5 含 `backHref`）
  - 既有 [`<RequiredLabel>`](./009c-shared-confirm-ui.md#25-requiredlabel--必填欄位-label)（009c 已存）
- **使用方**：
  - [011a CmsCharityAdmin](./011a-cms-charity-admin.md)
  - 011b / 011c（待 v0.2+）

---

## 1. 為何拆 spec

charity / project / item 三個 admin route 各自有 list + create + edit page，**共用一套表單元件 + table + page chrome**。對齊 [009c](./009c-shared-confirm-ui.md) 慣例：先把 generic UI 抽到 ui-primitive 層，business form 內容 caller 自接。

放 `src/components/cms/` 而非 `src/components/ui/`：

- `ui/` 是「整個 app 都可能用到」的純展示 primitive（TopNav / FallbackImage / RequiredLabel）
- `cms/` 是「admin 場景才用」的 primitive（admin-list table、admin-form 集合），語意明確避免 consumer-side 誤用

> v0.2+ 若有 ConfirmDialog / ImageUploader 等加入，繼續放 `src/components/cms/`；若發現某件其實 consumer 端也有用（如 ConfirmDialog 用在 logout 確認），再 promote 到 `ui/`。

---

## 2. Primitives — Page chrome

### 2.1 `<AdminPageShell>`

職責：admin 頁的整體外殼。`<TopNav>` + 紅 hero（或灰色 admin chrome） + `<main>` wrapper + optional sticky 底部 actions（save / delete）。

```ts
type AdminPageShellProps = {
  title: string                   // TopNav title
  backHref: string                // TopNav backHref（admin 頁一律固定路徑，不走 smart-back）
  /** 底部 sticky actions 群，例如 [Save, Cancel]；省略 → 不渲染 sticky bar */
  actions?: ReactNode
  /** 整頁送出 handler（form-wrap 整個 main）；省略 → 不 wrap form */
  onSubmit?: () => void
  children: ReactNode
}
```

實作 reference：

```tsx
'use client'
import { TopNav } from '@/components/ui/TopNav'

export function AdminPageShell({
  title, backHref, actions, onSubmit, children,
}: AdminPageShellProps) {
  const content = (
    <>
      <main className="flex-1 px-5 py-5">{children}</main>
      {actions && (
        <div className="sticky bottom-0 inset-x-0 bg-surface-card border-t border-line
                        px-5 pt-2 pb-[max(0.75rem,env(safe-area-inset-bottom))]
                        flex items-center gap-2 z-30">
          {actions}
        </div>
      )}
    </>
  )
  return (
    <div className="min-h-dvh bg-surface-page flex flex-col">
      <TopNav title={title} backHref={backHref} />
      {onSubmit ? (
        <form
          onSubmit={(e) => { e.preventDefault(); onSubmit() }}
          noValidate
          className="flex-1 flex flex-col"
        >
          {content}
        </form>
      ) : (
        content
      )}
    </div>
  )
}
```

- **`backHref` required**：admin 頁固定路徑返回，避免 smart-back 跳到非預期頁（依 [011 §2.3](./011-cms-resource-admin.md#23-topnav-設定每頁)）
- **`onSubmit` optional**：list 頁無 form；create / edit 頁有 form
- **Sticky actions** vs sticky CTA：admin 通常需要「Save + Cancel」兩個按鈕並排，跟 [009c StickyConfirmCta](./009c-shared-confirm-ui.md#26-stickyconfirmcta--sticky-底部送出按鈕) 的單一 CTA 不同。`actions` 接 ReactNode 讓 caller 自由組合

---

## 3. Primitives — Form fields

設計原則：

- 每個 input primitive **只負責「視覺 + a11y semantic」**，不知道 validation rule / form state
- 用 `<FormField>` wrapper 統一處理 label + 必填 marker + error 顯示
- 配 `useReducer` 表單 hook（pattern 同 [008b §3.2](./008b-donation-settings-sheet.md#32-reducer-patternv02--取代-v01-的-usestate--setform) / [009a §5.4](./009a-donation-confirm.md#54-form-state)），primitive 不接 hook、純受控

### 3.1 `<FormField>` — label / error / 必填 marker 統一 wrapper

```ts
type FormFieldProps = {
  /** input 的 id；同時用於 label htmlFor + error aria-describedby */
  id: string
  label: string
  required?: boolean              // 預設 false；true 加 紅星 + sr-only「必填」
  /** caller 自填的錯誤訊息；undefined → 不渲染 error */
  error?: string
  /** 受控的 input/textarea/select 等 form control */
  children: ReactNode
  /** optional 輔助說明（label 下方、input 上方） */
  hint?: string
}
```

實作 reference：

```tsx
export function FormField({ id, label, required, error, children, hint }: FormFieldProps) {
  const errorId = `${id}-error`
  const hintId = `${id}-hint`
  return (
    <div className="space-y-1.5 mb-4">
      <label htmlFor={id} className="block text-sm text-ink-AAA">
        {label}
        {required && (
          <>
            {' '}
            <span aria-hidden className="text-brand">*</span>
            <span className="sr-only">必填</span>
          </>
        )}
      </label>
      {hint && (
        <p id={hintId} className="text-xs text-ink-A leading-5">{hint}</p>
      )}
      {children}
      {error && (
        <p id={errorId} role="alert" className="text-xs text-brand leading-5">
          {error}
        </p>
      )}
    </div>
  )
}
```

- caller 在 input element 上要：`<input id={id} aria-invalid={!!error} aria-describedby={error ? errorId : hint ? hintId : undefined} />`
- `role="alert"` on error 讓 SR 即時 announce 新出現的錯誤
- 不重用 `<RequiredLabel>`（009c）— 009c 的 label 與 input 是兄弟、本 FormField wrapper 統一管 layout + error region，重複的 className 不值得抽

### 3.2 `<Input>` — single-line text 輸入

```ts
type InputProps = {
  id: string
  type?: 'text' | 'email' | 'url' | 'tel'    // 預設 'text'
  value: string
  onChange: (value: string) => void
  placeholder?: string
  maxLength?: number
  required?: boolean              // a11y; 樣式仍由 FormField 處理
  ariaInvalid?: boolean
  ariaDescribedBy?: string
}
```

實作 reference：

```tsx
export function Input({
  id, type = 'text', value, onChange, placeholder, maxLength,
  required, ariaInvalid, ariaDescribedBy,
}: InputProps) {
  return (
    <input
      id={id}
      type={type}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      maxLength={maxLength}
      required={required}
      aria-invalid={ariaInvalid}
      aria-describedby={ariaDescribedBy}
      className="w-full h-11 rounded-lg border border-line bg-surface-card
                 px-3 text-sm text-ink-AAA placeholder:text-ink-A
                 focus:border-2 focus:border-ink-AAA focus:outline-none
                 aria-invalid:border-brand"
    />
  )
}
```

> `aria-invalid:border-brand` Tailwind variant（v4 內建）— 錯誤時邊框變紅，無需 caller 自己組 className。

### 3.3 `<Textarea>` — multi-line

```ts
type TextareaProps = {
  id: string
  value: string
  onChange: (value: string) => void
  placeholder?: string
  maxLength?: number
  rows?: number                   // 預設 4
  required?: boolean
  ariaInvalid?: boolean
  ariaDescribedBy?: string
}
```

實作同 Input 但 element 是 `<textarea>`、`min-h-[var(--rows*24px)]` 自動長高、`resize-y` 允許使用者拖。

### 3.4 `<NumberInput>` — 整數輸入

```ts
type NumberInputProps = {
  id: string
  value: number
  onChange: (value: number) => void
  min?: number
  max?: number
  step?: number                   // 預設 1
  ariaInvalid?: boolean
  ariaDescribedBy?: string
}
```

實作 reference：

```tsx
export function NumberInput({ id, value, onChange, min, max, step = 1, ariaInvalid, ariaDescribedBy }: NumberInputProps) {
  return (
    <input
      id={id}
      type="number"
      value={value}
      onChange={(e) => {
        const n = e.target.valueAsNumber
        if (Number.isFinite(n)) onChange(n)
      }}
      min={min}
      max={max}
      step={step}
      aria-invalid={ariaInvalid}
      aria-describedby={ariaDescribedBy}
      className="w-full h-11 rounded-lg border border-line bg-surface-card
                 px-3 text-sm text-ink-AAA
                 focus:border-2 focus:border-ink-AAA focus:outline-none
                 aria-invalid:border-brand"
    />
  )
}
```

- 用 `valueAsNumber` 而非 `parseInt(e.target.value)` — 自動排除空字串 / 非數字（回 NaN）；`Number.isFinite` 守門
- caller 自行決定預設值（reducer DEFAULT_FORM 給）

### 3.5 `<DateTimeInput>` — `datetime-local` wrapper

```ts
type DateTimeInputProps = {
  id: string
  /** ISO string 或空字串；空字串 = 「未設定」（對應 BE null） */
  value: string
  onChange: (value: string) => void
  min?: string                    // ISO string；datetime-local 原生支援
  max?: string
  ariaInvalid?: boolean
  ariaDescribedBy?: string
}
```

實作 reference：

```tsx
export function DateTimeInput({ id, value, onChange, min, max, ariaInvalid, ariaDescribedBy }: DateTimeInputProps) {
  return (
    <input
      id={id}
      type="datetime-local"
      value={isoToLocalInput(value)}
      onChange={(e) => onChange(localInputToIso(e.target.value))}
      min={min ? isoToLocalInput(min) : undefined}
      max={max ? isoToLocalInput(max) : undefined}
      aria-invalid={ariaInvalid}
      aria-describedby={ariaDescribedBy}
      className="w-full h-11 rounded-lg border border-line bg-surface-card
                 px-3 text-sm text-ink-AAA
                 focus:border-2 focus:border-ink-AAA focus:outline-none
                 aria-invalid:border-brand"
    />
  )
}

/** ISO `2026-06-16T03:30:00.000Z` → `2026-06-16T11:30`（local，無秒、無時區） */
function isoToLocalInput(iso: string): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

/** local `2026-06-16T11:30` → ISO `2026-06-16T03:30:00.000Z`（依瀏覽器 TZ） */
function localInputToIso(local: string): string {
  if (!local) return ''
  const d = new Date(local)
  if (Number.isNaN(d.getTime())) return ''
  return d.toISOString()
}
```

- BE 接收 ISO UTC（`z.string().datetime()`）；FE 使用者看到的是 local timezone
- 用 native `datetime-local` 而非引入 react-datepicker 函式庫 — 7-day demo 不增加 dependency、行動裝置原生 UI 體驗夠好
- timezone conversion 兩個 helper 寫在同檔，pure function，有單獨 test

### 3.6 `<MultiSelectChips>` — 多選 chip 選擇

categoryIds 用：渲染所有可選 categories（從 `/api/categories` fetch），點 chip → toggle 是否選中。

```ts
type MultiSelectChipsProps<T extends string> = {
  /** 候選 list：value（送出時用） + label（顯示用） */
  options: { value: T; label: string }[]
  /** 目前選中的 value array */
  value: T[]
  onChange: (value: T[]) => void
  /** 最大選擇數；達上限後其他 chip disabled */
  max?: number
  /** a11y group label（外面 FormField 已給 label，這裡只給 aria-label） */
  ariaLabel?: string
}
```

實作 reference：

```tsx
export function MultiSelectChips<T extends string>({
  options, value, onChange, max, ariaLabel,
}: MultiSelectChipsProps<T>) {
  const selected = new Set(value)
  const atMax = max !== undefined && value.length >= max
  return (
    <ul role="group" aria-label={ariaLabel} className="flex flex-wrap gap-2">
      {options.map((o) => {
        const on = selected.has(o.value)
        const disabled = !on && atMax
        return (
          <li key={o.value}>
            <button
              type="button"
              aria-pressed={on}
              disabled={disabled}
              onClick={() => {
                const next = new Set(value)
                if (on) next.delete(o.value)
                else next.add(o.value)
                onChange(Array.from(next) as T[])
              }}
              className={[
                'h-8 px-3 rounded-full text-xs leading-5',
                on
                  ? 'bg-brand text-white'
                  : 'bg-black/5 text-ink-AA hover:bg-black/10',
                disabled && 'opacity-50 cursor-not-allowed',
              ].filter(Boolean).join(' ')}
            >
              {o.label}
            </button>
          </li>
        )
      })}
    </ul>
  )
}
```

- 用 `<button aria-pressed>` 而非 `<input type="checkbox">` — chip 視覺更接近 toggle button、SR 也讀得出來
- `max` reached → 未選 chip disabled，已選 chip 仍可點來 unselect

---

## 4. Primitives — List view

### 4.1 `<AdminTable>` — 簡單 row-based 表格

職責：admin list 頁的核心；每筆 row 顯示幾欄 + 操作按鈕（「編輯」「封存」「刪除」等）。

```ts
type AdminTableProps<T> = {
  /** 表頭 column 定義 */
  columns: AdminTableColumn<T>[]
  /** 資料 row */
  rows: T[]
  /** 每筆 row 的 key extractor */
  rowKey: (row: T) => string
  /** 空狀態渲染 */
  emptyState?: ReactNode
  /** caption（a11y SR 用，視覺隱藏） */
  caption: string
}

type AdminTableColumn<T> = {
  /** 顯示在 thead 的標題 */
  header: string
  /** 渲染對應 cell 內容（自由度高，可放 link / button / chip） */
  cell: (row: T) => ReactNode
  /** Tailwind width class（e.g. 'w-32' / 'w-1/3' / 'flex-1'） */
  width?: string
  /** 對齊：'left'（預設） / 'right'（金額類） */
  align?: 'left' | 'right'
}
```

實作 reference：

```tsx
export function AdminTable<T>({ columns, rows, rowKey, emptyState, caption }: AdminTableProps<T>) {
  if (rows.length === 0) {
    return emptyState ?? <p className="text-sm text-ink-A text-center py-8">沒有資料</p>
  }
  return (
    <table className="w-full text-sm border-collapse">
      <caption className="sr-only">{caption}</caption>
      <thead>
        <tr className="border-b border-line">
          {columns.map((c) => (
            <th
              key={c.header}
              scope="col"
              className={[
                'py-2 px-2 text-xs text-ink-A font-normal',
                c.width,
                c.align === 'right' ? 'text-right' : 'text-left',
              ].filter(Boolean).join(' ')}
            >
              {c.header}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => (
          <tr key={rowKey(row)} className="border-b border-line-soft hover:bg-black/5">
            {columns.map((c) => (
              <td
                key={c.header}
                className={[
                  'py-3 px-2 text-ink-AAA',
                  c.width,
                  c.align === 'right' ? 'text-right' : 'text-left',
                ].filter(Boolean).join(' ')}
              >
                {c.cell(row)}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  )
}
```

- 用 native `<table>` 而非 `<div role="grid">` — semantic HTML、SR 支援開箱即用
- caller 把「編輯」按鈕用 `Link` 包裝放在 cell 內，自由度高
- v0.1 **不做** sort / filter / pagination chrome；MVP charity list 一頁就夠（demo data 量小），分頁 / sort 等 v0.2 加

### 4.2 為何不重用 consumer side 的 CharityListShell

[`CharityListShell`](../../src/app/donation/CharityListShell.tsx)（spec 003i）是 infinite-scroll grid card view：

| | 消費者 CharityListShell | admin AdminTable |
|---|---|---|
| 視覺 | grid card（圖 + 兩行字） | row（多欄資訊密集） |
| Pagination | infinite scroll | 一頁顯示完 / 分頁 |
| Search / filter | tab + category + search | v0.1 無；v0.2 加 |
| Actions | 點卡 → 進詳情頁 | inline 編輯 / 封存 / 刪除 |
| Lifecycle 過濾 | 只顯示 live | 看全部（含 archived / deleted；v0.2） |

差異太大，沒重用價值。共享 `useResourceListInfinite` hook（cursor 分頁邏輯）等 v0.2 admin 加 pagination 時再評估。

---

## 5. 使用範例（compose 起來）

011a `/cms/charities/new` 完整 compose（簡化版，欄位數量縮減）：

```tsx
'use client'
import { AdminPageShell } from '@/components/cms/AdminPageShell'
import { FormField } from '@/components/cms/FormField'
import { Input } from '@/components/cms/Input'
import { Textarea } from '@/components/cms/Textarea'
import { useCharityForm } from './useCharityForm'

export function CharityCreatePage() {
  const { form, dispatch, errors, isValid, handleSubmit } = useCharityForm()
  return (
    <AdminPageShell
      title="新增公益團體"
      backHref="/cms/charities"
      onSubmit={handleSubmit}
      actions={
        <button
          type="submit"
          disabled={!isValid}
          className="w-full h-11 rounded-full bg-brand text-white text-sm font-semibold disabled:bg-black/10 disabled:text-ink-A"
        >
          建立
        </button>
      }
    >
      <FormField id="name" label="名稱" required error={errors.name}>
        <Input
          id="name"
          value={form.name}
          onChange={(v) => dispatch({ type: 'SET_NAME', value: v })}
          maxLength={120}
          required
          ariaInvalid={!!errors.name}
          ariaDescribedBy={errors.name ? 'name-error' : undefined}
        />
      </FormField>

      <FormField id="description" label="簡介" required error={errors.description}>
        <Textarea
          id="description"
          value={form.description}
          onChange={(v) => dispatch({ type: 'SET_DESCRIPTION', value: v })}
          maxLength={500}
          rows={4}
          required
        />
      </FormField>

      {/* ... 其他欄位 */}
    </AdminPageShell>
  )
}
```

詳細欄位、reducer、buildPayload、test plan 全部在 [011a §4 / §5 / §6 / §7](./011a-cms-charity-admin.md)。

---

## 6. 測試（colocated `.test.tsx`，**強制 TDD**）

每個 primitive 4-6 個 case。focus 在「prop → 渲染結果」與 a11y。

### 6.1 `AdminPageShell.test.tsx`

| # | 案例 | 期望 |
|---|---|---|
| 1 | 渲染 TopNav title + backHref + children | OK |
| 2 | actions 省略 → 不渲染 sticky bar | OK |
| 3 | actions 有 + onSubmit 有 → form wrap + sticky bar 顯示 | form 整合 |
| 4 | 在 actions submit button 按 click → onSubmit 被叫 | form integration |

### 6.2 `FormField.test.tsx`

| # | 案例 | 期望 |
|---|---|---|
| 1 | required=true → label 含紅星 + sr-only「必填」 | a11y |
| 2 | error 給字串 → 渲染 error 段落（`role="alert"`） | a11y |
| 3 | error 給 undefined → 不渲染 error 段落 | DOM 不污染 |
| 4 | hint 有 → 渲染 hint 段落 | OK |
| 5 | `htmlFor` = id；error / hint 的 id 對應 | a11y |

### 6.3 `Input.test.tsx`

| # | 案例 | 期望 |
|---|---|---|
| 1 | 渲染 `<input type="text">` + value 顯示 | OK |
| 2 | 打字 → `onChange(value)` 被叫 | controlled |
| 3 | `type='email'` → element type 跟著變 | OK |
| 4 | maxLength prop 套到 element | OK |
| 5 | ariaInvalid=true → `aria-invalid="true"` + 邊框紅（className 含 `aria-invalid:border-brand`） | a11y |

### 6.4 `Textarea.test.tsx`

3-4 case，類似 Input（element type 改 `<textarea>` / `rows` prop）

### 6.5 `NumberInput.test.tsx`

| # | 案例 | 期望 |
|---|---|---|
| 1 | 渲染 `<input type="number">` + value | OK |
| 2 | 打數字 → `onChange(number)` | controlled |
| 3 | 清空輸入 → 不 call onChange（NaN 守門） | edge case |
| 4 | min / max / step prop 套到 element | OK |

### 6.6 `DateTimeInput.test.tsx`

| # | 案例 | 期望 |
|---|---|---|
| 1 | 渲染 `<input type="datetime-local">` | OK |
| 2 | value ISO → element value 轉 local 字串 | TZ conversion |
| 3 | 輸入 local → `onChange(iso)` 收 ISO 字串 | TZ conversion |
| 4 | value 空字串 → element 也空 | OK |
| 5 | `isoToLocalInput` / `localInputToIso` pure function 個別 test | unit |

### 6.7 `MultiSelectChips.test.tsx`

| # | 案例 | 期望 |
|---|---|---|
| 1 | 渲染所有 options 為 chip button | OK |
| 2 | 選中 chip → `aria-pressed="true"` + brand 紅底 | a11y + UI |
| 3 | 點未選 → onChange 加；點已選 → onChange 移除 | controlled |
| 4 | 達 max → 未選 chip disabled；已選 chip 仍可點 unselect | max gate |

### 6.8 `AdminTable.test.tsx`

| # | 案例 | 期望 |
|---|---|---|
| 1 | rows 有 → 渲染 `<table>` + thead + tbody + 每 row | OK |
| 2 | rows 空 → 渲染 emptyState（caller 給 / fallback） | OK |
| 3 | column.cell 回 ReactNode 正確渲染（含 Link / button） | composition |
| 4 | caption 為 sr-only | a11y |

---

## 7. 開放問題

- **`<Select>` single-select**：v0.1 charity form 沒有 single-select 欄位；project / item 也沒有。Lifecycle UI / status filter（v0.2）會用到（『顯示 全部 / 已封存 / 已刪除』）。屆時補
- **`<ConfirmDialog>`**：v0.1 無 destructive action（不做 delete / archive）；v0.2 lifecycle 上線時補。可以從 [`<InfoDialog>`](../../src/components/ui/InfoDialog.tsx) 擴展 props（加 `confirmLabel` + `cancelLabel` + `onConfirm`），或另立新 primitive。屆時權衡
- **`<ImageUploader>`**：v0.1 無 image 欄位；v0.3 配 BE 018 presign flow 補。屆時 011e spec
- **Form 框架（react-hook-form / Formik）**：v0.1 沿用既有 `useReducer` pattern（對齊 008b / 009a），輕量、可預測；若 form 變超複雜（cross-field validation 多、巢狀 array）再評估升級
- **Zod 整合 form validation**：v0.1 client validation 寫在 reducer 內手刻；v0.2 若 form 多到不可維護，把 Zod schema 抽出共用 client + BFF 兩邊
- **`<AdminTable>` pagination chrome**：v0.1 一頁顯示全部（demo data 量小）；v0.2 加 [prev / next] 按鈕 + 顯示「第 X 頁 共 Y 頁」；最終可重用 cursor pagination
- **Sort UI on AdminTable**：thead `<th>` 變可點 button + 顯示排序方向 chevron。v0.2 隨 list filter 一起加
- **手機 admin UI**：admin 主場景是 desktop；table 在窄螢幕 horizontal scroll 即可；若實際使用發現 mobile-first 必要，加 responsive layout（v0.3+）
- **i18n field group**：當 v0.5 加 nameEn / descriptionEn 等雙語欄位時，可能要 `<BilingualFieldGroup>` primitive 把同一概念的 zh + en 對應排在一起。屆時設計

---

## 8. 變更紀錄

| 版本 | 日期 | 變更 |
|---|---|---|
| 0.1 | 2026-06-16 | 初版：從 [011a charity admin](./011a-cms-charity-admin.md) 抽出 8 個 admin UI primitive：`<AdminPageShell>` (chrome) + `<AdminTable>` (list) + `<FormField>` (label/error wrapper) + `<Input>` / `<Textarea>` / `<NumberInput>` / `<DateTimeInput>` / `<MultiSelectChips>` (5 個 form field)。對齊 009c 「primitive vs business form 分檔」慣例。放 `src/components/cms/` 命名空間，與 `src/components/ui/` 純展示 primitive 區隔。Sort / pagination / ConfirmDialog / ImageUploader / Select-single / BilingualFieldGroup 全列開放問題、待 v0.2+ |
