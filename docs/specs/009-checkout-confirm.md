# Spec 009：結帳確認頁（捐款 / 購買，index）

- **狀態**：Draft（v0.7 — `_endpoint` discriminator cutover `/user/v1/donation/orders/*` 對齊 BE spec 023 §2.4）
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

## 2. Routing（v0.5 — bare path + in-memory draft store）

新增 2 條 client route。**v0.5 起 URL 完全不帶 query**——資料透過 in-memory draft store handoff：

| Path | 子 spec | 資料來源 | 對應 BE endpoint |
|---|---|---|---|
| `/checkout/donation` | [009a](./009a-donation-confirm.md) | `src/app/checkout/donation/draft-store.ts`（peek 不到 → redirect `/donation`） | `POST /user/v1/donation/orders/charity-donation` 或 `/project-donation` |
| `/checkout/purchase` | [009b](./009b-purchase-confirm.md) | `src/app/checkout/purchase/draft-store.ts`（peek 不到 → redirect `/donation`） | `POST /user/v1/donation/orders/sale-item-purchase` |

**為何 v0.5 從 URL query 改為 in-memory store**：

| 議題 | v0.1〜0.4 URL query | v0.5 in-memory store |
|---|---|---|
| 隱私 | ❌ amountTwd / targetType / targetId / saleItemId 暴露在網址列 / 歷史 / 截圖 / analytics referer | ✅ 完全 client-side、JS runtime 內 |
| 防偽造 | ⚠️ 使用者可自構 URL 直闖 confirm 頁（BE 仍會驗，但 UX 怪） | ✅ store 空 → 強制導回 `/donation` |
| Refresh 行為 | ✅ 還原狀態 | ⚠️ 失效 → redirect（**這是 feature**：confirm 頁本來就不該被直接訪問） |
| 分享 / debug URL | ✅ 可貼 URL 給同事 | ❌ URL 無資訊；but confirm 頁本來就不該分享 |

**為何 FE path 2 條對應 BE 3 條 endpoint**：charity-donation 與 project-donation UI 同一頁（IMG_4888 / 4889 layout 完全相同），用 `draft.target.type` discriminator 區分；BFF 收到 form payload 時依 `_endpoint` 路由到對應 BE。SALE_ITEM body shape 顯著不同（無 `donationFrequency` / `billingDay` / `receiptOption`、改帶 `items[]`），拆獨立 page。

### 2.1 Draft store 設計

兩個 store 各自一份 module-level singleton：

```ts
// donation/draft-store.ts
export type DonationDraft = {
  donationFrequency: 'ONE_TIME' | 'RECURRING'
  billingDay?: 'DAY_6' | 'DAY_16' | 'DAY_26'
  amountTwd: number
  target:
    | { type: 'CHARITY'; detail: CharityDetail }
    | { type: 'DONATION_PROJECT'; detail: DonationDetail }
}

let _draft: DonationDraft | null = null
export function setDonationDraft(d: DonationDraft): void { _draft = d }
export function peekDonationDraft(): DonationDraft | null { return _draft }
export function clearDonationDraft(): void { _draft = null }
```

**為何 peek（不 take）**：React 19 Strict Mode dev 模式會雙 render effect。read-and-clear 會在第二跑空、誤導向 `/donation`。改成 peek + 顯式 clear（成功 submit 後）：

| 觸發 | 動作 |
|---|---|
| sheet「下一步」 | `setDonationDraft({...})` + `router.push('/checkout/donation')` |
| confirm 頁 mount | `peekDonationDraft()` → 有 draft 渲染 / 空 → `router.replace('/donation')` |
| confirm 頁送出成功 | `clearDonationDraft()` + `router.replace(entryUrl)` |
| 頁面 refresh / 新分頁 / 部署 | JS runtime 重啟 → module state reset → 下次訪問空 store → redirect |

**Page entry pattern**：page.tsx 是 RSC（只 export metadata），實際邏輯在 `DonationConfirmPageEntry.tsx` (client)：

```tsx
// donation/page.tsx — RSC shell
export const metadata = { title: '確認捐款資訊 | JKODonation' }
export default function Page() { return <DonationConfirmPageEntry /> }

// donation/DonationConfirmPageEntry.tsx — 'use client'
export function DonationConfirmPageEntry() {
  const router = useRouter()
  const [state, setState] = useState<'pending' | DonationDraft | null>('pending')
  useEffect(() => {
    const d = peekDonationDraft()
    if (!d) { router.replace('/donation'); setState(null); return }
    setState(d)
  }, [router])
  if (state === 'pending' || state === null) return null
  return <DonationConfirmPage draft={state} />
}
```

`'pending'` state 是「effect 尚未跑」的 placeholder — 避免第一次 paint 時閃過 confirm 頁的舊資料。

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
| **送出成功 → `router.replace` 回 entry detail page** (v0.5) | 009a / 009b | charity `target.type=CHARITY` → `/charities/${detail.id}`；project → `/donation-projects/${detail.id}`；sale-item → `/sale-items/${item.id}`。**用 replace 而非 push** — confirm 頁完成任務後不該留在 history。失敗時不導頁、只留在 confirm 頁顯示 toast.error 讓使用者重試 |
| **資料 handoff 走 in-memory draft store**（v0.5 — sheet 寫 / confirm 頁 peek） | 009a / 009b §2.1 | URL 不再帶任何資料（隱私 + UX 一致：refresh / 直接 URL 應該都讓使用者「找不到該頁」）。peek 不 take（Strict Mode safe）；成功 submit 後顯式 clear |
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
  CharityDonationBody,       // _endpoint='/user/v1/donation/orders/charity-donation' + charityId
  ProjectDonationBody,       // _endpoint='/user/v1/donation/orders/project-donation' + donationProjectId
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

**Mock 對應**：`src/lib/mock/orders-mock.ts` 註冊三條 `/user/v1/donation/orders/*` dispatcher，USE_MOCK=1 跑也走得通。返回 `{ id, status: 'PENDING' }`（不模 BE 完整 OrderResponse，因為 FE 只用 orderId / status）。

---

## 6. 008b/008c 「下一步」(v0.5 — 寫入 draft store 取代 URL query)

```ts
// 008b — DonationSettingsSheet
const handleSubmit = () => {
  setDonationDraft({
    donationFrequency: form.donationFrequency,
    ...(form.donationFrequency === 'RECURRING' && form.billingDay
      && { billingDay: form.billingDay }),
    amountTwd: form.amount!.value,
    target: opts.target,                  // { type, detail } — sheet 已從 CtaIsland 收到 full detail
  })
  router.push('/checkout/donation')        // bare path
  opts.onClose()
}

// 008c — PurchaseQtySheet
const handleSubmit = () => {
  setPurchaseDraft({ quantity, item: opts.item })
  router.push('/checkout/purchase')        // bare path
  opts.onClose()
}
```

sheet 自然需要 CtaIsland 餵更豐富的 target/item（不再只是 id）。CtaIsland prop 升級：

```ts
type CtaIslandProps = {
  label: string
  sticky?: boolean
} & (
  | { kind: 'donation'; target:
        | { type: 'CHARITY'; detail: CharityDetail }
        | { type: 'DONATION_PROJECT'; detail: DonationDetail }
    }
  | { kind: 'purchase'; item: ItemDetail }
)
```

詳情頁 caller：

```tsx
// charities/[id]/page.tsx
<CtaIsland kind="donation" target={{ type: 'CHARITY', detail: charity }} label="..." />

// donation-projects/[id]/page.tsx
<CtaIsland kind="donation" target={{ type: 'DONATION_PROJECT', detail: donation }} label="..." sticky />

// sale-items/[id]/page.tsx
<CtaIsland kind="purchase" item={item} label="..." sticky />
```

---

## 7. 開放問題（跨 spec）

- **送出後的下一步**：v0.1 `console.log + toast`。未來接金流 → 信用卡 / Apple Pay / Line Pay 選擇頁；或拉到第三方 redirect（藍新 / 綠界）。三條路線都會改寫 §5 submit handler
- **ReceiptOption 對應 Figma 顯示**：[BE 022 §4.1](../../../backend/docs/specs/022-donation-order-api.md) 定義 5 個 enum 值（`NONE` / `INDIVIDUAL` / `CORPORATE` / `GOVERNMENT_DONATION` / `DEFER`），但 Figma 4888 只展示 default `都不需要`（= `NONE`），未拉開 dropdown。v0.3 FE 預設提供完整 5 個 option 字串 mapping（見 [009a §5.2](./009a-donation-confirm.md)），未來 design / PM 補完 Figma 後再對齊
- **匿名捐款的後續影響**：「☐ 我要匿名捐款」（v0.5 三類訂單統一）勾選後是否該禁用姓名欄？BE 端不做 server-side masking（[BE 022 §4.6](../../../backend/docs/specs/022-donation-order-api.md) 一律 echo 原樣 donorName），公開頁面 anonymization 由 UI 端判斷 `isAnonymous` 顯示「匿名捐款者」。預設「勾匿名 → 姓名仍可填、不影響 BE 接受」
- **電話 / email / 地址欄位**：截圖未拉到底；BE 022 也未含此類欄位（未來物流 / 收據才需要）；FE 不擴
- **draft id pattern**：URL query 暴露 amountTwd。未來 production 接金流時改 backend 建 draft → URL 帶 draft id；前端 v0.1 不做
- ~~**isAnonymous 在捐款 (CHARITY / PROJECT) 流程的 UI 缺口**：Figma 4888 / 4889 沒有匿名 checkbox 但 BE 三類訂單共用 `isAnonymous`；FE 在 [009a](./009a-donation-confirm.md) 統一固定送 `false`~~ → ✅ v0.5 起 [009a v0.8](./009a-donation-confirm.md) 補 checkbox，跨三類訂單統一

---

## 8. 變更紀錄

| 版本 | 日期 | 變更 |
|---|---|---|
| 0.1 | 2026-06-15 | 初版：IMG_4888-4890 規劃為「結帳確認頁」family；拆 index + 009a + 009b；定義 routing / Zod query schema / payload contract；shared panel anatomy；列出 008b/c 需配套修改的 submit handler |
| 0.2 | 2026-06-15 | **抽 [009c shared confirm UI](./009c-shared-confirm-ui.md) primitives**：`<ConfirmPageShell>` / `<ConfirmPanel>` / `<KeyValueList>` / `<DisclaimerBox>` / `<RequiredLabel>` / `<StickyConfirmCta>` 六件；§3 共通 anatomy 從 inline className 改為 primitive reference；新增 §3.0「整頁外殼」與 §3.5「Disclaimer 字串」兩節。對齊 008a BottomSheet「UI primitive vs business form 分 spec」慣例 |
| 0.3 | 2026-06-15 | **enum / payload / URL 全面對齊 backend spec 021 / 022**（Option C）：(a) §2 routing 兩條 path 對應到 BE 三條 endpoint（charity / project 共用 `/checkout/donation`、sale-item 走 `/checkout/purchase`）；(b) Zod 兩個 query schema 改用 BE enum 值（`CHARITY/DONATION_PROJECT` / `ONE_TIME/RECURRING` / `DAY_6/16/26`）+ `amountTwd` (1〜1_000_000) / `quantity` (1〜100)；(c) §4 共同決策表新增「enum / payload 命名一律對齊 backend」總綱；「下次扣款日期」改為 client display-only、BE create 時 server 算為準；(d) §5 008b/c submit handler 範例同步改用 BE 命名；(e) §6 開放問題對齊 BE 022 已決策的部分（receiptOption 5 值、isAnonymous 不做 server masking、無 server-side phone/email/address）|
| 0.4 | 2026-06-15 | **接通 BFF → BE**：「確認送出」不再是 `console.log + toast` placeholder，改為 `POST /api/checkout/{donation,purchase}` → BFF Zod 驗 body → strip `_endpoint` → `backendFetch` 對應 BE 022 §4.1/§4.2/§4.3 endpoint → 回 `{ orderId, status }`。brief.md「不接金流」靠 BE 022 §2.3 mock-payment 設計：本期只到 BE 建單成 `PENDING` 這步，不打 `confirm-payment`（留給未來付款選擇頁）。新增 §5 BFF route handler 章節 + §6 sheet handler reference；§4 共同決策「送出」條目改寫；§7 開放問題刪除 `console.log` 相關項。新增檔案：`src/app/api/checkout/donation/route.ts(+test)` / `src/app/api/checkout/purchase/route.ts(+test)` / `src/lib/mock/orders-mock.ts` + 3 個 USE_MOCK dispatcher 註冊；009a / 009b hook 改打 fetch，失敗一律 `toast.error('送出失敗，請稍後再試')` |
| 0.5 | 2026-06-15 | **送出成功 → router.replace 回 entry detail page**：捐款 charity 來源回 `/charities/:targetId`、project 來源回 `/donation-projects/:targetId`、sale-item 來源回 `/sale-items/:saleItemId`。用 `replace`（非 push）避免使用者按返回回到「已送出」的死頁面或重複送單。失敗不導頁、留在 confirm 頁顯示 toast.error。useDonorInfoForm / useReceiptInfoForm 加 `useRouter()`；hook test 新增「成功後 router.replace 被叫」斷言、「失敗不導頁」斷言；spec 009 §4 共同決策表新增此條 |
| 0.5 | 2026-06-15 | **URL query → in-memory draft store**（資安 / UX）：confirm 頁 URL 不再帶 `targetType/amountTwd/...`。新增 `donation/draft-store.ts` + `purchase/draft-store.ts`（module 單例：`setX` / `peekX` / `clearX`）。sheet handleSubmit 寫 store + `router.push('/checkout/{donation,purchase}')` bare path。confirm 頁從 RSC（searchParams + RSC fetch detail）改為 RSC shell + `*ConfirmPageEntry.tsx`（client）：`useEffect` peek，**空 → `router.replace('/donation')`**；refresh / 直接 URL / 部署 → JS runtime 重置 → 同樣導回。CtaIsland prop 升級：donation target、purchase item 從 `{type, id}` / `PurchaseItem` 改為攜帶**完整 detail object**（CharityDetail / DonationDetail / ItemDetail）—— confirm 頁不再 fetch、改從 draft 讀。useDonorInfoForm / useReceiptInfoForm opts 從 `{query, target}` / `{query, item}` 收成 `{draft}`；buildPayload 從 draft 讀；submit 成功 `clearXDraft()` 後再 `router.replace(entryUrl(draft))`。§2 routing 章節全部改寫、加 §2.1 draft store 設計；§4 共同決策表加「資料 handoff 走 in-memory draft store」一條；§6 sheet handler reference 同步更新。`DonationCheckoutQuery` / `PurchaseCheckoutQuery` 型別移除（不再從 URL 解析） |
| 0.6 | 2026-06-15 | **donation flow 也支援匿名**：BFF `/api/checkout/donation` body Zod `isAnonymous` 從 `z.literal(false)` 升為 `z.boolean()`，配合 [009a v0.8](./009a-donation-confirm.md) 把「我要匿名捐款」checkbox 加進 charity / project 確認頁。BE 022 §4.1/§4.2 本來就接受 boolean、無變動。同檔新增 wiring test「isAnonymous=true 也通過 schema」 |
| 0.7 | 2026-06-16 | **`_endpoint` discriminator cutover 到 `/user/v1/donation/orders/*`**（對齊 [backend spec 023 §2.4](../../../backend/docs/specs/023-api-routing-versioning.md)）：BE 把三條 order create endpoint 從 `/v1/donation/orders/*` 移到 `/user/v1/donation/orders/*`；FE side discriminator 字面值 = BE 真實 path，必須同步替換。§2 routing 表 + §5 BFF route handler 範例 + §7 mock dispatcher 都更新。對應檔案：`src/app/api/checkout/{donation,purchase}/route.ts` zod literal、`useDonorInfoForm.ts` / `useReceiptInfoForm.ts` 中的 `_endpoint` literal、`src/lib/mock/register.ts` 三條 `registerMock` 路徑、相關測試 URL 斷言。 |
