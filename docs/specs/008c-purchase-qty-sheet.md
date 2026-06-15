# Spec 008c：`<PurchaseQtySheet>` 購買數量 sheet

- **狀態**：Draft（v0.5 — 命名 / payload 全面對齊 backend spec 021 / 022；MAX_QTY 改 100）
- **路徑（規劃）**：
  - `src/app/checkout/usePurchaseQtyForm.ts` + `.test.ts`（v0.4 — pure logic hook）
  - `src/app/checkout/PurchaseQtySheet.tsx` + `.test.tsx`（v0.4 起為純 UI）
  - `src/components/ui/QtyStepper.tsx` + `.test.tsx`（從本 sheet 抽出的通用 UI primitive）
- **依賴**：
  - [008a BottomSheet](./008a-bottom-sheet.md) — UI primitive
  - 既有 design system tokens（[003a](./003a-design-system.md)）
  - `Item` schema（[002 §3.2](./002-list-data.md)）—— sheet 接收完整 item 物件以算總計
  - **Backend body shape**（[backend 022 §4.3 sale-item-purchase](../../../backend/docs/specs/022-donation-order-api.md)）：FE 命名 / payload 直接沿用 `saleItemId` / `quantity` / `donorName` / `isAnonymous`，避免 BFF mapping
- **使用方**：
  - [008 §4.3](./008-donation-checkout-sheets.md) sale-item detail（CTA「立即捐款」）
- **Figma 對應**：IMG_4887

---

## 1. 職責

讓使用者選擇購買**數量**、即時算 subtotal / shipping / total，按「下一步」`console.log` payload + 關閉 sheet。

> **範圍邊界**：依 brief.md「捐款流程 CTA 只刻 UI 不接金流」，「下一步」不導向、不打 API。物流費 hardcode 0（接物流前無法估算）。

---

## 2. 內容區塊

```
[ BottomSheet title="購買數量" ]

商品選項
┌─────────────────────────────────────────────────┐
│ 陸仕私廚 藤椒牛肉麵    [-] 1 [+]    TWD 449     │
│ 760g 袋 (冷凍)                                   │
│ TWD 449  ← unit price subtext                    │
└─────────────────────────────────────────────────┘

(可向下滾動空間，本作業多商品變體 out of scope)

────────────────────────────────  ← divider
運費                          TWD 0
總計                       TWD 449   ← brand 紅字、加重

[             下一步             ]   ← 紅色 enabled (qty >= 1 預設成立)
```

---

## 3. State model

### 3.1 Type

```ts
interface FormState {
  quantity: number         // 預設 1，min 1，max 100（對齊 BE 022 §4.3 items[].quantity）
}

const DEFAULT_FORM: FormState = { quantity: 1 }
const MIN_QTY = 1
const MAX_QUANTITY = 100   // v0.5 — 對齊 BE 022 §4.3 SaleItemPurchaseBody items[].quantity
```

> 命名沿用 BE 022 § 4.3 `items[].quantity`（不縮寫 `qty`），讓 BFF 收到 form payload 後可直接 mapping 成 `{ items: [{ saleItemId, quantity }] }` 送 BE。

### 3.2 Algorithm

```ts
const subtotal = item.priceTwd * form.quantity
const shipping = 0           // v0.1 hardcode；未來接物流 API
const total = subtotal + shipping     // = BE Order.amountTwd（sum of lines[].subtotalTwd）
```

### 3.3 Form reset on open

跟 [008b §3.4](./008b-donation-settings-sheet.md) 同套路：caller 始終把 sheet 渲染在樹中（不用 `{open && ...}` 不用 `key`，否則破壞 [008a §4 isExiting](./008a-bottom-sheet.md#4-動畫機制isexiting-pattern)），sheet 內部用 useEffect-on-open 重置。

> v0.4：useState + useEffect 都搬進 [§3.4 usePurchaseQtyForm hook](#34-usepurchaseqtyform-hookv04--container-邏輯抽出)。

### 3.4 `usePurchaseQtyForm` hook（v0.4 — container 邏輯抽出）

對齊 [008b §3.6](./008b-donation-settings-sheet.md) 的 container / presentational 分層：

```ts
// src/app/checkout/usePurchaseQtyForm.ts
'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import type { Item } from '@/lib/schemas/list'

export type UsePurchaseQtyFormOpts = {
  open: boolean
  item: Item                       // sheet 接 Item 整包；hook 只用 id / priceTwd
  onClose: () => void
}

export type UsePurchaseQtyFormReturn = {
  quantity: number                 // v0.5 — 對齊 BE 022 § 4.3 items[].quantity
  setQuantity: (n: number) => void
  subtotal: number
  shipping: number                 // hardcoded 0 in v0.1
  total: number                    // = BE Order.amountTwd
  handleSubmit: () => void
}

const DEFAULT_QUANTITY = 1
const MAX_QUANTITY = 100           // v0.5 — 對齊 BE 022 § 4.3 quantity: 1~100

export function usePurchaseQtyForm(
  opts: UsePurchaseQtyFormOpts,
): UsePurchaseQtyFormReturn {
  const router = useRouter()
  const [quantity, setQuantity] = useState(DEFAULT_QUANTITY)

  useEffect(() => {
    if (opts.open) setQuantity(DEFAULT_QUANTITY)
  }, [opts.open])

  const subtotal = opts.item.priceTwd * quantity
  const shipping = 0
  const total = subtotal + shipping

  const handleSubmit = () => {
    const params = new URLSearchParams({
      saleItemId: opts.item.id,                // v0.5 — 命名對齊 BE 022 § 4.3
      quantity: String(quantity),
    })
    router.push(`/checkout/purchase?${params.toString()}`)
    opts.onClose()
  }

  return { quantity, setQuantity, subtotal, shipping, total, handleSubmit }
}
```

**Component 變成純 UI 層**：

```tsx
// src/app/checkout/PurchaseQtySheet.tsx
'use client'
import { BottomSheet } from '@/components/ui/BottomSheet'
import { QtyStepper } from '@/components/ui/QtyStepper'
import { usePurchaseQtyForm } from './usePurchaseQtyForm'

export function PurchaseQtySheet({ open, onClose, item }: Props) {
  const { quantity, setQuantity, subtotal, shipping, total, handleSubmit } =
    usePurchaseQtyForm({ open, item, onClose })
  return (
    <BottomSheet open={open} title="購買數量" onClose={onClose}>
      <form onSubmit={(e) => { e.preventDefault(); handleSubmit() }} noValidate>
        {/* item row + QtyStepper(value=quantity, onChange=setQuantity, max=100) + 運費/總計 + submit */}
      </form>
    </BottomSheet>
  )
}
```

---

## 4. 視覺規格（對齊 IMG_4887）

### 4.1 Item row

```tsx
<div className="flex items-start gap-4 py-4">
  {/* 左：商品名 + unit price subtext */}
  <div className="flex-1 min-w-0">
    <p className="text-sm text-ink-AAA leading-5 line-clamp-2">{item.name}</p>
    <p className="text-xs text-ink-A leading-5 mt-1">
      TWD {priceFmt.format(item.priceTwd)}
    </p>
  </div>
  {/* 中：QtyStepper */}
  <QtyStepper value={quantity} onChange={setQuantity} min={1} max={MAX_QUANTITY} />
  {/* 右：subtotal */}
  <p className="text-sm text-ink-AAA font-medium w-20 text-right shrink-0">
    TWD {priceFmt.format(subtotal)}
  </p>
</div>
```

`priceFmt = new Intl.NumberFormat('zh-TW')`（千分位）。

### 4.2 `<QtyStepper>` 通用 UI primitive

```tsx
// src/components/ui/QtyStepper.tsx
type QtyStepperProps = {
  value: number
  onChange: (next: number) => void
  min?: number      // 預設 1
  max?: number      // 預設 100（對齊 BE 022 § 4.3 quantity 上限）
}

export function QtyStepper({ value, onChange, min = 1, max = 100 }: QtyStepperProps) {
  return (
    <div className="flex items-center gap-3">
      <button
        type="button"
        onClick={() => onChange(Math.max(min, value - 1))}
        disabled={value <= min}
        aria-label="減少數量"
        className="w-7 h-7 rounded-full border border-line flex items-center justify-center
                   text-ink-AAA disabled:text-ink-A disabled:border-line/50
                   focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand"
      >
        <MinusIcon />  {/* lucide minus 14×14 */}
      </button>
      <span className="text-sm text-ink-AAA tabular-nums min-w-[1.5em] text-center">
        {value}
      </span>
      <button
        type="button"
        onClick={() => onChange(Math.min(max, value + 1))}
        disabled={value >= max}
        aria-label="增加數量"
        className="w-7 h-7 rounded-full border border-line flex items-center justify-center
                   text-ink-AAA disabled:text-ink-A disabled:border-line/50
                   focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand"
      >
        <PlusIcon />
      </button>
    </div>
  )
}
```

> 抽到 `src/components/ui/QtyStepper.tsx`（未來購物車 / 其他結帳場景可重用）。本 spec v0.1 含此元件的 unit test 規格。

### 4.3 整體 `<form>` semantic + Footer totals + CTA（v0.2）

整個 sheet body 用 `<form onSubmit>` 包起來，「下一步」`type="submit"`。對齊 [008b §4.5](./008b-donation-settings-sheet.md#45-整體-form-semantic--sticky-footerv02--submit-on-enter)：

```tsx
<form
  onSubmit={(e) => {
    e.preventDefault()
    console.log('[checkout/purchase]', buildPayload(item, form))
    onClose()
  }}
>
  {/* item row + QtyStepper */}
  <div className="border-t border-line">
    <dl className="px-5 py-3 space-y-1 text-sm">
      <div className="flex justify-between">
        <dt className="text-ink-AA">運費</dt>
        <dd className="text-ink-AAA">TWD {priceFmt.format(shipping)}</dd>
      </div>
      <div className="flex justify-between items-baseline">
        <dt className="text-ink-AAA">總計</dt>
        <dd className="text-brand text-lg font-bold">
          TWD {priceFmt.format(total)}
        </dd>
      </div>
    </dl>
    <div className="px-5 pb-4 pt-1">
      <button
        type="submit"                                      // v0.2 — 不再 type="button"
        className="w-full h-12 rounded-full bg-brand text-white text-base font-semibold
                   focus-visible:outline focus-visible:outline-2
                   focus-visible:outline-offset-2 focus-visible:outline-brand"
      >
        下一步
      </button>
    </div>
  </div>
</form>
```

> 注意 4887「下一步」永遠 **enabled 紅底**（不像 [008b 4885](./008b-donation-settings-sheet.md) 初始 disabled 灰底），因為 qty=1 預設就成立——所以 form 也沒 disabled gate；submit 隨時可觸發。

---

## 5. 驗證 / 「下一步」

### 5.1 enabled 條件

- quantity 永遠 `>= 1`（stepper `-` 在 quantity=1 時自動 disable，physical 上不會降到 0）
- quantity 永遠 `<= MAX_QUANTITY = 100`（stepper `+` 在 quantity=100 時自動 disable；對齊 BE 022 §4.3）
- **「下一步」永遠 enabled**

### 5.2 Submit payload（v0.5 — 對齊 BE 022 §4.3）

```ts
// FE sheet payload = BE items[] 第一筆 + UI 顯示用的 subtotal/shipping/total
// 缺 donorName / isAnonymous / note（在 [009b confirm 頁](./009b-purchase-confirm.md) 補；本 sheet 只收 sale-item + 數量）
type PurchaseQtyPayload = {
  saleItemId: string                  // v0.5 — 命名對齊 BE Order Line.saleItemId
  quantity: number                     // v0.5 — 命名對齊 BE 022 §4.3 items[].quantity
  subtotal: number                     // priceTwd * quantity（= BE OrderLine.subtotalTwd）
  shipping: number                     // 固定 0（本期 BE 也無 shippingFeeTwd 欄位）
  total: number                        // subtotal + shipping（= BE Order.amountTwd）
}

function buildPayload(item: Item, form: FormState): PurchaseQtyPayload {
  const subtotal = item.priceTwd * form.quantity
  const shipping = 0
  return {
    saleItemId: item.id,
    quantity: form.quantity,
    subtotal,
    shipping,
    total: subtotal + shipping,
  }
}

// handleSubmit (v0.5 — query params 命名對齊 BE):
const params = new URLSearchParams({
  saleItemId: item.id,
  quantity: String(form.quantity),
})
router.push(`/checkout/purchase?${params.toString()}`)
onClose()
```

跳轉到 [009b `/checkout/purchase` 確認頁](./009b-purchase-confirm.md)。Confirm 頁 RSC 用 Zod 重新驗證 query params（防 URL 亂改），fail → 404。

> v0.1~0.2 用 `console.log` 是因為 confirm 頁還沒存在。v0.3 接上 009b 後 UI 流程完整。

---

## 6. a11y

- QtyStepper 的 `-` / `+` 都是 `<button>` + `aria-label="減少數量" / "增加數量"`、disabled 邊界正確
- quantity display 用 `<span>`（不是 input）— 純展示、避免使用者直接編輯造成複雜驗證；想直接輸入大量數字的使用者本作業忽略
- 總計 dl/dt/dd 結構 — 一般 dl semantic 不會被多數 SR 讀很順，但語意正確

> 其餘 modal 級 a11y（focus trap / scroll lock / esc / role=dialog）由 [008a §6](./008a-bottom-sheet.md#6-a11y--鍵盤) 提供，本元件不重複。

---

## 7. 測試

### 7.1 `QtyStepper.test.tsx`（UI primitive，colocated）

| # | 案例 | 期望 |
|---|---|---|
| 1 | 預設 min=1 max=100 | OK |
| 2 | value=1、`-` disabled / `+` enabled | OK |
| 3 | value=50、兩鈕都 enabled、點 `-` → onChange(49)、`+` → onChange(51) | OK |
| 4 | value=100、`+` disabled | OK |
| 5 | min=3 value=3 → `-` disabled | 自訂 min OK |
| 6 | aria-label「減少 / 增加數量」存在 | OK |

### 7.2 Hook integration tests（`usePurchaseQtyForm.test.ts`，v0.4）

| # | 案例 | 期望 |
|---|---|---|
| H1 | 初始 quantity=1、subtotal = item.priceTwd、shipping=0、total=subtotal | OK |
| H2 | setQuantity(4) → quantity=4、subtotal/total 重算 | OK |
| H3 | handleSubmit → routerPush called with URL `'/checkout/purchase?saleItemId=...&quantity=...'` + onClose called | mock router |
| H4 | opts.open false → true rerender → quantity 重置（先 setQuantity(5)） | useEffect-on-open |

### 7.3 `PurchaseQtySheet.test.tsx`（v0.4 — 變薄）

| # | 案例 | 期望 |
|---|---|---|
| 1 | 渲染 item name + QtyStepper + 運費 / 總計 + submit | OK |
| 2 | 點 `+` 三次 → quantity 顯示 4、總計顯示 `priceTwd * 4` | UI 整合 |
| 3 | quantity=1 時 stepper `-` disabled；quantity=100 時 `+` disabled | UI gate（QtyStepper 自負，本檔覆蓋 sheet 整合） |
| 4 | 對 form element 觸發 `submit` 事件 → handleSubmit 觸發 | `<form>` onSubmit fire |

---

## 8. 開放問題

- **多商品變體 / 規格**：4887 只有單一商品 + qty stepper。真實 SKU 可能有「規格 / 顏色 / 大小」選擇，sheet 變高、需滾動。v0.1 假設單一變體
- **運費 API**：v0.1 hardcode 0；接物流後需 API 算（依地址 / 重量）。本 spec 不涵蓋
- **MAX_QUANTITY 上限選擇**：v0.5 改 100 對齊 [BE 022 §4.3](../../../backend/docs/specs/022-donation-order-api.md)；未來 cart 多 line 時 BE OQ #3 提到要重評
- **quantity 直接編輯（input）**：v0.1 用純展示 `<span>`，使用者只能 ± 鍵點到大數字。若未來實作 input 編輯，要處理 paste / non-numeric / parse / clamp 等
- **庫存上限**：MAX_QUANTITY 還要 cap 在「該商品剩餘庫存」；本作業 BE 015 spec 也未含 stock 欄位 → 純 hardcode 100

---

## 9. 變更紀錄

| 版本 | 日期 | 變更 |
|---|---|---|
| 0.1 | 2026-06-15 | 從 [spec 008 v0.3](./008-donation-checkout-sheets.md) §3.3 抽出獨立 spec；正式把 `QtyStepper` 列為 UI primitive、補 6 個 QtyStepper unit test case |
| 0.2 | 2026-06-15 | sheet body 包 `<form onSubmit>`、「下一步」改 `type="submit"`：對齊 [008b v0.2](./008b-donation-settings-sheet.md)、未來若 sheet 內加 input（例如備註欄）Enter 鍵自動觸發 submit；補 test #6 「form submit event → 同點下一步」 |
| 0.3 | 2026-06-15 | submit handler 從 `console.log` 改為 `router.push('/checkout/purchase?...')`，串接 [009b confirm 頁](./009b-purchase-confirm.md) |
| 0.4 | 2026-06-15 | **抽 `usePurchaseQtyForm` custom hook**：對齊 [008b v0.4](./008b-donation-settings-sheet.md) container / presentational 分層；component 變純 UI、hook 包 useState + useEffect reset + 算 subtotal/total + handleSubmit + router.push。新增 4 個 hook H1~H4 integration test、component test 縮減為 4 個視覺整合 |
| 0.5 | 2026-06-15 | **命名 / payload 全面對齊 backend spec 022**（Option C）：(a) `qty` → `quantity`（對齊 BE 022 §4.3 `items[].quantity`）；(b) `itemId` → `saleItemId`（對齊 BE OrderLine.saleItemId）；(c) `MAX_QTY = 99` → `MAX_QUANTITY = 100`（對齊 BE 022 §4.3 quantity 上限）+ QtyStepper default max；(d) hook return field `qty / setQty` → `quantity / setQuantity`；(e) router.push query params 用 BE 命名 `?saleItemId=...&quantity=...`；(f) PurchaseQtyPayload field 命名跟著對齊；(g) 測試案例描述同步更新 |
