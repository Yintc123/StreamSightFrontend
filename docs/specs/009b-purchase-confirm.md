# Spec 009b：`/checkout/purchase` 義賣商品確認頁

- **狀態**：Draft（v0.3 — 改用 [009c shared confirm UI](./009c-shared-confirm-ui.md) primitives，移除 inline className）
- **路徑（規劃）**：
  - `src/app/checkout/purchase/page.tsx`（RSC）
  - `src/app/checkout/purchase/useReceiptInfoForm.ts` + `.test.ts`（v0.2 — pure logic hook）
  - `src/app/checkout/purchase/ReceiptInfoForm.tsx` + `.test.tsx`（v0.2 起為純 UI）
- **依賴**：
  - [009 index §2 routing](./009-checkout-confirm.md#2-routing) — 接收 query params
  - [009c shared confirm UI](./009c-shared-confirm-ui.md) — `<ConfirmPageShell>` / `<ConfirmPanel>` / `<KeyValueList>` / `<DisclaimerBox>` / `<RequiredLabel>` 等 primitive
  - 既有 RSC fetcher：`fetchItemDetail`（[004 §3](./004-detail-pages.md)）
  - [008c v0.2 reducer pattern](./008c-purchase-qty-sheet.md)（form state 套路）
- **Figma 對應**：IMG_4890

---

## 1. 職責

接收 [008c 購買數量 sheet](./008c-purchase-qty-sheet.md)「下一步」傳來的 query payload，顯示：

1. **購買明細**（read-only summary：商品 / 團體 / 品項表 / 運費 / 總計）
2. **捐款人基本資料**（disclaimer only，**無 form 欄位**）
3. **收據資訊**（姓名 input + 匿名 checkbox）
4. **送出按鈕**（sticky bottom）

跟 [009a](./009a-donation-confirm.md) 的差異：

| | 009a 捐款 | 009b 購買 |
|---|---|---|
| Panel 數 | 2（明細 + 捐款人資料含 form） | 3（明細 + 捐款人資料 disclaimer-only + 收據資訊 form） |
| 收據選項 dropdown | ✅ 在 Panel 2 | ❌（沒這欄）|
| 姓名 input | 在 Panel 2 | 在 **Panel 3** 收據資訊 |
| 匿名 checkbox | ❌ | ✅ |
| 「下次扣款日期」 | monthly 才有 | ❌（單次購買） |

---

## 2. URL Query → Page Props

`/checkout/purchase?itemId=<uuid>&qty=2`

```ts
const Query = z.object({
  itemId: z.string().uuid(),
  qty: z.coerce.number().int().min(1).max(99),
})

export default async function Page({ searchParams }) {
  const parsed = Query.safeParse(await searchParams)
  if (!parsed.success) notFound()
  const item = await fetchItemDetail(parsed.data.itemId)
  if (!item) notFound()
  return <PurchaseConfirmPage query={parsed.data} item={item} />
}
```

---

## 3. 元件結構

```
<page.tsx> (RSC, async)
  ├─ Zod validate searchParams
  ├─ fetchItemDetail
  └─ <PurchaseConfirmPage> ('use client')
        └─ <ConfirmPageShell title="確認捐款資訊" ctaLabel="確認送出" isValid onSubmit>
              ├─ <PurchaseDetailPanel item qty>           ← Panel 1（首張，variant="first"）
              ├─ <DisclaimerPanel>                         ← Panel 2（只放 disclaimer）
              └─ <ReceiptInfoFormPanel form dispatch>      ← Panel 3（form 欄位）
```

整頁 `<form>` + 紅 hero + TopNav + sticky CTA 由 [`<ConfirmPageShell>`](./009c-shared-confirm-ui.md#21-confirmpageshell--整頁外殼) 接管，本 spec 不複述。TopNav 標題 `"確認捐款資訊"` 跟 009a 一致（Figma 4890 用同字串）。

---

## 4. Panel 1：購買明細

對齊 IMG_4890：

```
┌──────────────────────────────────────┐
│           購買明細                    │  ← h2 置中（不是「捐款明細」）
│                                       │
│   商品          陸仕私廚 藤椒牛肉麵     │
│                 760g                  │
│   團體          財團法人台灣紅絲帶      │
│                 基金會                 │
│                                       │
│   ─────────────────────────────       │  ← divider
│   購買品項                            │
│                                       │
│   陸仕私廚 藤椒    TWD 449 x 1   TWD 449
│   牛肉麵 760g 袋(...)
│                                       │
│   運費                          TWD 0  │
│   總計                       TWD 449   │  ← brand 紅字加重
└──────────────────────────────────────┘
```

### 4.1 「商品」/「團體」key-value

用 [`<KeyValueList>` + `<KeyValueRow>`](./009c-shared-confirm-ui.md#23-keyvaluelist--dl-排版)；資料來源 `item.name` 與 `item.charity.name`。

### 4.2 「購買品項」sub-section

`<KeyValueList>` 不適合多欄（價×量、subtotal）的 row 結構，這段用 flex 自渲染：

```tsx
<div className="border-t border-line pt-3 mt-3">
  <p className="text-sm text-ink-AAA mb-2">購買品項</p>
  <div className="flex items-start text-sm">
    <p className="flex-1 text-ink-AAA leading-5 line-clamp-2">{item.name}</p>
    <p className="text-ink-AA w-24 text-right shrink-0">
      TWD {priceFmt.format(item.priceTwd)} x {qty}
    </p>
    <p className="text-ink-AAA w-20 text-right shrink-0">
      TWD {priceFmt.format(subtotal)}
    </p>
  </div>
</div>
```

### 4.3 運費 / 總計

繼續用 `<KeyValueList>`，總計 row 傳 `variant="emphasized"`：

```tsx
<div className="border-t border-line pt-3 mt-3">
  <KeyValueList>
    <KeyValueRow label="運費">TWD {priceFmt.format(shipping)}</KeyValueRow>
    <KeyValueRow label="總計" variant="emphasized">TWD {priceFmt.format(total)}</KeyValueRow>
  </KeyValueList>
</div>
```

```ts
const subtotal = item.priceTwd * qty
const shipping = 0                     // v0.1 hardcode；同 008c
const total = subtotal + shipping
```

### 4.4 完整渲染 reference

```tsx
import { ConfirmPanel } from '@/components/ui/ConfirmPanel'
import { KeyValueList, KeyValueRow } from '@/components/ui/KeyValueList'

function PurchaseDetailPanel({ item, qty, subtotal, shipping, total }: {
  item: ItemDetail
  qty: number
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
          <p className="flex-1 text-ink-AAA leading-5 line-clamp-2">{item.name}</p>
          <p className="text-ink-AA w-24 text-right shrink-0">
            TWD {priceFmt.format(item.priceTwd)} x {qty}
          </p>
          <p className="text-ink-AAA w-20 text-right shrink-0">
            TWD {priceFmt.format(subtotal)}
          </p>
        </div>
      </div>

      <div className="border-t border-line pt-3 mt-3">
        <KeyValueList>
          <KeyValueRow label="運費">TWD {priceFmt.format(shipping)}</KeyValueRow>
          <KeyValueRow label="總計" variant="emphasized">TWD {priceFmt.format(total)}</KeyValueRow>
        </KeyValueList>
      </div>
    </ConfirmPanel>
  )
}
```

---

## 5. Panel 2：捐款人基本資料（disclaimer only）

跟 [009a §5.1](./009a-donation-confirm.md#51-disclaimer) 同 disclaimer 文案；**只有這段**，沒收據開立方式 dropdown、沒姓名 input。

```tsx
import { ConfirmPanel } from '@/components/ui/ConfirmPanel'
import { DisclaimerBox, DISCLAIMER_PLATFORM } from '@/components/ui/DisclaimerBox'

function DisclaimerPanel() {
  return (
    <ConfirmPanel title="捐款人基本資料">
      <DisclaimerBox>{DISCLAIMER_PLATFORM}</DisclaimerBox>
    </ConfirmPanel>
  )
}
```

> 設計把姓名 input 留到下一個 panel 是 Figma 4890 的選擇；不要把這 panel 跟 009a panel 2 合併。

---

## 6. Panel 3：收據資訊

對齊 IMG_4890 底部：

```
┌──────────────────────────────────────┐
│           收據資訊                    │  ← h2 置中
│                                       │
│  捐款人姓名 *                         │
│  ┌─────────────────────────────┐    │
│  │ 請填寫姓名                    │    │  ← <input> text
│  └─────────────────────────────┘    │
│                                       │
│  ☐ 我要匿名捐款 ⓘ                    │  ← checkbox + tooltip icon
└──────────────────────────────────────┘
```

### 6.1 Form state

```ts
interface FormState {
  donorName: string         // 受控原始字串
  isAnonymous: boolean      // 預設 false
}

const DEFAULT_FORM: FormState = { donorName: '', isAnonymous: false }

type Action =
  | { type: 'SET_DONOR_NAME'; value: string }
  | { type: 'TOGGLE_ANONYMOUS' }

function reducer(s: FormState, a: Action): FormState {
  switch (a.type) {
    case 'SET_DONOR_NAME':   return { ...s, donorName: a.value }
    case 'TOGGLE_ANONYMOUS': return { ...s, isAnonymous: !s.isAnonymous }
  }
}
```

### 6.2 Validation（v0.1：勾匿名後仍要填姓名）

```ts
const isValid = form.donorName.trim().length > 0
```

> 「勾匿名後是否該禁用 / 不必填姓名」屬 product 決定，[009 §6 開放問題](./009-checkout-confirm.md#6-開放問題跨-spec)。v0.1 一律要求姓名 — 收據與發票仍需身份。

### 6.3 `useReceiptInfoForm` hook（v0.2 — container 邏輯抽出）

對齊 [009a §5.6](./009a-donation-confirm.md) / [008b §3.6](./008b-donation-settings-sheet.md) 套路：

```ts
// src/app/checkout/purchase/useReceiptInfoForm.ts
'use client'
import { useReducer } from 'react'
import { toast } from 'sonner'
import type { ItemDetail } from '@/lib/schemas/detail'

export type UseReceiptInfoFormOpts = {
  query: PurchaseCheckoutQuery       // { itemId, qty }
  item: ItemDetail
}

export type UseReceiptInfoFormReturn = {
  form: FormState
  dispatch: React.Dispatch<Action>
  isValid: boolean
  subtotal: number
  shipping: number
  total: number
  handleSubmit: () => void
}

export function useReceiptInfoForm(
  opts: UseReceiptInfoFormOpts,
): UseReceiptInfoFormReturn {
  const [form, dispatch] = useReducer(reducer, DEFAULT_FORM)
  const isValid = form.donorName.trim().length > 0

  const subtotal = opts.item.priceTwd * opts.query.qty
  const shipping = 0
  const total = subtotal + shipping

  const handleSubmit = () => {
    if (!isValid) return
    const payload = buildPayload(opts.query, opts.item, form, { subtotal, shipping, total })
    console.log('[checkout/purchase/confirm]', payload)
    toast.success('已送出（demo 不接金流）')
  }

  return { form, dispatch, isValid, subtotal, shipping, total, handleSubmit }
}
```

**Page-level component（純 UI）**：用 [`<ConfirmPageShell>`](./009c-shared-confirm-ui.md#21-confirmpageshell--整頁外殼) 包三個 panel：

```tsx
// src/app/checkout/purchase/PurchaseConfirmPage.tsx
'use client'
import { ConfirmPageShell } from '@/components/ui/ConfirmPageShell'
import { useReceiptInfoForm } from './useReceiptInfoForm'

export function PurchaseConfirmPage({ query, item }: Props) {
  const { form, dispatch, isValid, subtotal, shipping, total, handleSubmit }
    = useReceiptInfoForm({ query, item })
  return (
    <ConfirmPageShell
      title="確認捐款資訊"
      ctaLabel="確認送出"
      isValid={isValid}
      onSubmit={handleSubmit}
    >
      <PurchaseDetailPanel
        item={item} qty={query.qty}
        subtotal={subtotal} shipping={shipping} total={total}
      />
      <DisclaimerPanel />
      <ReceiptInfoFormPanel form={form} dispatch={dispatch} />
    </ConfirmPageShell>
  )
}
```

`<form>` + sticky CTA 由 `<ConfirmPageShell>` 接管，page 層不重複寫。

### 6.4 `<ReceiptInfoFormPanel>` reference（Panel 3 內容）

純 props-driven panel：姓名 input + 匿名 checkbox。className 套 [009c](./009c-shared-confirm-ui.md) primitive：

```tsx
import { ConfirmPanel } from '@/components/ui/ConfirmPanel'
import { RequiredLabel } from '@/components/ui/RequiredLabel'

type ReceiptInfoFormPanelProps = {
  form: FormState
  dispatch: React.Dispatch<Action>
}

export function ReceiptInfoFormPanel({ form, dispatch }: ReceiptInfoFormPanelProps) {
  return (
    <ConfirmPanel title="收據資訊">
      <RequiredLabel htmlFor="donorName" className="mb-2">捐款人姓名</RequiredLabel>
      <input
        id="donorName"
        type="text"
        placeholder="請填寫姓名"
        value={form.donorName}
        onChange={(e) => dispatch({ type: 'SET_DONOR_NAME', value: e.target.value })}
        className="w-full h-12 rounded-lg border border-line bg-surface-card px-3 text-sm text-ink-AAA placeholder:text-ink-A focus:border-2 focus:border-ink-AAA focus:outline-none mb-4"
      />

      <label className="flex items-center gap-2 text-sm text-ink-AAA">
        <input
          type="checkbox"
          checked={form.isAnonymous}
          onChange={() => dispatch({ type: 'TOGGLE_ANONYMOUS' })}
          className="w-4 h-4 rounded border-line text-brand
                     focus-visible:outline focus-visible:outline-2
                     focus-visible:outline-offset-2 focus-visible:outline-brand"
        />
        <span>我要匿名捐款</span>
        <button type="button" aria-label="匿名捐款說明"
                className="text-ink-A hover:text-ink-AAA">
          <InfoIcon className="w-4 h-4" />
        </button>
      </label>
    </ConfirmPanel>
  )
}
```

### 6.5 匿名 checkbox + tooltip icon 細節

JSX 已在 [§6.4](#64-receiptinfoformpanel-referencepanel-3-內容) 內。額外行為說明：

- ⓘ icon 點開後的文字 Figma 沒給；v0.1 點擊 no-op（或顯示簡單 tooltip 文字）。實作時可暫先 `aria-label` 充當（hover 顯示瀏覽器原生 tooltip）
- checkbox 用 `<input type="checkbox">` 原生 element（無需 aria-checked）
- `<InfoIcon>` 採 lucide info circle，跟 [008c QtyStepper](./008c-purchase-qty-sheet.md#42-qtystepper-通用-ui-primitive) 同樣風格

---

## 7. 整頁外殼 + Sticky CTA

整頁 `<form>` + 紅 hero + sticky「確認送出」按鈕由 [`<ConfirmPageShell>`](./009c-shared-confirm-ui.md#21-confirmpageshell--整頁外殼) 統一接管，見 [§6.3 Page-level component](#63-usereceiptinfoform-hookv02--container-邏輯抽出) 的 reference。submit 行為（`console.log` + `toast.success` + future `router.push`）封裝在 [`useReceiptInfoForm.handleSubmit`](#63-usereceiptinfoform-hookv02--container-邏輯抽出)。

### 7.1 Submit payload shape

```ts
type PurchaseConfirmPayload = {
  itemId: string
  itemName: string
  charityName: string
  qty: number
  subtotal: number
  shipping: number
  total: number
  donor: {
    name: string
    isAnonymous: boolean
  }
}
```

`console.log` + `toast.success('已送出（demo 不接金流）')` placeholder。

---

## 8. a11y

- form 內元素同 009a：required `<span aria-hidden>*</span>` + `<span className="sr-only">必填</span>`
- 匿名 checkbox 用 `<input type="checkbox">` 原生 element（無需 aria-checked）
- tooltip icon button：`aria-label="匿名捐款說明"`
- 「購買品項」row 用 dl 不太自然，spec v0.1 用 `<div className="flex">`；如果 SR 體驗要求更高，未來改 table

---

## 9. 測試

三層測：reducer pure / hook integration / component visual。

### 9.1 Reducer pure tests

| # | 案例 | 期望 |
|---|---|---|
| R1 | SET_DONOR_NAME "Alice" → state.donorName="Alice" | OK |
| R2 | TOGGLE_ANONYMOUS → isAnonymous 翻轉、其他欄位不變 | OK |
| R3 | TOGGLE_ANONYMOUS 兩次 → 回 false | OK |

### 9.2 Hook integration tests（`useReceiptInfoForm.test.ts`，v0.2）

| # | 案例 | 期望 |
|---|---|---|
| H1 | 初始 isValid=false；subtotal = priceTwd × qty；shipping=0；total=subtotal | OK |
| H2 | dispatch SET_DONOR_NAME "Alice" → isValid=true | OK |
| H3 | dispatch TOGGLE_ANONYMOUS → state.isAnonymous=true、isValid 不變（v0.1 規則）| OK |
| H4 | handleSubmit (isValid) → toast.success called + console.log 印出含 query/item/form/totals 的 payload | OK |
| H5 | handleSubmit (!isValid) → toast.success **not** called | OK |

### 9.3 Component visual tests（`ReceiptInfoForm.test.tsx`，v0.2 — 變薄）

| # | 案例 | 期望 |
|---|---|---|
| 1 | 渲染 3 個 panel（購買明細 / disclaimer / 收據資訊）+ sticky CTA | OK |
| 2 | 總計顯示 `TWD priceTwd × qty`（brand 紅字） | UI |
| 3 | 在姓名 input 打字 → submit button enabled 切換 | UI 整合 |
| 4 | 勾匿名 checkbox → checkbox state 視覺翻轉 | UI |
| 5 | 在姓名 input 按 Enter → form submit handler 觸發（如 valid） | form semantic |

### 9.3 Page-level（integration / e2e 可選）

- `/checkout/purchase?itemId=<valid>&qty=2` → 200、總計 = `priceTwd × 2`
- 同上 qty=0 → 404
- 同上 qty=100（超過 max 99）→ 404
- itemId 不存在 → 404

---

## 10. 開放問題

- **「我要匿名捐款」ⓘ icon 點開內容**：Figma 4890 沒給。實作時可暫用 `aria-label` 充當、未來補真實 tooltip / popover
- **匿名 vs 姓名必填**：v0.1 強制要姓名（收據用途）；商業 / 法務角度可能允許「完全匿名 = 不出收據」。等 PM 確認
- **品項表的 SR semantic**：v0.1 用 `<div>` flex；未來考慮 table semantic 更標準
- **多商品 / 多品項**：v0.1 假設單一 sku；未來購物車支援多商品時，本頁的「購買品項」變多行

---

## 11. 變更紀錄

| 版本 | 日期 | 變更 |
|---|---|---|
| 0.1 | 2026-06-15 | 初版：對應 IMG_4890；三 panel 結構（明細 / disclaimer-only / 收據資訊）；reducer + 匿名 toggle + 6 個 component test |
| 0.2 | 2026-06-15 | **抽 `useReceiptInfoForm` custom hook**：對齊 [008b v0.4](./008b-donation-settings-sheet.md) container / presentational 分層；hook 包 useReducer + isValid + subtotal/total 算 + handleSubmit + toast。三層 test plan：reducer R1~R3 / hook H1~H5 / component 5 個視覺 |
| 0.3 | 2026-06-15 | **改用 [009c shared confirm UI](./009c-shared-confirm-ui.md) primitives**：整頁外殼換 `<ConfirmPageShell>`、明細 panel 換 `<ConfirmPanel>` + `<KeyValueList>`、disclaimer 換 `<DisclaimerBox>` + `DISCLAIMER_PLATFORM` const、姓名 label 換 `<RequiredLabel>`、sticky CTA 由 shell 內部接管。新增 §4.4 PurchaseDetailPanel + §6.4 ReceiptInfoFormPanel reference 完整 JSX；§7 由「sticky CTA spec」縮為「由 shell 接管」 |
