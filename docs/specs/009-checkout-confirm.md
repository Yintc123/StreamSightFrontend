# Spec 009：結帳確認頁（捐款 / 購買，index）

- **狀態**：Draft（v0.2 — 抽 [009c shared confirm UI](./009c-shared-confirm-ui.md) primitives，移除 §3 inline className）
- **建立日期**：2026-06-15
- **Figma 對應**：IMG_4888（charity 直捐確認）/ IMG_4889（donation 確認）/ IMG_4890（item 購買確認）

> **範圍邊界**：依 brief.md「捐款流程只刻 UI 不接金流」，spec 009 系列只到「填好資料的確認 / 送出」這一頁，**不**涵蓋之後的付款 / 結果頁。送出按鈕 `console.log` 完整 payload + 顯示 toast 作為 placeholder。

---

## 1. 為什麼拆 spec

對齊 [008](./008-donation-checkout-sheets.md) cards 系列拆 spec 慣例：UI primitive vs business logic / 跨類型共用 vs 類型特定差異。三份子 spec：

| Spec | 內容 |
|---|---|
| **009（本檔，index）** | routing、payload contract、page-level 共同決策、008b/c 串接點 |
| [**009a DonationConfirm**](./009a-donation-confirm.md) | charity 直接捐款 + donation 專案捐款共用（4888 / 4889）：捐款明細 panel + 捐款人基本資料 panel（含 receipt type / 姓名）|
| [**009b PurchaseConfirm**](./009b-purchase-confirm.md) | item 義賣商品購買（4890）：購買明細 panel + 捐款人資料 disclaimer panel + 收據資訊 panel（含姓名 / 匿名 checkbox）|
| [**009c SharedConfirmUI**](./009c-shared-confirm-ui.md) | UI primitives：`<ConfirmPageShell>` / `<ConfirmPanel>` / `<KeyValueList>` / `<DisclaimerBox>` / `<RequiredLabel>` / `<StickyConfirmCta>`。009a / 009b 共用 |

v0.2 抽 009c：009a / 009b 排版高度相同（紅 hero + 白 panel + dl + disclaimer + sticky CTA），把這些固化成 ui primitive、business form 內容 caller 自接。對齊 008a BottomSheet「UI primitive vs business form 分 spec」慣例。

---

## 2. Routing

新增 2 條 client route，**都是 RSC**：

| Path | 子 spec | Query params |
|---|---|---|
| `/checkout/donation` | [009a](./009a-donation-confirm.md) | `targetType` (charity\|donation) / `targetId` (uuid) / `donationType` (monthly\|oneTime) / `chargeDay` (6\|16\|26, 只在 monthly) / `amount` (positive int) |
| `/checkout/purchase` | [009b](./009b-purchase-confirm.md) | `itemId` (uuid) / `qty` (1–99 int) |

**Payload 為何走 URL query 而非 sessionStorage / context**：

- ✅ refresh-safe（重新整理 / 直接打 URL 都能還原狀態）
- ✅ 分享 / debug 友善（可貼整條 URL 給同事看）
- ✅ Next.js RSC `searchParams` 是原生 API
- ⚠️ URL 露出 amount 等資訊 — demo 階段不敏感；真實金流 production 通常改 draft id pattern（backend 建 draft、URL 只帶 draft id）

**Server 端 validation**：

兩條 route 在 RSC 解析 `searchParams` 時用 Zod 驗證；任一欄位不合規 → `notFound()` 顯示 Next 404（避免使用者亂貼 URL 進 broken state）。

```ts
// 009a 用：
const DonationCheckoutQuery = z.object({
  targetType: z.enum(['charity', 'donation']),
  targetId: z.string().uuid(),
  donationType: z.enum(['monthly', 'oneTime']),
  chargeDay: z.coerce.number().int().refine((n): n is 6 | 16 | 26 => [6,16,26].includes(n)).optional(),
  amount: z.coerce.number().int().min(1),
}).refine(
  (q) => q.donationType === 'oneTime' || q.chargeDay !== undefined,
  { message: 'chargeDay required when donationType=monthly' },
)

// 009b 用：
const PurchaseCheckoutQuery = z.object({
  itemId: z.string().uuid(),
  qty: z.coerce.number().int().min(1).max(99),
})
```

---

## 3. 共通 Page Anatomy

兩條 confirm 頁的外殼一致（TopNav + 紅底 + 多張白色 panel）：

```
┌─ TopNav: ← 確認捐款資訊                       ┐  紅底，無 share icon
├─ 紅底延伸                                       │
│  ┌─────────────────────────────────────┐      │  ← Panel 1（圓角）
│  │ <Panel 1 內容>                       │      │
│  └─────────────────────────────────────┘      │
│  ┌─────────────────────────────────────┐      │  ← Panel 2
│  │ <Panel 2 內容>                       │      │
│  └─────────────────────────────────────┘      │
│  ┌─────────────────────────────────────┐      │  ← Panel 3（只 009b 有）
│  │ <Panel 3 內容>                       │      │
│  └─────────────────────────────────────┘      │
├─ Sticky bottom CTA「確認 / 送出」（紅色 pill） │
└────────────────────────────────────────────────┘
```

`<TopNav title="確認捐款資訊" fallback="/" />`：

- 三條 confirm 頁的標題都一樣（即使是 purchase 也用「確認捐款資訊」字串、跟 Figma 4890 一致）
- 沒接 share icon
- TopNav 預設用 [005 §4 useSmartBack](./005-homepage-auth.md#4-smart-back-navigation-v02-新增)，refresh / 直接訪問 URL → `/`；站內走過來 → router.back() 回詳情頁

### 3.0 整頁外殼 — `<ConfirmPageShell>`（v0.2 新）

TopNav + 紅 hero + `<form>` + sticky CTA 整套外殼實作於 [`<ConfirmPageShell>`](./009c-shared-confirm-ui.md#21-confirmpageshell--整頁外殼)。caller 只需把多個 `<ConfirmPanel>` 當 children 傳入：

```tsx
<ConfirmPageShell
  title="確認捐款資訊"
  ctaLabel="確認送出"
  isValid={isValid}
  onSubmit={handleSubmit}
>
  <ConfirmPanel title="捐款明細" variant="first">...</ConfirmPanel>
  <ConfirmPanel title="捐款人基本資料">...</ConfirmPanel>
</ConfirmPageShell>
```

### 3.1 共用 Panel 樣式

實作於 [`<ConfirmPanel>`](./009c-shared-confirm-ui.md#22-confirmpanel--白色卡片)。第一張 panel 傳 `variant="first"` 套 `-mt-6` 蓋住紅 hero 底（同 detail 頁 pattern）。

### 3.2 Key-Value row 樣式（009a 捐款明細 + 009b 購買明細的明細行）

實作於 [`<KeyValueList>` + `<KeyValueRow>`](./009c-shared-confirm-ui.md#23-keyvaluelist--dl-排版)。金額類 row 傳 `variant="emphasized"` 套 brand 紅字加粗（4888 / 4890 都是紅字）。

### 3.3 Required field marker

實作於 [`<RequiredLabel>`](./009c-shared-confirm-ui.md#25-requiredlabel--必填欄位-label)。內含紅星 + sr-only「必填」雙重 a11y 標記。

### 3.4 Sticky bottom CTA

實作於 [`<StickyConfirmCta>`](./009c-shared-confirm-ui.md#26-stickyconfirmcta--sticky-底部送出按鈕)，由 [`<ConfirmPageShell>`](./009c-shared-confirm-ui.md#21-confirmpageshell--整頁外殼) 內部渲染、caller 不需手動掛。`type="submit"` 隨 form 觸發。

> CTA 文字「確認送出」是 spec 沿用既有 detail 頁紅色 pill 風格；Figma 沒明示這頁的 CTA 文字（截圖只到中間），這是 spec 級的合理推斷。

### 3.5 Disclaimer 字串

實作於 [`<DisclaimerBox>`](./009c-shared-confirm-ui.md#24-disclaimerbox--灰底注意事項框)；預設文案 `DISCLAIMER_PLATFORM` 從同檔 export。caller `<DisclaimerBox>{DISCLAIMER_PLATFORM}</DisclaimerBox>`。

---

## 4. 共同決策（跨 spec 一次說清楚）

| 決策 | 載於 | 在這裡複述的理由 |
|---|---|---|
| **RSC 解析 searchParams 並 fetch target / item by id** — 跟 [004 detail RSC 同套路](./004-detail-pages.md) | [009a §3](./009a-donation-confirm.md) / [009b §3](./009b-purchase-confirm.md) | 邏輯一致、reuse 既有 fetcher（fetchCharityDetail / fetchDonationDetail / fetchItemDetail）|
| **Form state 用 useReducer + raw/parsed 拆兩欄**（對齊 [008b v0.2](./008b-donation-settings-sheet.md)）| 009a / 009b | 兩頁都有 controlled input（姓名、收據抬頭等）需要避免 ghost-reset |
| **整 form 用 `<form onSubmit>` + button `type="submit"`**（對齊 [008b §4.5](./008b-donation-settings-sheet.md)）| 009a / 009b | Enter / iOS Done 鍵自動 submit、SR friendly |
| **「下次扣款日期」client-side 計算**（v0.1）| 009a | demo 容忍 client / server 時區誤差；prod 應 server 算 |
| **送出 = `console.log(payload) + toast.success`** | 009a / 009b | brief.md 不接金流；未來 → `router.push('/checkout/payment/...')` |
| **smart back fallback `/`** | 三頁 TopNav 都用 default | direct URL / refresh 後返回鈕回首頁 |

---

## 5. 008b/008c 「下一步」要修改的點

這次新增 009 後，[008b §5.2](./008b-donation-settings-sheet.md) 的 submit handler、[008c §5.2](./008c-purchase-qty-sheet.md) 的 submit handler 從 `console.log + onClose()` 改為 `router.push(...) + onClose()`：

```ts
// 008b — DonationSettingsSheet
const handleSubmit = () => {
  const payload = buildPayload(form, target)  // { target, donationType, chargeDay, amount }
  const params = new URLSearchParams({
    targetType: payload.target.type,
    targetId: payload.target.id,
    donationType: payload.donationType,
    ...(payload.chargeDay !== null && { chargeDay: String(payload.chargeDay) }),
    amount: String(payload.amount),
  })
  router.push(`/checkout/donation?${params.toString()}`)
  onClose()
}

// 008c — PurchaseQtySheet
const handleSubmit = () => {
  const params = new URLSearchParams({
    itemId: item.id,
    qty: String(form.qty),
  })
  router.push(`/checkout/purchase?${params.toString()}`)
  onClose()
}
```

> v0.1 spec 009 暫沒寫 e2e；接 008b/c 後手動測「sheet → 下一步 → confirm 頁 → 各欄位顯示正確」走通即可。

---

## 6. 開放問題（跨 spec）

- **送出後的下一步**：v0.1 `console.log + toast`。未來接金流 → 信用卡 / Apple Pay / Line Pay 選擇頁；或拉到第三方 redirect（藍新 / 綠界）。三條路線都會改寫 §5 submit handler
- **「都不需要」/「個人」/「公司」等收據選項實際清單**：Figma 4888 只顯示「都不需要」default option，沒展開 dropdown。需要設計 / PM 確認完整選項才知道個人 / 公司是否要展開額外欄位（統編 / 抬頭）
- **匿名捐款的後續影響**：4890「☐ 我要匿名捐款」勾選後是否該禁用姓名欄？或保留姓名但 backend 不公開？預設 v0.1 假設「勾匿名 → 姓名仍可填但不必填」
- **電話 / email / 地址欄位**：截圖未拉到底，無法確認下方還有什麼欄位。實作時若 Figma 還有，補進 form schema
- **draft id pattern**：URL query 暴露 amount。未來 production 接金流時改 backend 建 draft → URL 帶 draft id；前端 v0.1 不做

---

## 7. 變更紀錄

| 版本 | 日期 | 變更 |
|---|---|---|
| 0.1 | 2026-06-15 | 初版：IMG_4888-4890 規劃為「結帳確認頁」family；拆 index + 009a + 009b；定義 routing / Zod query schema / payload contract；shared panel anatomy；列出 008b/c 需配套修改的 submit handler |
| 0.2 | 2026-06-15 | **抽 [009c shared confirm UI](./009c-shared-confirm-ui.md) primitives**：`<ConfirmPageShell>` / `<ConfirmPanel>` / `<KeyValueList>` / `<DisclaimerBox>` / `<RequiredLabel>` / `<StickyConfirmCta>` 六件；§3 共通 anatomy 從 inline className 改為 primitive reference；新增 §3.0「整頁外殼」與 §3.5「Disclaimer 字串」兩節。對齊 008a BottomSheet「UI primitive vs business form 分 spec」慣例 |
