# Spec 004：詳情頁（Detail Pages，index）

- **狀態**：Draft（v0.5 — upstream cutover `/user/v1/donation/*` 對齊 BE spec 023 §2.4）
- **建立日期**：2026-06-14
- **依賴**：
  - [brief §2.5 詳情頁元素](../brief.md#2-設計畫面盤點)
  - [002 §3.2 per-resource schema](./002-list-data.md#3-schemas--srclibschemaslistts)
  - Backend [spec 017 detail APIs](../../../backend/docs/specs/017-detail-apis.md)
- **下游**：[003e1 / 3 個 card](./003e-charity-card.md) 整張卡 `<Link>` 至此

---

## 1. 範圍

三個詳情頁，路由 + 資料 + 視覺：

| 頁 | 路由 | 對應截圖 | Backend endpoint | 子 spec |
|---|---|---|---|---|
| 公益團體介紹 | `/charities/:id` | IMG_4876 | `GET /user/v1/donation/charities/:id` | [004a](./004a-charity-detail.md) |
| 捐款專案介紹 | `/donation-projects/:id` | IMG_4883 | `GET /user/v1/donation/donation-projects/:id` | [004b](./004b-donation-project-detail.md) |
| 義賣商品介紹 | `/sale-items/:id` | IMG_4882 | `GET /user/v1/donation/sale-items/:id` | [004c](./004c-sale-item-detail.md) |

---

## 2. 共通結構

三頁共用的元素 / 行為：

| 元件 | 細節 |
|---|---|
| TopNav（[003b](./003b-topnav.md)） | 紅底，返回按鈕；標題依頁；右上「分享」icon button — **作業範圍外，不接 onClick**（保留 prop） |
| 主視覺 hero | charity = 紅底大 logo + 名稱；donation/item = cover image |
| Categories tags | 每頁底部前的 tag pills；資料同 [002 §3.1 CATEGORY_LABELS](./002-list-data.md) |
| Sticky CTA | 紅底全寬按鈕，固定在底部（safe-area 適配）；charity = 「直接捐款給團體」；donation/item = 「立即捐款」 — **作業範圍外，UI only 不接金流** |

> CTA 點擊：可只 `console.log('CTA clicked')` 或開 toast「此功能屬非作業範圍」。實作 PR 可定。

---

## 3. 路由結構

```
src/app/
├── charities/
│   ├── page.tsx                  # 既有列表（spec 003）
│   └── [id]/
│       ├── page.tsx              # 公益團體詳情（spec 004a）
│       ├── loading.tsx           # skeleton
│       └── error.tsx
├── donation-projects/
│   └── [id]/page.tsx             # spec 004b
└── sale-items/
    └── [id]/page.tsx             # spec 004c
```

> 統一規範：詳情頁皆為 **Server Component** 預設；RSC `fetch` backend，把 data 傳給內層 client component（CTA、分享 button、展開描述「更多」屬於有 state 的 island）。

### 3.1 橫向關聯導航策略（v0.4：撤回 `replace`，統一用 push）

所有頁面間的 `<Link>` 一律走 **Next 預設 push**——不論是 list → 詳情，還是詳情 → 詳情的橫向跳轉。每次點擊都堆一個 history entry、按返回逐步退回。

| 連結來源 | 目的地 | 策略 |
|---|---|---|
| list 卡片（[003e1/e2/e3](./003e-charity-card.md)） | 詳情頁 | `push`（Next `<Link>` 預設） |
| 詳情頁 的「查看團體 ›」chip ([004b §4](./004b-donation-project-detail.md#4-元件結構) / [004c §4](./004c-sale-item-detail.md#4-元件結構)) | charity 詳情 | `push`（v0.4 改） |
| charity 詳情 →「捐款專案」cross-link ([004a §3](./004a-charity-detail.md#3-資料流)) | 對應 donation/item 詳情 | `push`（v0.2 文件曾標 replace 但實作未上線；v0.4 與其他統一） |
| Sticky CTA「立即捐款」 | （金流外部頁，作業範圍外） | n/a |

**為何 v0.4 撤回 v0.2 的 `replace` 策略**

v0.2 引入了「lateral nav 用 `replace`」策略：詳情 A → chip → 詳情 B 不堆 history、返回直接回 list。動機是避免「連看 3 個關聯團體後要按 3 次返回」的反例。

實測 UX feedback：**單一 lateral 跳轉的「按 1 次返回卻跳過中間頁」反而更反直覺**。使用者明明走過「列表 → A 詳情 → B 詳情」3 個畫面，按返回直接跳到列表會以為「我是不是按到兩次」。

權衡後：
- **連續多次橫向**（罕見）：原 v0.2 想優化，但實際場景少
- **單次橫向**（常見）：v0.2 反而違反「按 1 次返回回 1 頁」的直覺

v0.4 結論：簡單一致 > 過度優化。一律 push、每次返回都退一步、TopNav 智慧返回（[spec 005 §4](./005-homepage-auth.md#4-smart-back-navigation-v02-新增)）負責處理「無 history → 回首頁」的邊界。

**反例（v0.2 想避免、但 v0.4 接受）**

詳情 A → chip → 詳情 B → chip → 詳情 C → 按 3 次返回才能回 list。實作上接受這個成本，因為實際使用上極少見（多數使用者只會橫向跳 0–1 次）。

> v0.4 實作：兩個 `<Link href replace>` 拿掉 `replace` 即可（`src/app/donation-projects/[id]/page.tsx` 與 `src/app/sale-items/[id]/page.tsx` 的 `CharityChip`）；e2e `detail.spec.ts` 的「lateral nav」測試斷言反轉為「back 回到 item 詳情」。

### 3.2 直接訪問詳情頁 URL 的返回行為（v0.3 新增）

直接打詳情頁 URL（typed / bookmark / external link）或在詳情頁 refresh → 站內無 nav 歷史。原本 TopNav 預設 `router.back()` 會無作用（瀏覽器 history 空），現由 [spec 005 §4 `useSmartBack`](./005-homepage-auth.md#4-smart-back-navigation-v02-新增) 處理：

- 站內動過 → `router.back()`（典型 `list → detail` 動線）
- 首訪 / 外站 → `router.push('/')`（TopNav 預設 fallback；詳情頁可改傳 `fallback="/donation"` 但目前統一回首頁）

詳情頁 3 條 RSC 完全不需手動 wire，吃 TopNav v0.3 預設即可。

---

## 4. BFF Route

三個詳情頁對應的 BFF route，沿用 spec 002 generic 風格：

```ts
// src/lib/api/createDetailRoute.ts
export function createDetailRoute(upstreamPath: (id: string) => string, schema: ZodType) { ... }

// src/app/api/charities/[id]/route.ts
export const GET = createDetailRoute(id => `/user/v1/donation/charities/${id}`, CharityDetail)
// src/app/api/donation-projects/[id]/route.ts
export const GET = createDetailRoute(id => `/user/v1/donation/donation-projects/${id}`, DonationDetail)
// src/app/api/sale-items/[id]/route.ts
export const GET = createDetailRoute(id => `/user/v1/donation/sale-items/${id}`, ItemDetail)
```

詳細 contract 見子 spec。

---

## 5. Schemas（detail，比 list item 多欄位）

詳細欄位定義在 backend spec 017，前端 schema 在 `src/lib/schemas/detail.ts`：

```ts
// 共同基底（list item 一致）
const Base = z.object({
  id: z.string().uuid(),
  name: z.string(),
  description: z.string(),
  logoUrl: z.string().url().optional(),
  categories: z.array(CategoryKeyEnum),  // detail 必有
})

// Charity detail：加聯絡資訊 / 核准字號 / cross-link 子表
export const CharityDetail = Base.extend({
  contactPhone: z.string().optional(),
  contactEmail: z.string().email().optional(),
  officialWebsite: z.string().url().optional(),
  approvalNo: z.string().optional(),       // 核准字號，如「台內團字第1110295700號」
})

// DonationProject detail
export const DonationProjectDetail = Base.extend({
  charity: z.object({ id: z.string().uuid(), name: z.string(), logoUrl: z.string().url().optional() }),
  coverImageUrl: z.string().url().optional(),
  raisingApprovalNo: z.string().optional(),  // 勸募立案核准字號
  reliefApprovalNo: z.string().optional(),   // 衛部救字號
  content: z.string(),                       // 完整專案內容（長文）
})

// SaleItem detail
export const SaleItemDetail = Base.extend({
  charity: z.object({ id: z.string().uuid(), name: z.string(), logoUrl: z.string().url().optional() }),
  coverImageUrl: z.string().url().optional(),
  priceTwd: z.number().int().nonnegative(),
  raisingApprovalNo: z.string().optional(),
  reliefApprovalNo: z.string().optional(),
  content: z.string(),
})
```

---

## 6. 共通行為

- **404 處理**：backend 回 `CHARITY_NOT_FOUND` / `DONATION_PROJECT_NOT_FOUND` / `SALE_ITEM_NOT_FOUND` → 前端 `notFound()` 顯示 `not-found.tsx`
- **「更多」展開**：IMG_4876 簡介末尾有「...更多」展開；client component 控制 collapsed state
- **分享 icon**：UI only，不接功能（[brief §3 非範圍](../brief.md#3-範圍與非範圍)）
- **CTA**：UI only，不接金流

---

## 7. 整體驗收

- [ ] 路由 `/charities/:id`、`/donation-projects/:id`、`/sale-items/:id` 三條都能進
- [ ] 404 case 顯示 `not-found`
- [ ] backend 5xx 顯示 error boundary（`error.tsx`）
- [ ] 三頁分別對齊 IMG_4876 / 4883 / 4882 主要視覺
- [ ] 點列表卡片可以跳對應詳情頁（往返路由保留 scroll position 屬增強，不強制）
- [ ] 詳情頁的「分享」+「捐款」按鈕只刻 UI，不接功能

---

## 8. 變更紀錄

| 版本 | 日期 | 變更 |
|---|---|---|
| 0.1 | 2026-06-14 | 初版：對應 IMG_4876 / 4883 / 4882 補件揭露 |
| 0.2 | 2026-06-14 | 新增 §3.1 橫向關聯導航 `replace` 策略：詳情頁互鏈用 `<Link href replace>`，按返回必回 list 不會卡到其他詳情頁 |
| 0.3 | 2026-06-15 | 新增 §3.2 直接訪問詳情頁 URL 的返回行為：透過 [spec 005 §4 smart back](./005-homepage-auth.md#4-smart-back-navigation-v02-新增) 處理（首訪 → push fallback / 站內 nav → router.back），詳情頁本身無需改 |
| 0.4 | 2026-06-15 | 撤回 §3.1 v0.2 的 lateral nav `replace` 策略：實測「按 1 次返回卻跳過中間頁」反直覺，改為所有 `<Link>` 統一 push、每次返回退一步。CharityChip 兩處（donation/item 詳情）拿掉 `replace`；`detail.spec.ts` 的「lateral nav」測試斷言反轉。簡單一致 > 過度優化 |
| 0.5 | 2026-06-16 | **Upstream path cutover 到 `/user/v1/donation/*`**（對齊 [backend spec 023 §2.4](../../../backend/docs/specs/023-api-routing-versioning.md)）：§1 對照表三條 detail endpoint URL + §4 createDetailRoute 三個範例全部從 `/v1/donation/*` 改 `/user/v1/donation/*`。對應 [004a v0.4](./004a-charity-detail.md) / 004b / 004c 同步。 |
