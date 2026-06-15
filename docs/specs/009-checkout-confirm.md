# Spec 009：結帳確認頁（捐款 / 購買，index）

- **狀態**：Draft（v0.4 — 「確認送出」實際 POST 到 BFF → BE 建單；不再 console.log placeholder）
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

新增 2 條 client route，**都是 RSC**。URL query 命名一律對齊 [backend 022 §4 body shape](../../../backend/docs/specs/022-donation-order-api.md)：

| Path | 子 spec | Query params | 對應 BE endpoint |
|---|---|---|---|
| `/checkout/donation` | [009a](./009a-donation-confirm.md) | `targetType` (`CHARITY`\|`DONATION_PROJECT`) / `targetId` (uuid) / `donationFrequency` (`ONE_TIME`\|`RECURRING`) / `billingDay` (`DAY_6`\|`DAY_16`\|`DAY_26`，只在 RECURRING) / `amountTwd` (int 1〜1_000_000) | `POST /v1/donation/orders/charity-donation` 或 `/project-donation`（依 targetType 分流，由 BFF 路由） |
| `/checkout/purchase` | [009b](./009b-purchase-confirm.md) | `saleItemId` (uuid) / `quantity` (1〜100 int) | `POST /v1/donation/orders/sale-item-purchase` |

**為何 FE path 2 條對應 BE 3 條 endpoint**：

charity-donation 與 project-donation 兩條 BE endpoint 的 UI 是同一頁（IMG_4888 / 4889 layout 完全相同），FE 用 `targetType` discriminator 在 page-level 區分；BFF 收到 form payload 時依 `targetType` 路由到對應 BE endpoint。SALE_ITEM 因 body shape 顯著不同（無 `donationFrequency` / `billingDay` / `receiptOption`、改帶 `items[]`），FE 才拆獨立 page。

**Payload 為何走 URL query 而非 sessionStorage / context**：

- ✅ refresh-safe（重新整理 / 直接打 URL 都能還原狀態）
- ✅ 分享 / debug 友善（可貼整條 URL 給同事看）
- ✅ Next.js RSC `searchParams` 是原生 API
- ⚠️ URL 露出 amountTwd 等資訊 — demo 階段不敏感；真實金流 production 通常改 draft id pattern（backend 建 draft、URL 只帶 draft id）

**Server 端 validation**：

兩條 route 在 RSC 解析 `searchParams` 時用 Zod 驗證；任一欄位不合規 → `notFound()` 顯示 Next 404（避免使用者亂貼 URL 進 broken state）。Zod enum 值與 [BE 022 TypeBox](../../../backend/docs/specs/022-donation-order-api.md) 對齊，使 BFF route handler 接 form 後可直接 forward 給 BE。

```ts
// 009a 用（charity / project donation 共用）：
const DonationCheckoutQuery = z.object({
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

// 009b 用：
const PurchaseCheckoutQuery = z.object({
  saleItemId: z.string().uuid(),
  quantity: z.coerce.number().int().min(1).max(100),
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
| **「下次扣款日期」client-side 計算**（v0.1）→ **改 client display-only，BE create 時 server 算為準**（v0.3）| 009a | 規約對齊 [BE 021 §7.7 computeNextChargeAt](../../../backend/docs/specs/021-donation-order-data-model.md)（UTC + 嚴格 `<` 當天視為已過）；FE confirm 頁顯示先用同 BE 規則的 client 函式避免 demo 階段顯示與 BE 寫入錯位；接 BE 真打 endpoint 後改用 response `nextChargeAt` 為準 |
| **送出 = `POST /api/checkout/{donation,purchase}` → BFF forwards to BE 022 §4.1-4.3** (v0.4) | 009a / 009b / [BFF route](#5-bff-route-handler-v04) | brief.md「不接金流」靠 BE 022 §2.3 mock-payment 設計達成：本期只到「BE 建單成 PENDING」這步，不打 confirm-payment；未來付款選擇頁可再接 |
| **送出成功 → `router.replace` 回 entry detail page** (v0.5) | 009a / 009b | charity `targetType=CHARITY` → `/charities/:targetId`；project → `/donation-projects/:targetId`；sale-item → `/sale-items/:saleItemId`。**用 replace 而非 push** — confirm 頁完成任務後不該留在 history，否則使用者按返回會回到一個「已送出」的死頁面，甚至能再點一次重複送單。失敗時不導頁、只留在 confirm 頁顯示 toast.error 讓使用者重試 |
| **smart back fallback `/`** | 三頁 TopNav 都用 default | direct URL / refresh 後返回鈕回首頁 |
| **enum / payload / URL 命名一律對齊 backend** (v0.3)：`DonationFrequency` / `BillingDay` / `ReceiptOption` / `OrderSubjectType` 直接沿用 [BE 021 §5 Prisma enum](../../../backend/docs/specs/021-donation-order-data-model.md)；payload field 名（`donorName` / `amountTwd` / `isAnonymous` / `saleItemId` / `quantity` / `note`）直接沿用 [BE 022 §4 body](../../../backend/docs/specs/022-donation-order-api.md) | 009a / 009b / 008b / 008c | 採 Option C 對齊；BFF route handler 收到 FE payload 後可直接 forward 給 BE，**不需 mapping 層**；未來換 BFF / 接金流時 server-side 只需補欄位、不需重新對欄位 |

---

## 5. BFF Route handler（v0.4 新）

`src/app/api/checkout/donation/route.ts` + `src/app/api/checkout/purchase/route.ts`，兩條 POST。職責：

1. **Zod 驗 body**：對齊 BE 022 body shape；其中 `_endpoint` 為 FE-side discriminator（discriminatedUnion） + 兩條 refine（RECURRING ↔ billingDay 強制 / 互斥對應）
2. **Strip `_endpoint`**：BE TypeBox `additionalProperties: false`，留著會 400
3. **`backendFetch` POST 給 BE 對應 endpoint**
4. **回傳 `{ data: { orderId, status } }`** — FE confirm 頁只用這兩個欄位（未來付款頁可能要 orderId 串 confirm-payment）
5. **CSRF**：`csrfExempt: true`，跟 dev-login 同 pattern——BE 端 endpoint 本身 unauth，FE 沒 session token 可帶
6. **錯誤透傳**：4xx / 5xx 透過既有 `toErrorResponse` 包裝（spec 005 / 006）

```ts
// 對齊 BE 022 §4.1 / §4.2 — discriminated union body
const Body = z.discriminatedUnion('_endpoint', [
  CharityDonationBody,       // _endpoint='/v1/donation/orders/charity-donation' + charityId
  ProjectDonationBody,       // _endpoint='/v1/donation/orders/project-donation' + donationProjectId
]).refine(...).refine(...)   // billingDay cross-field

export const POST = createRoute({
  csrfExempt: true,
  bodySchema: Body,
  handler: async ({ body, requestId }) => {
    const { _endpoint, ...forwardBody } = body
    const { data } = await backendFetch(_endpoint, { method: 'POST', body: forwardBody, requestId })
    return okResponse({ orderId: data.id, status: data.status })
  },
})
```

Sale-item route 同 pattern、body schema 更簡單（無 receiptOption / donationFrequency / billingDay）。

**Mock 對應**：`src/lib/mock/orders-mock.ts` 註冊三條 `/v1/donation/orders/*` dispatcher，USE_MOCK=1 跑也走得通。返回 `{ id, status: 'PENDING' }`（不模 BE 完整 OrderResponse，因為 FE 只用 orderId / status）。

---

## 6. 008b/008c 「下一步」要修改的點

> v0.4 — 不變動 sheet handleSubmit 本身（仍是 `router.push` 到 confirm 頁），只是 confirm 頁的「確認送出」改打 BFF 而非 console.log。下面 sheet handler reference 沿用 v0.3 內容：

```ts
// 008b — DonationSettingsSheet（v0.3 — query params 全用 BE enum）
const handleSubmit = () => {
  const payload = buildPayload(form, target)  // { target, donationFrequency, billingDay, amountTwd }
  const params = new URLSearchParams({
    targetType: payload.target.type,                  // 'CHARITY' | 'DONATION_PROJECT'
    targetId: payload.target.id,
    donationFrequency: payload.donationFrequency,      // 'ONE_TIME' | 'RECURRING'
    ...(payload.billingDay !== null && { billingDay: payload.billingDay }),  // 'DAY_6'|'DAY_16'|'DAY_26'
    amountTwd: String(payload.amountTwd),
  })
  router.push(`/checkout/donation?${params.toString()}`)
  onClose()
}

// 008c — PurchaseQtySheet（v0.3 — query params 全用 BE 命名）
const handleSubmit = () => {
  const params = new URLSearchParams({
    saleItemId: item.id,
    quantity: String(form.quantity),
  })
  router.push(`/checkout/purchase?${params.toString()}`)
  onClose()
}
```

---

## 7. 開放問題（跨 spec）

- **送出後的下一步**：v0.1 `console.log + toast`。未來接金流 → 信用卡 / Apple Pay / Line Pay 選擇頁；或拉到第三方 redirect（藍新 / 綠界）。三條路線都會改寫 §5 submit handler
- **ReceiptOption 對應 Figma 顯示**：[BE 022 §4.1](../../../backend/docs/specs/022-donation-order-api.md) 定義 5 個 enum 值（`NONE` / `INDIVIDUAL` / `CORPORATE` / `GOVERNMENT_DONATION` / `DEFER`），但 Figma 4888 只展示 default `都不需要`（= `NONE`），未拉開 dropdown。v0.3 FE 預設提供完整 5 個 option 字串 mapping（見 [009a §5.2](./009a-donation-confirm.md)），未來 design / PM 補完 Figma 後再對齊
- **匿名捐款的後續影響**：4890「☐ 我要匿名捐款」勾選後是否該禁用姓名欄？BE 端不做 server-side masking（[BE 022 §4.6](../../../backend/docs/specs/022-donation-order-api.md) 一律 echo 原樣 donorName），公開頁面 anonymization 由 UI 端判斷 `isAnonymous` 顯示「匿名捐款者」。預設「勾匿名 → 姓名仍可填、不影響 BE 接受」
- **電話 / email / 地址欄位**：截圖未拉到底；BE 022 也未含此類欄位（未來物流 / 收據才需要）；FE 不擴
- **draft id pattern**：URL query 暴露 amountTwd。未來 production 接金流時改 backend 建 draft → URL 帶 draft id；前端 v0.1 不做
- **isAnonymous 在捐款 (CHARITY / PROJECT) 流程的 UI 缺口**：Figma 4888 / 4889 沒有匿名 checkbox 但 BE 三類訂單共用 `isAnonymous`；FE 在 [009a](./009a-donation-confirm.md) 統一固定送 `false`（對齊 BE optional default）

---

## 8. 變更紀錄

| 版本 | 日期 | 變更 |
|---|---|---|
| 0.1 | 2026-06-15 | 初版：IMG_4888-4890 規劃為「結帳確認頁」family；拆 index + 009a + 009b；定義 routing / Zod query schema / payload contract；shared panel anatomy；列出 008b/c 需配套修改的 submit handler |
| 0.2 | 2026-06-15 | **抽 [009c shared confirm UI](./009c-shared-confirm-ui.md) primitives**：`<ConfirmPageShell>` / `<ConfirmPanel>` / `<KeyValueList>` / `<DisclaimerBox>` / `<RequiredLabel>` / `<StickyConfirmCta>` 六件；§3 共通 anatomy 從 inline className 改為 primitive reference；新增 §3.0「整頁外殼」與 §3.5「Disclaimer 字串」兩節。對齊 008a BottomSheet「UI primitive vs business form 分 spec」慣例 |
| 0.3 | 2026-06-15 | **enum / payload / URL 全面對齊 backend spec 021 / 022**（Option C）：(a) §2 routing 兩條 path 對應到 BE 三條 endpoint（charity / project 共用 `/checkout/donation`、sale-item 走 `/checkout/purchase`）；(b) Zod 兩個 query schema 改用 BE enum 值（`CHARITY/DONATION_PROJECT` / `ONE_TIME/RECURRING` / `DAY_6/16/26`）+ `amountTwd` (1〜1_000_000) / `quantity` (1〜100)；(c) §4 共同決策表新增「enum / payload 命名一律對齊 backend」總綱；「下次扣款日期」改為 client display-only、BE create 時 server 算為準；(d) §5 008b/c submit handler 範例同步改用 BE 命名；(e) §6 開放問題對齊 BE 022 已決策的部分（receiptOption 5 值、isAnonymous 不做 server masking、無 server-side phone/email/address）|
| 0.4 | 2026-06-15 | **接通 BFF → BE**：「確認送出」不再是 `console.log + toast` placeholder，改為 `POST /api/checkout/{donation,purchase}` → BFF Zod 驗 body → strip `_endpoint` → `backendFetch` 對應 BE 022 §4.1/§4.2/§4.3 endpoint → 回 `{ orderId, status }`。brief.md「不接金流」靠 BE 022 §2.3 mock-payment 設計：本期只到 BE 建單成 `PENDING` 這步，不打 `confirm-payment`（留給未來付款選擇頁）。新增 §5 BFF route handler 章節 + §6 sheet handler reference；§4 共同決策「送出」條目改寫；§7 開放問題刪除 `console.log` 相關項。新增檔案：`src/app/api/checkout/donation/route.ts(+test)` / `src/app/api/checkout/purchase/route.ts(+test)` / `src/lib/mock/orders-mock.ts` + 3 個 USE_MOCK dispatcher 註冊；009a / 009b hook 改打 fetch，失敗一律 `toast.error('送出失敗，請稍後再試')` |
| 0.5 | 2026-06-15 | **送出成功 → router.replace 回 entry detail page**：捐款 charity 來源回 `/charities/:targetId`、project 來源回 `/donation-projects/:targetId`、sale-item 來源回 `/sale-items/:saleItemId`。用 `replace`（非 push）避免使用者按返回回到「已送出」的死頁面或重複送單。失敗不導頁、留在 confirm 頁顯示 toast.error。useDonorInfoForm / useReceiptInfoForm 加 `useRouter()`；hook test 新增「成功後 router.replace 被叫」斷言、「失敗不導頁」斷言；spec 009 §4 共同決策表新增此條 |
