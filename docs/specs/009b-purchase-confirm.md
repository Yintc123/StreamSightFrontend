# Spec 009b：`/checkout/purchase` 義賣商品確認頁

- **狀態**：Draft（v0.10 — 加 `<ReminderNote>` 到 Panel 3 底部，參考 IMG_4891）
- **路徑（規劃）**：
  - `src/app/checkout/purchase/page.tsx`（RSC）
  - `src/app/checkout/purchase/useReceiptInfoForm.ts` + `.test.ts`（v0.2 — pure logic hook）
  - `src/app/checkout/purchase/ReceiptInfoForm.tsx` + `.test.tsx`（v0.2 起為純 UI）
- **依賴**：
  - [009 index §2 routing](./009-checkout-confirm.md#2-routing) — 接收 query params
  - [009c shared confirm UI](./009c-shared-confirm-ui.md) — `<ConfirmPageShell>` / `<ConfirmPanel>` / `<KeyValueList>` / `<DisclaimerBox>` / `<RequiredLabel>` / `<ReminderNote>` 等 primitive
  - 既有 RSC fetcher：`fetchItemDetail`（[004 §3](./004-detail-pages.md)）
  - [008c v0.2 reducer pattern](./008c-purchase-qty-sheet.md)（form state 套路）
- **Figma 對應**：IMG_4890 + IMG_4891（v0.10 Panel 3 底部小提醒）

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
| 收據選項 dropdown | ✅ 在 Panel 2 | ❌（沒這欄；[BE 022 §4.3 SaleItemPurchase body 也不接受 `receiptOption`，帶了會 schema 400](../../../backend/docs/specs/022-donation-order-api.md)） |
| 姓名 input | 在 Panel 2 | 在 **Panel 3** 收據資訊 |
| 匿名 checkbox | ❌（固定送 false）| ✅（IMG_4890 有 UI） |
| 「下次扣款日期」 | RECURRING 才有 | ❌（單次購買；BE 022 §4.3 `nextChargeAt` 永遠 null） |
| BE endpoint | `POST /user/v1/donation/orders/charity-donation` 或 `/project-donation` | `POST /user/v1/donation/orders/sale-item-purchase` |

---

## 2. URL Query → Page Props

`/checkout/purchase?saleItemId=<uuid>&quantity=2`

```ts
// Zod 對齊 BE 022 §4.3 items[].quantity (1-100) + saleItemId 命名
const Query = z.object({
  saleItemId: z.string().uuid(),
  quantity: z.coerce.number().int().min(1).max(100),
})

export type PurchaseCheckoutQuery = z.infer<typeof Query>

export default async function Page({ searchParams }) {
  const parsed = Query.safeParse(await searchParams)
  if (!parsed.success) notFound()
  const item = await fetchItemDetail(parsed.data.saleItemId)
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
              ├─ <PurchaseDetailPanel item quantity>      ← Panel 1（首張，variant="first"）
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
      TWD {priceFmt.format(item.priceTwd)} x {quantity}
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
const subtotal = item.priceTwd * quantity      // = BE OrderLine.subtotalTwd
const shipping = 0                              // v0.1 hardcode；BE 也無 shippingFeeTwd 欄位（021 §1.4 out of scope）
const total = subtotal + shipping               // = BE Order.amountTwd
```

### 4.4 完整渲染 reference

```tsx
import { ConfirmPanel } from '@/components/ui/ConfirmPanel'
import { KeyValueList, KeyValueRow } from '@/components/ui/KeyValueList'

function PurchaseDetailPanel({ item, quantity, subtotal, shipping, total }: {
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
          <p className="flex-1 text-ink-AAA leading-5 line-clamp-2">{item.name}</p>
          <p className="text-ink-AA w-24 text-right shrink-0">
            TWD {priceFmt.format(item.priceTwd)} x {quantity}
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
│                                       │
│  ❗ 小提醒：送出前請再次確認您填寫的    │  ← v0.10 ReminderNote (IMG_4891)
│     姓名是否正確。若資料有誤將無法申報。│
└──────────────────────────────────────┘
```

### 6.1 Form state（v0.4 — 命名對齊 BE 022 §4.3 SaleItemPurchaseBody）

```ts
interface FormState {
  donorName: string         // 受控原始字串；上限 120（BE 022 §4.3）
  isAnonymous: boolean       // 預設 false（BE 022 三類訂單共用、optional default false）
}

const DEFAULT_FORM: FormState = { donorName: '', isAnonymous: false }

type Action =
  | { type: 'SET_DONOR_NAME'; value: string }
  | { type: 'SET_ANONYMOUS'; value: boolean }

function reducer(s: FormState, a: Action): FormState {
  switch (a.type) {
    case 'SET_DONOR_NAME': return { ...s, donorName: a.value }
    case 'SET_ANONYMOUS':  return { ...s, isAnonymous: a.value }
  }
}
```

> v0.4 `TOGGLE_ANONYMOUS` → `SET_ANONYMOUS(value)`：reducer 變純對等映射、不依賴前一個 state，更易測（不需呼叫兩次）；checkbox onChange callback 直接拿 `e.target.checked` 傳值。

### 6.2 Validation（v0.1：勾匿名後仍要填姓名；v0.4 加 120 字上限）

```ts
const isValid = form.donorName.trim().length > 0 && form.donorName.length <= 120
```

> 「勾匿名後是否該禁用 / 不必填姓名」屬 product 決定，[009 §6 開放問題](./009-checkout-confirm.md#6-開放問題跨-spec)。v0.1 一律要求姓名 — 收據與發票仍需身份。BE 022 §4.3 也要求 `donorName: { minLength: 1, maxLength: 120 }`，跟匿名無關。

### 6.3 `useReceiptInfoForm` hook（v0.2 — container 邏輯抽出）

對齊 [009a §5.6](./009a-donation-confirm.md) / [008b §3.6](./008b-donation-settings-sheet.md) 套路：

```ts
// src/app/checkout/purchase/useReceiptInfoForm.ts
'use client'
import { useReducer } from 'react'
import { toast } from 'sonner'
import type { ItemDetail } from '@/lib/schemas/detail'

export type UseReceiptInfoFormOpts = {
  query: PurchaseCheckoutQuery       // { saleItemId, quantity }
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
  const isValid =
    form.donorName.trim().length > 0 && form.donorName.length <= 120

  const subtotal = opts.item.priceTwd * opts.query.quantity
  const shipping = 0
  const total = subtotal + shipping

  const handleSubmit = async () => {    // v0.5 — async：要 await fetch
    if (!isValid) return
    const payload = buildPayload(opts.query, opts.item, form)
    // payload shape 對齊 BE 022 §4.3 SaleItemPurchaseBody，BFF 收到後 forward 給
    // POST /user/v1/donation/orders/sale-item-purchase
    try {
      const res = await fetch('/api/checkout/purchase', {
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
      toast.error('送出失敗，請稍後再試')
    }
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
        item={item} quantity={query.quantity}
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
import { ReminderNote, REMINDER_DONOR_NAME } from '@/components/ui/ReminderNote'
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
        maxLength={120}                        // 對齊 BE 022 §4.3 donorName 上限
        placeholder="請填寫姓名"
        value={form.donorName}
        onChange={(e) => dispatch({ type: 'SET_DONOR_NAME', value: e.target.value })}
        className="w-full h-12 rounded-lg border border-line bg-surface-card px-3 text-sm text-ink-AAA placeholder:text-ink-A focus:border-2 focus:border-ink-AAA focus:outline-none mb-4"
      />

      <label className="flex items-center gap-2 text-sm text-ink-AAA">
        <input
          type="checkbox"
          checked={form.isAnonymous}
          onChange={(e) => dispatch({ type: 'SET_ANONYMOUS', value: e.target.checked })}
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

      {/* v0.10 — 送出前再次確認姓名（參考 IMG_4891；與 donation flow 共用同一個 const） */}
      <ReminderNote className="mt-4">{REMINDER_DONOR_NAME}</ReminderNote>
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

### 7.1 Submit payload shape（v0.4 — 完全對齊 BE 022 §4.3 SaleItemPurchaseBody）

```ts
// payload shape = BE 022 §4.3 SaleItemPurchaseBody。
// BFF route handler 收到後 forward 給 POST /user/v1/donation/orders/sale-item-purchase。
type PurchaseConfirmPayload = {
  _endpoint: '/user/v1/donation/orders/sale-item-purchase'    // FE-side discriminator；BFF forward 前移除
  donorName: string                                      // 1-120
  isAnonymous: boolean                                    // v0.4 — top-level（對齊 BE 三類訂單共用）
  items: [
    {
      saleItemId: string                                  // uuid
      quantity: number                                    // 1-100
    },
  ]
  // 注意：不含 receiptOption（BE schema 不接受）/ donationFrequency / billingDay / charityId
}
```

```ts
function buildPayload(
  query: PurchaseCheckoutQuery,
  item: ItemDetail,
  form: FormState,
  _totals: { subtotal: number; shipping: number; total: number },  // 不送 BE，BE 自己 snapshot 算
): PurchaseConfirmPayload {
  return {
    _endpoint: '/user/v1/donation/orders/sale-item-purchase',
    donorName: form.donorName.trim(),
    isAnonymous: form.isAnonymous,
    items: [{ saleItemId: query.saleItemId, quantity: query.quantity }],
  }
}
```

> `_totals` 不在 payload 內：[BE 022 §4.3](../../../backend/docs/specs/022-donation-order-api.md) 內部行為說明 `amountTwd` 由 BE service 從 `SaleItem.priceTwd` 算+ snapshot 在 OrderLine.unitPriceTwd（防使用者改 client 金額繞 BE）；FE 算的 subtotal/total 只是 confirm 頁顯示用，不送 BE。

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
| R2 | SET_ANONYMOUS true → isAnonymous=true、其他欄位不變 | OK |
| R3 | SET_ANONYMOUS true → SET_ANONYMOUS false → isAnonymous=false | OK |

### 9.2 Hook integration tests（`useReceiptInfoForm.test.ts`，v0.2）

| # | 案例 | 期望 |
|---|---|---|
| H1 | 初始 isValid=false；subtotal = priceTwd × quantity；shipping=0；total=subtotal | OK |
| H2 | dispatch SET_DONOR_NAME "Alice" → isValid=true | OK |
| H3 | dispatch SET_ANONYMOUS true → state.isAnonymous=true、isValid 不變（v0.1 規則）| OK |
| H4 | dispatch SET_DONOR_NAME 121 字 → isValid=false（超過 BE 1-120） | OK |
| H5 | handleSubmit (isValid) → toast.success called + payload `_endpoint='/user/v1/donation/orders/sale-item-purchase'` + `donorName=trim` + `isAnonymous` + `items=[{saleItemId, quantity}]` | OK |
| H6 | handleSubmit (!isValid) → toast.success **not** called | OK |
| H7 | payload **不**含 `receiptOption` / `donationFrequency` / `billingDay` / `charityId`（BE 022 §4.3 不接受） | OK |

### 9.3 Component visual tests（`ReceiptInfoForm.test.tsx`，v0.2 — 變薄）

| # | 案例 | 期望 |
|---|---|---|
| 1 | 渲染 3 個 panel（購買明細 / disclaimer / 收據資訊）+ sticky CTA | OK |
| 2 | 總計顯示 `TWD priceTwd × quantity`（brand 紅字） | UI |
| 3 | 在姓名 input 打字 → submit button enabled 切換 | UI 整合 |
| 4 | 勾匿名 checkbox → checkbox state 視覺翻轉 | UI |
| 5 | 在姓名 input 按 Enter → form submit handler 觸發（如 valid） | form semantic |

### 9.3 Page-level（integration / e2e 可選）

- `/checkout/purchase?saleItemId=<valid>&quantity=2` → 200、總計 = `priceTwd × 2`
- 同上 quantity=0 → 404
- 同上 quantity=101（超過 BE max 100）→ 404
- saleItemId 不存在 → 404

---

## 10. 開放問題

- **「我要匿名捐款」ⓘ icon 點開內容**：Figma 4890 沒給。實作時可暫用 `aria-label` 充當、未來補真實 tooltip / popover
- **匿名 vs 姓名必填**：v0.1 強制要姓名（收據用途）；商業 / 法務角度可能允許「完全匿名 = 不出收據」。等 PM 確認。BE 022 §4.3 不論 isAnonymous=true/false 都要求 `donorName` non-empty（BE side 一律 echo 原樣、由 UI 端決定是否顯示「匿名捐款者」）
- **品項表的 SR semantic**：v0.1 用 `<div>` flex；未來考慮 table semantic 更標準
- **多商品 / 多品項**：v0.1 假設單一 sku；BE 022 §4.3 + spec 021 也限定 `items` length 必須剛好 1（未來 cart 多 line 列為 BE OQ #3），FE 對齊一致
- **`note` 欄位**：[BE 022 §4.3 TypeBox `note: Type.Optional(Type.Union([Type.Null(), Type.String({ maxLength: 500 })]))`](../../../backend/docs/specs/022-donation-order-api.md)；Figma 4890 無 textarea，FE form / BFF schema 都不開、不送。BE 接受 omit。**v0.9 audit 確認**：BFF `route.ts` Zod 也沒帶 `note`；若未來設計補 UI，只需在 FormState 加 `note: string` + buildPayload 帶值 + BFF `Body` schema 加 `note: z.string().max(500).optional()` 即可。

---

## 11. 變更紀錄

| 版本 | 日期 | 變更 |
|---|---|---|
| 0.1 | 2026-06-15 | 初版：對應 IMG_4890；三 panel 結構（明細 / disclaimer-only / 收據資訊）；reducer + 匿名 toggle + 6 個 component test |
| 0.2 | 2026-06-15 | **抽 `useReceiptInfoForm` custom hook**：對齊 [008b v0.4](./008b-donation-settings-sheet.md) container / presentational 分層；hook 包 useReducer + isValid + subtotal/total 算 + handleSubmit + toast。三層 test plan：reducer R1~R3 / hook H1~H5 / component 5 個視覺 |
| 0.3 | 2026-06-15 | **改用 [009c shared confirm UI](./009c-shared-confirm-ui.md) primitives**：整頁外殼換 `<ConfirmPageShell>`、明細 panel 換 `<ConfirmPanel>` + `<KeyValueList>`、disclaimer 換 `<DisclaimerBox>` + `DISCLAIMER_PLATFORM` const、姓名 label 換 `<RequiredLabel>`、sticky CTA 由 shell 內部接管。新增 §4.4 PurchaseDetailPanel + §6.4 ReceiptInfoFormPanel reference 完整 JSX；§7 由「sticky CTA spec」縮為「由 shell 接管」 |
| 0.4 | 2026-06-15 | **query / form / payload 全面對齊 [backend 022 §4.3](../../../backend/docs/specs/022-donation-order-api.md)**（Option C）：(a) §2 Zod query 用 BE 命名 `saleItemId` / `quantity`，quantity 上限 99 → 100（對齊 BE 1-100）；(b) §1 與 009a 比較表加 BE endpoint 行；(c) §4 渲染 reference + Panel 元件 prop 全用 `quantity`；(d) §6.1 FormState 命名不變，Action `TOGGLE_ANONYMOUS` → `SET_ANONYMOUS(value)`（純對等 reducer，更易測 + checkbox onChange 直接傳 `e.target.checked`）；(e) §6.2 isValid 加 120 字上限；(f) §6.4 input `maxLength={120}` 對齊 BE；(g) §7.1 payload shape 完全對齊 BE 022 §4.3（`_endpoint` discriminator + `items: [{ saleItemId, quantity }]` array 包裝 + `donorName` / `isAnonymous` top-level；**不含** receiptOption / donationFrequency / billingDay / charityId，BE schema 不接受）；(h) §9 test cases 升級 R1-3 / H1-7 / page 4 個；(i) §10 OQ 補 BE 一致的「donorName 強制 non-empty」與 `note` 欄位差 |
| 0.5 | 2026-06-15 | **handleSubmit 改 fetch BFF**：替換 v0.4 的 `console.log + toast.success` 為 `await fetch('/api/checkout/purchase', { method: 'POST', body: payload })`；2xx → toast.success；非 2xx 或 throw → `toast.error('送出失敗，請稍後再試')`。`useReceiptInfoForm` 變 async。Test 升級：H5 改驗 fetch 被呼叫 + body 形狀；新增 H8 (BFF 5xx)、H9 (network throw) 兩個錯誤路徑；component test 6 同樣驗 fetch call。對應 [spec 009 §5 BFF route](./009-checkout-confirm.md#5-bff-route-handlerv04-新)（`/api/checkout/purchase`）與 [spec 022 §4.3](../../../backend/docs/specs/022-donation-order-api.md)。本期不打 mock-confirm-payment |
| 0.6 | 2026-06-15 | **送出成功 → 導回 sale-item detail page**：useReceiptInfoForm 加 `useRouter()`；handleSubmit 成功路徑加 `router.replace(/sale-items/${query.saleItemId})`。用 replace 不用 push（理由同 009a v0.6：confirm 頁不該留 history）。失敗不導頁。Test 升級：H5 加 `routerReplaceMock` 斷言；H8 / H9 加「失敗不導頁」反向斷言 |
| 0.7 | 2026-06-15 | **URL query → in-memory draft store**：見 [009 §2 / §2.1](./009-checkout-confirm.md#2-routingv05--bare-path--in-memory-draft-store) 完整改寫說明。本 spec 對應更新：(a) `PurchaseCheckoutQuery` 型別移除；(b) `buildPayload` / `useReceiptInfoForm` opts 從 `{query, item}` 收成 `{draft: PurchaseDraft}`（draft 含 quantity + 完整 ItemDetail）；(c) `PurchaseConfirmPage` props 從 `{query, item}` 收成 `{draft}`；(d) page.tsx 變 RSC shell + `PurchaseConfirmPageEntry`（client）peek `purchase/draft-store.ts`，空 → `router.replace('/donation')`；(e) CtaIsland purchase 變數 `item: ItemDetail`（不再 `PurchaseItem` narrow），sheet 寫 draft 時整包 ItemDetail 帶進去；(f) submit 成功 `clearPurchaseDraft()` 再 `router.replace(/sale-items/${draft.item.id})`；(g) tests 同步重寫餵 `{ draft }` |
| 0.8 | 2026-06-16 | **`_endpoint` cutover 到 `/user/v1/donation/orders/sale-item-purchase`**（對齊 [backend spec 023 §2.4](../../../backend/docs/specs/023-api-routing-versioning.md)）：§1 比較表 BE endpoint 行、§5.2 hook 範例 `_endpoint` 字面值與註解、§7.1 payload `PurchaseConfirmPayload._endpoint` literal + buildPayload 範例、§9.2 H5 test 斷言全部從 `/v1/donation/orders/sale-item-purchase` 改 `/user/v1/donation/orders/sale-item-purchase`。BE 022 §4.3 body shape 本身無變動。 |
| 0.9 | 2026-06-16 | **BE 022 contract audit fixes**（隨 [spec 009 v0.8](./009-checkout-confirm.md)）：本 spec 對應更新 §10 OQ「`note` 欄位」改寫為較完整的「BE 接受但 UI 未開」說明 + 補上 BFF schema 也未帶 note 的事實 + 未來補 UI 的 3-點 checklist。本 spec 描述的 form state / payload / response 行為皆無變動（變動都在 BFF route + mock + 加入 3 個 BFF test），故 §6 / §7 / §9 文案不需改。 |
| 0.10 | 2026-06-16 | **Panel 3 底部加 `<ReminderNote>`**（參考 IMG_4891；跨 009a / 009b 一致改動）：§6 ASCII layout 加 2 行小提醒；§6.4 `<ReceiptInfoFormPanel>` reference JSX 加 `ReminderNote` import 與元素（匿名 checkbox 下方、`mt-4`）。文案 const `REMINDER_DONOR_NAME` 與 donation flow 共用（單一 source of truth）；圖中原文「姓名與身分證字號」收斂為僅「姓名」對齊本頁可編輯欄位（身分證字號來自 JKOS 帳戶 KYC，本頁不蒐集）。Primitive 新增於 [009c v0.2 §2.7](./009c-shared-confirm-ui.md#27-remindernote--卡內-inline-提醒v02-新增)。Form state / payload / submit 行為無變動 |
