# Spec 002：捐款項目列表 — 業務 / 資料層（三 tab 通用）

- **狀態**：Draft
- **建立日期**：2026-06-13（v0.1）/ 2026-06-14（v0.2 — 三 tab + 10 筆 + scroll% 觸發 + tab lazy）/ 2026-06-14（v0.5 — per-tab limit：charity 10 / donation 5 / item 4）/ 2026-06-15（v0.6 — viewport hint：item desktop=12）/ 2026-06-16（v0.9 — upstream cutover `/user/v1/donation/*` 對齊 BE spec 023 §2.4）
- **影響範圍**：
  - BFF：`src/app/api/{charities,donations,items}/route.ts` + `src/lib/api/createListRoute.ts`
  - 資料層：`src/lib/schemas/list.ts`、`src/lib/api/client.ts`、`src/lib/query/list.ts`
  - Mock fixtures：`src/lib/mock/{charity,donation,item}-fixtures.ts`、`src/lib/mock/makeListHandler.ts`、`src/lib/mock/index.ts`
  - Page 資料 prefetch：`src/app/donation/page.tsx`（含 `?tab=` 處理）
  - Provider：`src/app/providers.tsx`、`src/app/layout.tsx`
  - Hooks：`src/lib/hooks/useDebouncedValue.ts`、`src/lib/hooks/useUrlSync.ts`、`src/lib/hooks/useScrollPercentSentinel.ts`
- **依賴**：
  - [Spec 001 BFF 基礎建設](./001-bff-infrastructure.md)（`createRoute` / `okResponse` / `backendFetch` / `parseQuery` / mock dispatch）
  - Backend [Spec 016](../../../backend/docs/specs/016-charity-list-api.md) `/user/v1/donation/charities`；以及（**待 backend 補**）`/user/v1/donation/donation-projects` 與 `/user/v1/donation/sale-items` 假設同契約
  - 專案根 ADR 002（Next.js + BFF）
- **下游**：[Spec 003 列表 UI](./003-charity-list-ui.md) 全系列

---

## 1. 範圍與設計決策

### 1.1 範圍內

- 三個 BFF Route Handler：`GET /api/charities`、`GET /api/donations`、`GET /api/items` — 共用 generic factory，差異僅在 upstream path
- 三組 Mock fixture（`USE_MOCK=1` 時 BFF 走 mock dispatch）
- Zod schemas：generic `ResourceListItem` + per-resource refined（`Charity` / `Donation` / `Item`）
- TanStack Query `QueryClient` Provider + generic `useResourceListInfinite({ resource, q, enabled })` hook
- **Lazy fetching**：未啟用的 tab 不打網路（TanStack `enabled: resource === activeTab`）
- Tab state 管理：URL `?tab=charity|donation|item` 同步
- Client hooks：debounce、URL `q` + `tab` 同步、**scroll-percent sentinel**（取代 v0.1 的 IntersectionObserver-rootMargin）
- Server Component `prefetchInfiniteQuery` 邊界（第一頁 + active tab SSR）

### 1.2 範圍外（屬 [spec 003](./003-charity-list-ui.md)）

- 元件 anatomy / 視覺
- 設計 token / RWD
- e2e 測試

### 1.3 設計決策

| 決策 | 理由 |
|---|---|
| **Per-tab `limit`**（v0.5；v0.2~0.4 為 10 統一） | 三 tab 卡片視覺密度不同（行高 / 16:9 / 2×square），mobile 寬度下每次取對應自然視覺節奏：charity **10**（row、單行高）、donation **5**（16:9 cover ≈ 半屏）、item **4**（2 欄正方 = 2 列）。預設仍 10，per-route 用 `opts.limit` 覆寫 |
| **Viewport-aware limits**（v0.6；v0.7 擴 charity desktop；v0.8 擴 donation tablet） | item tab grid 隨寬度由 2 → 3 → 4 欄變化；單一 `limit:4` 在 tablet/desktop 偏稀。三檔分流：mobile **4**、tablet **6**（`md:grid-cols-3` × 2 列）、desktop **12**（`lg:grid-cols-4` × 3 列）。**v0.7 charity 加開 `desktopLimit:30`**（`lg:grid-cols-3` × 10 列）。**v0.8 donation 加開 `tabletLimit:8`**（`md:grid-cols-2` × 4 列）：mobile 仍 5（單欄半屏 cover）、desktop 暫沿用 mobile 5（16:9 cover 在 3 欄仍 OK，未來再評）。client `useViewport()` 用 2 個 matchMedia（`min-width:768px` / `min-width:1024px`）偵測 → 帶 `?viewport=mobile\|tablet\|desktop` → BFF 用對應 `opts.limit` / `tabletLimit` / `desktopLimit`。client 只宣告 viewport，不送任意 limit；數字仍在 spec 控制。SSR 預設 mobile，非 mobile 用戶首訪會多 1 次 fetch（接受） |
| **Scroll-percent sentinel**（5%~10% from bottom） | brief v0.3 規格；比「絕對 px」更貼近長頁面相對位置感 |
| **Generic factory** 而非 3 個獨立 hook | 三 tab 契約對稱；3× 重複犯 spec 001a §4.4「禁止硬寫」精神。型別用 `ResourceKey` discriminator 保安全 |
| **TanStack `enabled` 控制 lazy fetch** | 切到 tab 才打網路；30s `staleTime` 內回切 cache hit |
| **URL `?tab=` 用 `router.replace`** | tab 切換不污染 history（與 `?q=` 同處理） |
| **三個 BFF endpoint 而非 `/api/list/:resource`** | Next.js App Router 慣用 path-based；3 個 file 各 2 行 `createListRoute('/v1/X')` 仍乾淨 |
| **`Cache-Control: no-store, private` 由 createRoute 強制** | spec 001a §1.3 |
| **搜尋 debounce 300ms** | 與 architecture.md §3 對齊 |
| **TanStack Query `staleTime: 30_000`** | 30s 內回到同 q 直接 cache hit |
| **Server-side prefetch 只預載 activeTab 第一頁** | TTFB 縮短一個 round trip；其他 tab 等切換時才打 |
| **`activeTab='charity'` 是 default，不寫入 URL** | URL `/donation` 而非 `/donation?tab=charity` 較乾淨 |

---

## 2. BFF Route — 三 tab generic factory

### 2.1 對外契約（三 endpoint 一致）

```http
GET /api/<resource>?q=<keyword>&cursor=<opaque>
  where <resource> ∈ { charities | donations | items }
```

| 參數 | 必填 | 規則 | BFF 處理 |
|---|---|---|---|
| `q` | 否 | trim 後 0~80 字 | 空字串 / 全空白 → drop；> 80 字 → 400 `VALIDATION_ERROR` |
| `cursor` | 否 | opaque base64url 1~512 字 | 透傳到 backend |
| `category` | 否 | 必須是 [§3.1 CategoryKey 白名單](#31-categories-categorykey-來自-backend-015-7) | 透傳到 backend；不在白名單 → 400 `VALIDATION_ERROR`（v0.3 新增） |
| `viewport` | 否 | `'mobile' \| 'tablet' \| 'desktop'`（v0.6） | 不透傳；BFF 內部用來選 `opts.limit` / `tabletLimit` / `desktopLimit`。不在白名單 → 400 `VALIDATION_ERROR` |

Response（200 OK）：

```jsonc
{
  "data": {
    "items": [
      {
        "id": "0e1b...c9",
        "name": "...",
        "description": "...",
        "logoUrl": "...",   // optional
        "category": "..."    // optional
      }
    ],
    "nextCursor": "eyJsYXN0SW...Lg"
  }
}
```

`nextCursor` 為 `null` 代表已到尾。三 tab schema 共用（差異由 backend 內部資料表現）。

### 2.2 錯誤映射

| 觸發 | 回應 |
|---|---|
| `q` > 80 字 | 400 `VALIDATION_ERROR` |
| backend 5xx / connection refused | 502 `BACKEND_UPSTREAM_ERROR` |
| backend timeout | 504 `BACKEND_TIMEOUT` |
| backend JSON 不合 Zod schema | 502 `CONTRACT_VIOLATION` |
| `USE_MOCK=1` 但對應 fixture 沒註冊 | 502 `BACKEND_UPSTREAM_ERROR` |

### 2.3 實作骨架（generic factory）

```ts
// src/lib/api/createListRoute.ts
import 'server-only'
import { createRoute, okResponse } from '@/lib/api'
import { backendFetch } from '@/lib/api/backend'
import { ContractViolationError } from '@/lib/errors/ContractViolationError'
import { ListQuery, BackendListResponse } from '@/lib/schemas/list'

/**
 * v0.4：factory 參數化收 per-resource backend schema + 投影函式。
 *  - `backendItemSchema`：對應 backend 016 / 017 / 018 每個 resource 的 raw 形狀
 *  - `project`：把 backend item 投到 client-visible shape（裁掉 createdAt/updatedAt 等）
 */
export function createListRoute<TBackend, TClient>(opts: {
  upstreamPath: string
  backendItemSchema: ZodType<TBackend>
  project: (item: TBackend) => TClient
  /** v0.5：per-tab default；default 10。charity 10 / donation 5 / item 4。
   *  也是 mobile 預設。 */
  limit?: number
  /** v0.6：當 client 帶 `?viewport=tablet` 時使用；省略 → 退回 limit。
   *  目前只有 item 設 6。 */
  tabletLimit?: number
  /** v0.6：當 client 帶 `?viewport=desktop` 時使用；省略 → 退回 limit。
   *  目前只有 item 設 12。 */
  desktopLimit?: number
}) {
  const BackendList = z.object({
    items: z.array(opts.backendItemSchema),
    pageInfo: z.object({
      nextCursor: z.string().nullable(),
      hasMore: z.boolean(),
    }),
  })

  return createRoute({
    querySchema: ListQuery,
    handler: async ({ query, requestId }) => {
      const q = query.q?.trim() || undefined
      const { data } = await backendFetch(opts.upstreamPath, {
        query: {
          q,
          cursor: query.cursor,
          category: query.category, // v0.3 透傳；ListQuery 已守白名單
          // v0.6：依 viewport 選 desktopLimit / tabletLimit / limit
          limit:
            query.viewport === 'desktop' && opts.desktopLimit !== undefined
              ? opts.desktopLimit
              : query.viewport === 'tablet' && opts.tabletLimit !== undefined
                ? opts.tabletLimit
                : (opts.limit ?? 10),
          sort: 'createdAt:desc',
        },
        requestId,
      })
      const parsed = BackendList.safeParse(data)
      if (!parsed.success) {
        throw new ContractViolationError(
          `Backend ${opts.upstreamPath} shape invalid`,
          parsed.error,
        )
      }
      const items = parsed.data.items.map(opts.project)
      return okResponse({
        items,
        nextCursor: parsed.data.pageInfo.nextCursor,
      })
    },
  })
}
```

```ts
// src/app/api/charities/route.ts
import { createListRoute } from '@/lib/api/createListRoute'
import { BackendCharityListItem } from '@/lib/schemas/list'

export const GET = createListRoute({
  upstreamPath: '/user/v1/donation/charities',
  backendItemSchema: BackendCharityListItem,
  limit: 10,        // v0.5 — row 卡，mobile 寬度下單行 → 10 筆 ≈ 滑 1~2 頁觸發 next
  desktopLimit: 30, // v0.7 — desktop lg:grid-cols-3 × 10 列；tablet md:grid-cols-2 沿用 10（5 列足）
  project: (c) => ({
    id: c.id,
    name: c.name,
    description: c.description,
    ...(c.logoUrl ? { logoUrl: c.logoUrl } : {}),
    ...(c.category ? { category: c.category } : {}),
    ...(c.categories?.length ? { categories: c.categories } : {}),
  }),
})

// src/app/api/donations/route.ts
import { BackendDonationListItem } from '@/lib/schemas/list'

export const GET = createListRoute({
  upstreamPath: '/user/v1/donation/donation-projects',
  backendItemSchema: BackendDonationListItem,
  limit: 5,        // v0.5 — 16:9 cover card 在 mobile 寬度下每張約半屏，5 筆 ≈ 2 屏
  tabletLimit: 8,  // v0.8 — tablet md:grid-cols-2 × 4 列；desktop 暫沿用 5
  project: (d) => ({
    id: d.id,
    name: d.name,
    description: d.description,
    charityId: d.charityId,
    charityName: d.charityName,
    ...(d.coverImageUrl ? { coverImageUrl: d.coverImageUrl } : {}),
    ...(d.categories?.length ? { categories: d.categories } : {}),
  }),
})

// src/app/api/items/route.ts
import { BackendItemListItem } from '@/lib/schemas/list'

export const GET = createListRoute({
  upstreamPath: '/user/v1/donation/sale-items',
  backendItemSchema: BackendItemListItem,
  limit: 4,         // v0.5 — mobile：2 欄正方 grid，4 筆 = 2 列 ≈ 1 屏
  tabletLimit: 6,   // v0.6 — tablet：md:grid-cols-3，6 筆 = 2 列
  desktopLimit: 12, // v0.6 — desktop：lg:grid-cols-4，12 筆 = 3 列
  project: (i) => ({
    id: i.id,
    name: i.name,
    description: i.description,
    charityId: i.charityId,
    charityName: i.charityName,
    priceTwd: i.priceTwd,
    ...(i.coverImageUrl ? { coverImageUrl: i.coverImageUrl } : {}),
    ...(i.categories?.length ? { categories: i.categories } : {}),
  }),
})
```

每個 route file 仍是「2 進 / 1 出」邏輯，但 per-resource 投影顯式寫出 — 卡片需要的欄位（coverImage、charityName、priceTwd）就不會被早期版本的 generic 投影誤刪。`createdAt` / `updatedAt` 隱式被 Zod parse + 投影丟掉。

---

## 3. Schemas

### 3.1 Categories (`CategoryKey`) — 來自 backend 015 §7

> v0.4：對齊 2026-06-14 截圖補件（IMG_4879 / 4881），categories 從 6 個擴為 **16 個**。原 6 個 key 中保留語意但 rename（`animal` → `animal_protection`、`elderly` → `elderly_care` 等）對齊新 displayName。

```ts
// src/lib/schemas/categories.ts
import { z } from 'zod'

/** 跟 backend 015 §7.2 對齊；三 tab 共用同一份白名單 */
export const CATEGORY_KEYS = [
  'child_care',                // 兒少照護
  'animal_protection',         // 動物保護
  'special_medical',           // 特殊醫病
  'elderly_care',              // 老人照護
  'disability_service',        // 身心障礙服務
  'women_care',                // 婦女關懷
  'sports_development',        // 運動發展
  'education_advocacy',        // 教育議題提倡
  'environmental_protection',  // 環境保護
  'diversity',                 // 多元族群
  'media',                     // 媒體傳播
  'public_issue',              // 公共議題
  'arts_culture',              // 文教藝術
  'community_development',     // 社區發展
  'poverty_relief',            // 弱勢扶貧
  'international_aid',         // 國際救援
] as const
export type CategoryKey = (typeof CATEGORY_KEYS)[number]

export const CategoryKeyEnum = z.enum(CATEGORY_KEYS)

/** UI 顯示用中文 label。`null` key = 「全部」（未選擇）。 */
export const CATEGORY_LABELS: Record<CategoryKey, string> = {
  child_care:               '兒少照護',
  animal_protection:        '動物保護',
  special_medical:          '特殊醫病',
  elderly_care:             '老人照護',
  disability_service:       '身心障礙服務',
  women_care:               '婦女關懷',
  sports_development:       '運動發展',
  education_advocacy:       '教育議題提倡',
  environmental_protection: '環境保護',
  diversity:                '多元族群',
  media:                    '媒體傳播',
  public_issue:             '公共議題',
  arts_culture:             '文教藝術',
  community_development:    '社區發展',
  poverty_relief:           '弱勢扶貧',
  international_aid:        '國際救援',
}

export function getCategoryLabel(key: CategoryKey | null): string {
  return key === null ? '全部' : CATEGORY_LABELS[key]
}
```

> **三 tab 共用 categories**：backend 015 §7.2 規範「三 model 共用一組白名單」。若未來拆分（backend 015 §7.4 升級觸發條件），改成 per-resource：`Record<ResourceKey, CategoryKey[]>`。
>
> **categories 為什麼 hardcode 而非 API 動態載入**：16 個 key 短期不會變；做 `GET /api/categories` 多一條 endpoint + 一次 fetch 沒效益。未來若 backend 開動態 endpoint，本檔 import 路徑換掉即可。

### 3.2 List schemas — `src/lib/schemas/list.ts`

```ts
import { z } from 'zod'
import { CategoryKeyEnum } from './categories'

// —— Resource discriminator ——
export const RESOURCE_KEYS = ['charity', 'donation', 'item'] as const
export type ResourceKey = (typeof RESOURCE_KEYS)[number]

export const RESOURCE_TO_PATH: Record<ResourceKey, string> = {
  charity:  '/api/charities',
  donation: '/api/donations',
  item:     '/api/items',
}

// —— BFF inbound (client → BFF) ——
export const ListQuery = z.object({
  q: z.string().max(80).optional(),
  cursor: z.string().max(512).optional(),
  category: CategoryKeyEnum.optional(), // v0.3 新增；白名單守在 schema 層
})

// —— BFF response (BFF → client) generic shape ——
//
// v0.4：補件後三 tab 卡片 layout 差異化，schema 對應拆分：
//   - Charity：小 logo + name + description（沿用既有）
//   - DonationProject：cover image（top）+ 主辦團體 + 標題 + 描述 + categories tags
//   - SaleItem：商品圖 + 「公益義賣」絲帶 + 名稱 + 主辦團體 + TWD 價格
//
// 共用最小 shape 用 `ResourceListItem`，per-tab 擴充欄位由各自 schema `.extend()`。
export const ResourceListItem = z.object({
  id: z.string().uuid(),
  name: z.string(),
  description: z.string(),
  logoUrl: z.string().url().optional(),
})
export type ResourceListItem = z.infer<typeof ResourceListItem>

// —— Per-resource refined types ——
export const Charity = ResourceListItem.extend({
  categories: z.array(CategoryKeyEnum).optional(), // 卡片不顯示 categories tags，可省
})
export type Charity = z.infer<typeof Charity>

/** 捐款專案：cover image + 主辦團體 + categories tags 在卡片上呈現 */
export const Donation = ResourceListItem.extend({
  charityId: z.string().uuid(),
  charityName: z.string(),
  coverImageUrl: z.string().url().optional(),
  categories: z.array(CategoryKeyEnum).optional(),
})
export type Donation = z.infer<typeof Donation>

/** 義賣商品：商品圖 + 主辦團體 + TWD 價格（必有） */
export const Item = ResourceListItem.extend({
  charityId: z.string().uuid(),
  charityName: z.string(),
  coverImageUrl: z.string().url().optional(),
  priceTwd: z.number().int().nonnegative(), // TWD 整數
  categories: z.array(CategoryKeyEnum).optional(),
})
export type Item = z.infer<typeof Item>

/** 聯集；卡片 component 依 resource 分派渲染（spec 003e1/e2/e3） */
export const AnyResourceItem = z.union([Charity, Donation, Item])
export type AnyResourceItem = z.infer<typeof AnyResourceItem>

export const ListPage = z.object({
  items: z.array(AnyResourceItem),
  nextCursor: z.string().nullable(),
})
export type ListPage = z.infer<typeof ListPage>

// —— Backend response shape ——
//
// v0.4：per-resource extension 對齊截圖補件欄位（coverImageUrl / charityId / charityName / priceTwd / categories）。
// BFF 從 backend 取得的 raw shape 帶 createdAt/updatedAt，BFF 轉發給前端時 strip。
export const BackendCharityListItem = Charity.extend({
  createdAt: z.string(),
  updatedAt: z.string(),
})
export const BackendDonationListItem = Donation.extend({
  createdAt: z.string(),
  updatedAt: z.string(),
})
export const BackendItemListItem = Item.extend({
  createdAt: z.string(),
  updatedAt: z.string(),
})
export const BackendListItem = z.union([
  BackendCharityListItem,
  BackendDonationListItem,
  BackendItemListItem,
])
export const BackendListResponse = z.object({
  items: z.array(BackendListItem),
  pageInfo: z.object({
    nextCursor: z.string().nullable(),
    hasMore: z.boolean(),
  }),
})
```

> v0.4：per-resource schema 對應卡片 layout 差異（spec 003e1/003e2/003e3）。BFF `createListRoute` 依 resource 切換 schema：`charity` 用 `BackendCharityListItem`、`donation` 用 `BackendDonationListItem`、`item` 用 `BackendItemListItem`，避免共用 `ResourceListItem` 把 `priceTwd` 等必有欄位變成 optional 而失去型別保障。
>
> v0.2 → v0.4 演進：v0.2 三 tab 共用 `ResourceListItem` 因 Figma 只給 charity card；v0.4 補件後三 tab card 各自需要不同欄位（cover image、price、charity 關聯），維持共用 shape 會把卡片元件的 prop 型別撐爆，故拆。

---

## 4. Mock fixture — `src/lib/mock/`

`USE_MOCK=1` 時 BFF 走 mock dispatch（spec 001a §8）。

### 4.1 Generic handler

```ts
// src/lib/mock/makeListHandler.ts
import 'server-only'

/**
 * Generic — 接 per-resource fixture array 與 minimum shape（含 name / description /
 * 可選 category / 可選 categories[]）。三 tab 各自 fixture array 在 4.2 設定。
 */
export function makeListHandler<T extends {
  name: string
  description: string
  category?: string
  categories?: string[]
}>(fixtures: T[]) {
  return (opts: { query?: Record<string, unknown> }) => {
    const q = String(opts.query?.q ?? '').toLowerCase()
    const category = opts.query?.category as string | undefined  // v0.3 新增
    const limit = Number(opts.query?.limit ?? 10)
    const cursorIdx = opts.query?.cursor ? Number(opts.query.cursor) : 0
    let filtered: BackendListItem[] = fixtures
    if (category) {
      // donation / item 可能用 categories[]，charity 用 category 單值；兩者都試
      filtered = filtered.filter(
        (c) =>
          c.category === category || c.categories?.includes(category),
      )
    }
    if (q) {
      filtered = filtered.filter(
        (c) =>
          c.name.toLowerCase().includes(q) ||
          c.description.toLowerCase().includes(q),
      )
    }
    const page = filtered.slice(cursorIdx, cursorIdx + limit)
    const hasMore = cursorIdx + limit < filtered.length
    return {
      items: page,
      pageInfo: {
        nextCursor: hasMore ? String(cursorIdx + limit) : null,
        hasMore,
      },
    }
  }
}
```

### 4.2 Per-resource fixtures

每個 tab 用對應的 `Backend*ListItem` 型別（[§3.2](#32-list-schemas--srclibschemaslistts)）。範例：

```ts
// src/lib/mock/charity-fixtures.ts
import 'server-only'
import { makeListHandler } from './makeListHandler'
import type { z } from 'zod'
import type { BackendCharityListItem } from '@/lib/schemas/list'

type CharityFixture = z.infer<typeof BackendCharityListItem>
const FIXTURES: CharityFixture[] = [
  {
    id: 'c01...',
    name: '財團法人流浪動物基金會',
    description: '致力於流浪動物收容、結紮、認養媒合與動保倡議。',
    logoUrl: 'https://cdn.example.com/charities/animal-fund.png',
    category: 'animal_protection',
    categories: ['animal_protection'],
    createdAt: '2026-06-13T01:23:45.678Z',
    updatedAt: '2026-06-13T01:23:45.678Z',
  },
  /* +24 筆 */
]
export const charityListHandler = makeListHandler(FIXTURES)
```

```ts
// src/lib/mock/donation-fixtures.ts
import 'server-only'
import { makeListHandler } from './makeListHandler'
import type { z } from 'zod'
import type { BackendDonationListItem } from '@/lib/schemas/list'

type DonationFixture = z.infer<typeof BackendDonationListItem>
const FIXTURES: DonationFixture[] = [
  {
    id: 'd01...',
    name: '為流浪動物築一個家',
    description: '幫助北部收容所擴建設施，給流浪犬貓更舒適空間。',
    charityId: 'c01...',
    charityName: '財團法人流浪動物基金會',
    coverImageUrl: 'https://cdn.example.com/donations/animal-shelter.jpg',
    categories: ['animal_protection', 'community_development'],
    createdAt: '2026-06-13T...',
    updatedAt: '2026-06-13T...',
  },
  /* +24 筆 */
]
export const donationListHandler = makeListHandler(FIXTURES)
```

```ts
// src/lib/mock/item-fixtures.ts
import 'server-only'
import { makeListHandler } from './makeListHandler'
import type { z } from 'zod'
import type { BackendItemListItem } from '@/lib/schemas/list'

type ItemFixture = z.infer<typeof BackendItemListItem>
const FIXTURES: ItemFixture[] = [
  {
    id: 'i01...',
    name: '流浪動物公益月曆 2027',
    description: '12 個月封面為救援動物實照，收益全數投入動物醫療基金。',
    charityId: 'c01...',
    charityName: '財團法人流浪動物基金會',
    coverImageUrl: 'https://cdn.example.com/items/calendar-2027.jpg',
    priceTwd: 380,
    categories: ['animal_protection'],
    createdAt: '2026-06-13T...',
    updatedAt: '2026-06-13T...',
  },
  /* +24 筆 */
]
export const itemListHandler = makeListHandler(FIXTURES)
```

### 4.3 註冊

```ts
// src/lib/mock/index.ts
import 'server-only'
import { registerMock } from './dispatch'
import { charityListHandler } from './charity-fixtures'
import { donationListHandler } from './donation-fixtures'
import { itemListHandler } from './item-fixtures'

registerMock('/user/v1/donation/charities', charityListHandler)
registerMock('/user/v1/donation/donation-projects', donationListHandler)
registerMock('/user/v1/donation/sale-items', itemListHandler)
```

### 4.4 Fixture 內容約定

- 每組 ≥ 25 筆（最大 limit 為 charity=10，足夠演 3 頁滾動；donation/item limit 較小，演更多頁）
- 每組 ≥ 2 筆能命中「流浪動物」關鍵字（e2e 搜尋測試共用）
- 每組涵蓋 ≥ 4 個 [§3.1 CategoryKey](#31-categories-categorykey-來自-backend-015-7)（demo + e2e 都能切換）
- 完整 ISO 8601 `createdAt` / `updatedAt`
- **per-resource 必有欄位**：
  - charity：`logoUrl`（≥ 80% 筆）
  - donation：`coverImageUrl` + `charityName` + `categories[]`（≥ 80% 筆）
  - item：`coverImageUrl` + `charityName` + `priceTwd`（**必有**，每筆都得有，配合 003e3 假設 `priceTwd` 不 optional）+ `categories[]`

### 4.5 啟用點

`src/instrumentation.ts` 或 `next.config.ts` 的 server boot 在 `USE_MOCK==='1'` 時 import 一次 `@/lib/mock`（觸 eager register）；繼承 spec 001 instrumentation 路線。

---

## 5. Server-side data prefetch

`/donation` page 只 SSR-prefetch **activeTab** 的第一頁；其他 tab 等切換時 client 端首次 fetch。

```ts
// src/app/donation/page.tsx (資料邊界；UI 樹見 spec 003 §3)
import { dehydrate, HydrationBoundary, QueryClient } from '@tanstack/react-query'
import { fetchListPage } from '@/lib/api/client'
import { RESOURCE_KEYS, type ResourceKey } from '@/lib/schemas/list'
import { CATEGORY_KEYS, type CategoryKey } from '@/lib/schemas/categories'

function parseTab(raw?: string): ResourceKey {
  return RESOURCE_KEYS.includes(raw as ResourceKey) ? (raw as ResourceKey) : 'charity'
}

function parseCategory(raw?: string): CategoryKey | null {
  return CATEGORY_KEYS.includes(raw as CategoryKey) ? (raw as CategoryKey) : null
}

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; tab?: string; category?: string }>
}) {
  const { q = '', tab, category } = await searchParams
  const activeTab = parseTab(tab)
  const activeCategory = parseCategory(category)
  const trimmed = q.trim()
  const queryClient = new QueryClient()
  await queryClient.prefetchInfiniteQuery({
    queryKey: ['list', activeTab, { q: trimmed, category: activeCategory }],
    queryFn: ({ pageParam }) =>
      fetchListPage({
        resource: activeTab,
        q: trimmed,
        cursor: pageParam,
        category: activeCategory ?? undefined,
      }),
    initialPageParam: undefined,
  })
  return (
    <HydrationBoundary state={dehydrate(queryClient)}>
      {/* spec 003 §3 的 <CharityListShell initialQ initialTab initialCategory /> */}
    </HydrationBoundary>
  )
}
```

> Next 16：`searchParams` 是 Promise，須 await。

---

## 6. Client 資料層

### 6.1 Provider

```ts
// src/app/providers.tsx
'use client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { useState } from 'react'

export function Providers({ children }: { children: React.ReactNode }) {
  const [client] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 30_000,
            retry: 1,
            refetchOnWindowFocus: false,
          },
        },
      }),
  )
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>
}
```

### 6.2 fetch wrapper

```ts
// src/lib/api/client.ts
import { ListPage, RESOURCE_TO_PATH, type ResourceKey } from '@/lib/schemas/list'
import type { CategoryKey } from '@/lib/schemas/categories'

export async function fetchListPage(params: {
  resource: ResourceKey
  q: string
  cursor?: string
  category?: CategoryKey | null
}) {
  const path = RESOURCE_TO_PATH[params.resource]
  const url = new URL(
    path,
    typeof window === 'undefined'
      ? process.env.NEXT_PUBLIC_BASE_URL ?? 'http://localhost:3000'
      : window.location.origin,
  )
  if (params.q) url.searchParams.set('q', params.q)
  if (params.cursor) url.searchParams.set('cursor', params.cursor)
  if (params.category) url.searchParams.set('category', params.category)
  const res = await fetch(url.toString(), { credentials: 'include' })
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as {
      error?: { message?: string }
    } | null
    throw new Error(body?.error?.message ?? `HTTP ${res.status}`)
  }
  const json = (await res.json()) as { data: unknown }
  return ListPage.parse(json.data)
}
```

### 6.3 useResourceListInfinite hook

```ts
// src/lib/query/list.ts
import { useInfiniteQuery } from '@tanstack/react-query'
import { fetchListPage } from '@/lib/api/client'
import type { ResourceKey } from '@/lib/schemas/list'
import type { CategoryKey } from '@/lib/schemas/categories'

export function useResourceListInfinite(opts: {
  resource: ResourceKey
  q: string
  category: CategoryKey | null  // v0.3 新增
  enabled?: boolean
}) {
  return useInfiniteQuery({
    queryKey: ['list', opts.resource, { q: opts.q, category: opts.category }],
    queryFn: ({ pageParam }) =>
      fetchListPage({
        resource: opts.resource,
        q: opts.q,
        cursor: pageParam,
        category: opts.category ?? undefined,
      }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.nextCursor ?? undefined,
    enabled: opts.enabled ?? true,
  })
}
```

> queryKey 含 `category`：不同 category 的查詢各自獨立 cache；切換 category 不會污染其他 cache，30s `staleTime` 內回切立即命中。

**Lazy 切換用法**：

```ts
// inside <CharityListShell> (spec 003i)
const charity  = useResourceListInfinite({ resource: 'charity',  q: debouncedQ, category, enabled: activeTab === 'charity'  })
const donation = useResourceListInfinite({ resource: 'donation', q: debouncedQ, category, enabled: activeTab === 'donation' })
const item     = useResourceListInfinite({ resource: 'item',     q: debouncedQ, category, enabled: activeTab === 'item'     })
```

切到 `donation` 才打 `/api/donations`；切回 `charity` 30s 內取 cache，不重打。

---

## 7. Client-side hooks

### 7.1 `useDebouncedValue`

```ts
// src/lib/hooks/useDebouncedValue.ts
import { useEffect, useState } from 'react'

export function useDebouncedValue<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delayMs)
    return () => clearTimeout(t)
  }, [value, delayMs])
  return debounced
}
```

### 7.2 `useUrlSync`（q + tab 同步）

```ts
// src/lib/hooks/useUrlSync.ts
'use client'
import { useEffect } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'

export function useUrlSync(params: Record<string, string | undefined>) {
  const router = useRouter()
  const searchParams = useSearchParams()
  useEffect(() => {
    const next = new URLSearchParams(searchParams.toString())
    for (const [k, v] of Object.entries(params)) {
      if (v && v.length > 0) next.set(k, v)
      else next.delete(k)
    }
    const newQs = next.toString()
    const currentQs = searchParams.toString()
    if (newQs === currentQs) return // 已同步，避免無限 loop
    router.replace(newQs ? `?${newQs}` : '', { scroll: false })
  }, [router, searchParams, ...Object.values(params)])
}
```

> **必須 guard `newQs === currentQs`**：
> `router.replace` 在 Next 16 dev 會觸發 RSC payload fetch（即使 URL 相同）；
> `useSearchParams` 是 useEffect deps、會在每次 navigation 回來時換 reference；
> 不 guard → `replace → searchParams 新 ref → effect 再 fire → 又 replace` 無限迴圈，
> 對使用者觀感為「進列表頁後不停 call /donation」。

呼叫：

```ts
useUrlSync({
  q: debouncedQ,
  tab: activeTab === 'charity' ? undefined : activeTab,
  category: selectedCategory ?? undefined,  // v0.3 新增；null 表「全部」不寫入 URL
})
```

`activeTab === 'charity'`（default）→ URL 不帶 `?tab=`。
`selectedCategory === null`（「全部」）→ URL 不帶 `?category=`。
都不帶時 URL 為 `/donation`。

### 7.3 `useScrollPercentSentinel`（**取代 v0.1 IntersectionObserver-rootMargin**）

對應 brief「scroll bar 距底剩 5%~10% 觸發」：

```ts
// src/lib/hooks/useScrollPercentSentinel.ts
'use client'
import { useEffect, useRef } from 'react'

export function useScrollPercentSentinel(opts: {
  enabled: boolean
  /** 觸發閾值；0.1 = 「距底 10% 內」觸發。預設 0.1。 */
  threshold?: number
  onTrigger: () => void
}) {
  const fired = useRef(false)
  useEffect(() => {
    if (!opts.enabled) {
      fired.current = false
      return
    }
    const threshold = opts.threshold ?? 0.1
    function check() {
      const doc = document.documentElement
      const scrollTop = doc.scrollTop || window.scrollY
      const distFromBottom = doc.scrollHeight - scrollTop - doc.clientHeight
      const percentFromBottom =
        distFromBottom / Math.max(doc.scrollHeight, 1)
      if (percentFromBottom <= threshold) {
        if (!fired.current) {
          fired.current = true
          opts.onTrigger()
        }
      } else {
        fired.current = false
      }
    }
    check() // 初始檢查（content 不夠長時直接觸）
    window.addEventListener('scroll', check, { passive: true })
    window.addEventListener('resize', check, { passive: true })
    return () => {
      window.removeEventListener('scroll', check)
      window.removeEventListener('resize', check)
    }
  }, [opts.enabled, opts.threshold, opts.onTrigger])
}
```

| 行為 | 細節 |
|---|---|
| 首次 `percentFromBottom ≤ threshold` | 觸 onTrigger 一次；內部 `fired=true` 避免重複 |
| 離開觸發區（user scroll 回上面） | `fired=false`，下次再進可重觸 |
| `enabled=false`（fetching / 到底） | 不註冊 listener |
| 內容不夠長 | 初次 `check()` 直接觸（distFromBottom 為 0） |

> 為何不用 IntersectionObserver：v0.1 `rootMargin: '200px'` 是「絕對距離」；長頁面跟短頁面行為不同。改 scroll-percent 是 brief 的明確要求。
>
> 為何用 `useRef` 不用 state 控 `fired`：避免值變動 re-render，listener 輕量。

---

## 8. Tab + Category state 流（與 spec 003 §3 共用）

```
URL              ?tab=donation&q=foo&category=animal
  ↓ Next 16 RSC searchParams
<Page>
  └─ initialTab = parseTab('donation') = 'donation'
  └─ initialCategory = parseCategory('animal') = 'animal'
  └─ prefetchInfiniteQuery(['list','donation',{q:'foo',category:'animal'}])
        ↓
<CharityListShell initialQ initialTab initialCategory>
  ├─ activeTab state         = 'donation'
  ├─ selectedCategory state  = 'animal'
  ├─ isMenuOpen state        = false
  ├─ draft state = 'foo'  → useDebouncedValue → debouncedQ = 'foo'
  ├─ useUrlSync({ q, tab, category })
  ├─ <FilterButton label="流浪動物" onClick={()=>setMenuOpen(o=>!o)} isOpen={isMenuOpen} />
  ├─ {isMenuOpen && <CategoryMenu selectedCategory onSelect={setCategory} onClose />}
  ├─ <TabsRow active={activeTab} onTabChange={setActiveTab} />
  └─ 3 個 useResourceListInfinite，all 收同 category；enabled = (resource === activeTab)
     ↓
     active hook 打 /api/donations?q=foo&category=animal；其他 idle
```

切 tab → `setActiveTab('item')` → `useUrlSync` 改 URL → 對應 hook `enabled=true` → fetch（帶現有 category）。
切 category → `setCategory('education')` → 三 tab 對應 queryKey 都變動，但只 active 的 fetch。

---

## 9. 測試清單

### 9.1 BFF generic route

| # | 案例 | 期望 |
|---|---|---|
| 1a | `createListRoute('/v1/X')` 無 `opts.limit` → backend 收 `limit=10 sort=createdAt:desc` | 對（default） |
| 1b | `createListRoute('/v1/X', { limit: 5 })` → backend 收 `limit=5`（v0.5） | 對 |
| 1c | `createListRoute('/v1/X', { limit:4, tabletLimit:6, desktopLimit:12 })` + `?viewport=mobile\|tablet\|desktop` → backend `limit=4/6/12`；省略 viewport → `4`（v0.6） | 對 |
| 1d | `viewport=tablet` 但 route 未設 tabletLimit → 退回 limit（v0.6） | 對 |
| 1e | `?viewport=phone` 等非白名單值 → 400 `VALIDATION_ERROR` | 對 |
| 2 | `?q=foo` → backend 收 `q=foo` | 對 |
| 3 | `?q=  ` 全空白 → backend 不收 `q` | 對 |
| 4 | `?q=` 超 80 字 → 400 `VALIDATION_ERROR` | 對 |
| 5 | backend 200 happy → 200 + envelope；`createdAt`/`updatedAt` 不在 client 可見 | 對 |
| 6 | backend response 缺欄位 → 502 `CONTRACT_VIOLATION` | 對 |
| 7 | backend 5xx → 502；timeout → 504 | 對 |
| 8 | Response `Cache-Control: no-store, private` | 對 |
| 9 | charities / donations / items 三個 route 都呼叫對應上游 path | 對 |
| 10 | `?category=animal` → backend 收 `category=animal` | 對 |
| 11 | `?category=unknown` → 400 `VALIDATION_ERROR`（Zod enum 守在 BFF） | 對 |

### 9.2 Schemas

- `ListQuery.parse({})` 過、`q` 81 字失敗
- `ResourceListItem` 允許 `logoUrl` / `category` 省略
- `ListPage.parse({ items: [], nextCursor: null })` 過

### 9.3 Mock fixtures

- `charityListHandler({})` 回前 10 筆，`nextCursor !== null`
- 連 3 頁能拿全部，最後一頁 `nextCursor === null`
- `q='流浪動物'` 結果全含關鍵字
- `q='zxq'` 回空 array
- `category='animal'` 結果全部 `category === 'animal'`
- `category='animal'` + `q='流浪動物'` 兩條件 AND
- donation / item handler 同 case 都通過

### 9.4 Hooks

- `useDebouncedValue` — 連 5 次 set 在 300ms 內、只更新 1 次
- `useResourceListInfinite({ enabled: false })` — 不觸 fetch
- `useResourceListInfinite({ resource: 'donation', q: 'x', category: null })` — queryKey 為 `['list','donation',{q:'x',category:null}]`
- `useResourceListInfinite({ resource: 'donation', q: 'x', category: 'animal' })` — queryKey 含 `category:'animal'`，不同 cache
- `useUrlSync({ q: 'x', tab: 'donation', category: 'animal' })` → router.replace(`?q=x&tab=donation&category=animal`)
- `useUrlSync({ q: '', tab: undefined, category: undefined })` → router.replace(`''`)
- `useScrollPercentSentinel`
  - `enabled=false` → 不註冊 listener
  - 初次 `percentFromBottom ≤ threshold` 立即觸 1 次（mock document）
  - 同 viewport 不重複觸；離開觸發區後再進可重觸
  - `enabled=false` 動態切回 false → cleanup 移除 listener

---

## 10. 驗收條件

當以下都成立時，本 spec 視為**已實作**：

- [ ] `createListRoute` factory（**v0.4 改 `{ upstreamPath, backendItemSchema, project }` 簽名**）三個 endpoint 都通過 §9.1 測試
- [ ] BFF response：donation 含 `coverImageUrl` / `charityName`、item 含 `priceTwd` / `charityName`；createdAt / updatedAt 在 client envelope 不可見
- [ ] `USE_MOCK=1` 時 dev / e2e 不需 backend 起著也能跑通三 tab 列表
- [ ] `useResourceListInfinite({ enabled: false })` 不打網路（spy `fetch` count = 0）
- [ ] 三 tab queryKey 各自隔離（切換 tab 不洗 cache，30s 內回切 hit cache）
- [ ] Scroll-percent sentinel 在「距底 ≤ 10%」觸發 onTrigger 一次；離開後可重觸
- [ ] URL `?q=&tab=&category=` 同步、refresh 保留；`tab=charity` / `category=null`（全部）屬 default 不寫入 URL
- [ ] `?category=unknown` 被 BFF Zod 守，回 400 而非透傳給 backend
- [ ] 切換 category 三 tab queryKey 都更新，但只 active tab 打網路
- [ ] `pnpm lint` + `pnpm typecheck` + `pnpm test` 綠
- [ ] 業務字眼（`charity` / `donation` / `item`）只出現在 schemas / hooks / routes / fixtures，**不在** `src/lib/{api,errors,log,mock/dispatch,security,session,schemas/envelope,schemas/pagination,config.ts,log.ts,lifecycle.ts}/`

---

## 11. 開放問題

- **每個 tab 的搜尋是否獨立 q**：目前共用 `debouncedQ`，切 tab 也帶同 q。若評審覺得「切 tab 該清空搜尋」，把 `q` 放 queryKey 但切 tab 時 `setDraft('')`。本 spec v0.2 不做
- **prefetch 鄰近 tab**：目前只 prefetch activeTab；可加「user hover tab label > 300ms 就 prefetch」，但 mobile 無 hover，效益有限
- **三 tab 卡片欄位差異**：v0.2 共用 `ResourceListItem`；當 Figma / backend 補設計，再 `.extend()` 各自 schema
- **`%` / `_` SQL escape**：backend 016 §13 開放，BFF 不處理
- **Rate-limit 429 上傳**：UI 處理屬 spec 003 範疇
- **`NEXT_PUBLIC_BASE_URL`**：RSC fetch 需絕對 URL；要不要納入 env validation？目前 fallback localhost
- **scroll-percent vs IntersectionObserver**：scroll listener 比 IO 多一些主執行緒成本，但符合 brief 字面。若 mobile 卡可考慮 hybrid（IO + `rootMargin: '10vh'` 近似 10%）

---

## 12. 變更紀錄

| 版本 | 日期 | 變更 |
|---|---|---|
| 0.1 | 2026-06-13 | 初版（單 tab charity，limit 20，IntersectionObserver rootMargin） |
| 0.2 | 2026-06-14 | 三 tab：generic factory + `?tab=` + lazy enabled + limit=10 + scroll-percent sentinel |
| 0.3 | 2026-06-14 | Categories filter：§3.1 categories schema（6 keys hardcoded 對齊 backend 015 §7）+ `ListQuery.category` + queryKey 加 category + `useUrlSync` 加 category + mock handler filter + UI 串 [003k](./003k-filter-button.md) / [003m](./003m-category-menu.md) |
| 0.4 | 2026-06-14 | 截圖補件配套：(a) categories 6 → 16；(b) per-resource schema 拆 `Charity` / `Donation` / `Item`（加 `coverImageUrl` / `charityId` / `charityName` / `priceTwd` / `categories[]`）；(c) `createListRoute` 從 `(upstreamPath)` 改 `{ upstreamPath, backendItemSchema, project }` 接收 per-resource Zod schema 與投影函式；(d) `BackendListItem` 拆 `BackendCharityListItem` / `BackendDonationListItem` / `BackendItemListItem` 三種 raw shape |
| 0.4 | 2026-06-14 | 補件 IMG_4875-4883：§3.1 categories 6 → 16 + rename keys 對齊 displayName（`animal` → `animal_protection` 等）；§3.2 per-resource schema 拆分（Charity / Donation + cover/charity / Item + cover/charity/priceTwd），對應 spec 003e1/e2/e3 卡片 layout 差異 |
| 0.5 | 2026-06-14 | **Per-tab limit**：`createListRoute` 加 `opts.limit?: number`（default 10）；三條 route 各設 `charity=10` / `donation=5` / `item=4`，理由：mobile 寬度下卡片視覺密度不同（row / 16:9 / 2 欄 square），需要不同的 batch size 才不會「滑一下就 fetch」或「滑很久才 fetch」。對應 brief.md v0.7 同步更新 |
| 0.6 | 2026-06-15 | **Viewport-aware limits**：item tab 在 `md:` / `lg:` grid 由 2 → 3 → 4 欄變化，單一 limit 不夠 → 加 `opts.tabletLimit` / `desktopLimit`；item 設 `limit:4 / tabletLimit:6 / desktopLimit:12`；`ListQuery` 加 `viewport: enum(['mobile','tablet','desktop']).optional()`；新增 `useViewport()` hook（兩個 matchMedia：`min-width:768px` + `min-width:1024px`，對齊 Tailwind `md:` / `lg:`，SSR 預設 mobile）；`useResourceListInfinite` 接 `viewport` 並寫入 queryKey 與 URL；CharityListShell 頂層呼叫 `useViewport()` 串給三個 hook。對應 brief.md v0.8 |
| 0.7 | 2026-06-15 | **Charity desktop limit 擴 30**：charity tab 原本 mobile/tablet/desktop 都吃 mobile 10/page；desktop `lg:grid-cols-3` 下 10 筆只填 ~3 列，留白偏多。加 `desktopLimit: 30`（10 列 × 3 欄），讓桌機首屏即填滿 grid。tablet 仍 fallback 到 mobile 10（5 列 × 2 欄足夠首屏，不過度抓）。donation 暫不擴。`createListRoute` 行為不變（v0.6 已支援 `desktopLimit` fallback），純配置調整。新增 colocated `charities/route.test.ts` 4 個 viewport wiring case |
| 0.8 | 2026-06-15 | **Donation tablet limit 擴 8**：donation tab tablet 寬度下 `md:grid-cols-2` × 4 列 = 8 筆，配合 16:9 cover 約半屏的視覺密度（mobile 仍 5、desktop 沿用 5 不擴）。`createListRoute` 行為不變。新增 colocated `donations/route.test.ts` 4 個 viewport wiring case |
| 0.9 | 2026-06-16 | **Upstream path cutover 到 `/user/v1/donation/*`**（對齊 [backend spec 023 §2.4](../../../backend/docs/specs/023-api-routing-versioning.md)）：BE 重組三個 URL surface（`/auth` / `/user/v{N}` / `/cms`），公開 reads 從 `/v1/donation/*` 移到 `/user/v1/donation/*`。FE 端 `src/app/api/{charities,donations,items,categories}/route.ts` upstream / mock register / createListRoute / createDetailRoute / mock dispatch 註解全部同步更新。所有 BFF / mock register / createListRoute 測試的 URL 斷言同步替換；746 unit/integration 全綠。`/v1/donations` / `/v1/items` 兩個本檔早期假設的 placeholder path 也對齊到 BE 實際命名（`donation-projects` / `sale-items`）。 |
