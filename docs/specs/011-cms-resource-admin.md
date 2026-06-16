# Spec 011：CMS 資源管理（charity / project / item，index）

- **狀態**：Draft（v0.2 — self-audit 修正：BFF 改用既有 `createRoute` + 新 `createAdminRoute` helper；session migration / 登入路徑更新表 / BE GET endpoint 硬依賴 寫清）
- **建立日期**：2026-06-16
- **依賴**：
  - [BE spec 020 donation write API](../../../backend/docs/specs/020-donation-write-api.md) — 23 個 /cms admin endpoint
  - [BE spec 023 API routing/versioning](../../../backend/docs/specs/023-api-routing-versioning.md) — `/cms/*` prefix + admin auth scope
  - [BE spec 024 CUD invariant](../../../backend/docs/specs/024-cud-surface-invariant.md) — 所有 entity write 一律走 `/cms`
  - [BE spec 015 charity data model](../../../backend/docs/specs/015-charity-data-model.md) — lifecycle 5 欄（displayOrder / archivedAt / deletedAt / publishStartAt/End）
  - [BE spec 018 presign upload](../../../backend/docs/specs/018-presign-upload.md) — S3 presign（v0.3+ 才會用）
  - [FE spec 010 CMS auth gate](./010-cms-auth-gate.md) — `/cms` proxy + RSC gate（目前只驗 session 存在；本 spec v0.1 補 role 檢查）
  - [FE spec 005 §4 smart back](./005-homepage-auth.md#4-smart-back-navigation-v02-新增) + [003b TopNav](./003b-topnav.md) — 返回 / TopNav primitive
- **使用方**：
  - [011a CmsCharityAdmin](./011a-cms-charity-admin.md) — v0.1 MVP（list + create + edit）
  - 011b CmsDonationProjectAdmin — v0.2+（待 011a 走通後複製）
  - 011c CmsSaleItemAdmin — v0.2+
  - [011d CmsAdminUiPrimitives](./011d-cms-admin-ui-primitives.md) — form fields / table / page shell 等共用 primitive

---

## 1. 為何拆 spec（family architecture）

backend 020 對 charity / project / item 三個 resource 暴露**結構幾乎相同**的 CRUD + lifecycle endpoint（各 6 個，共 18 個；加 category 5 個共 23 個）：

| Resource | Create | Edit | Delete (soft) | Archive | Unarchive | Restore |
|---|---|---|---|---|---|---|
| Charity | `POST /cms/donation/charities` | `PATCH /cms/donation/charities/:id` | `DELETE` | `POST /:id/archive` | `POST /:id/unarchive` | `POST /:id/restore` |
| DonationProject | `POST /cms/donation/donation-projects` | `PATCH` | `DELETE` | archive | unarchive | restore |
| SaleItem | `POST /cms/donation/sale-items` | `PATCH` | `DELETE` | archive | unarchive | restore |

→ FE 三條 admin 路徑 (`/cms/charities`、`/cms/donation-projects`、`/cms/sale-items`) **結構也應該幾乎相同**：list + create + edit + lifecycle action 4 個。

對齊 009 family 的拆法：

| Spec | 職責 | 對應 |
|---|---|---|
| **011 index**（本檔） | 共同決策：routing、auth gate、BFF pattern、表單套路、lifecycle UX、image upload 策略；sub-spec 索引；變更紀錄上層 | — |
| **011a charity admin** | charity 一份完整 reference：list / create / edit / lifecycle / BFF endpoints / TDD 三層測試 | 對應 BE 020 §4 §5 §6 §7 §8 §9 charity 系列 |
| **011b project admin** | 結構性 diff vs 011a（80%+ 相同）：FK `charityId`、cover image、`raisingApprovalNo` / `reliefApprovalNo` 兩欄 | 對應 BE 020 §10 §11 §12 §13 |
| **011c item admin** | 結構性 diff vs 011a：`priceTwd` 必填、cover image | 對應 BE 020 §15 §16 §17 §18 |
| **011d admin UI primitives** | `<Input>` / `<Textarea>` / `<FormField>` / `<Select>` / `<MultiSelectChips>` / `<NumberInput>` / `<DateTimeInput>` / `<AdminTable>` / `<AdminPageShell>` / `<ConfirmDialog>` | 對齊 009c 「primitive vs business form 分檔」 |

> v0.1 只寫 **011 + 011a + 011d**（charity-first thin slice）。011b / 011c 等 011a impl 走通後再 copy + diff。

---

## 2. Routing — FE admin 頁面 URL surface

對齊 BE [023 §2.3 / §2.4](../../../backend/docs/specs/023-api-routing-versioning.md) `/cms/*` 不版本化的決策，**FE admin 頁面也用 `/cms/*` 路徑**（呼應而非綁定 — FE 路由跟 BE 是不同層的 URL，但保持 prefix 一致對使用者心智模型最簡單）。

### 2.1 FE admin 頁面路徑表

| Route | 渲染 | 職責 |
|---|---|---|
| `/cms` | [`src/app/cms/page.tsx`](../../src/app/cms/page.tsx) | 已存在；admin landing + sub-resource entry links |
| `/cms/charities` | `src/app/cms/charities/page.tsx`（**新**） | charity list (admin 視角：含 archived / deleted) |
| `/cms/charities/new` | `src/app/cms/charities/new/page.tsx`（**新**） | charity create form |
| `/cms/charities/[id]/edit` | `src/app/cms/charities/[id]/edit/page.tsx`（**新**） | charity edit form |
| `/cms/donation-projects` 等 | 011b 規劃 | 同 charity pattern |
| `/cms/sale-items` 等 | 011c 規劃 | 同 charity pattern |

v0.1 MVP 只實作 `/cms/charities` + `/cms/charities/new` + `/cms/charities/[id]/edit` 三條。

### 2.2 為何不做共同 `/cms/[resource]` 動態路由

技術上 `/cms/[resource]/page.tsx` + `/cms/[resource]/[id]/edit/page.tsx` 可以三個 resource 共用一份檔案。**不做**的理由：

- 三個 resource 雖然 CRUD 結構相似、**欄位不同**（charity 沒 priceTwd，item 有；project 兩個 approvalNo，charity 一個 approvalNo + categoryIds）
- 共用 page.tsx 必須在 runtime 用 `params.resource` 動態 dispatch 到對應 form / list 設定 — 增加心智負擔，型別錯誤難察覺
- 三個獨立 route 各 import 自己的 form / list 元件，型別最直接、無 runtime dispatch
- 重複的「布局 / topnav / BFF wiring」抽進 [011d](./011d-cms-admin-ui-primitives.md) primitive；剩下 page-level 程式碼極短，重複可接受

對齊既有 `/charities/[id]` vs `/donation-projects/[id]` vs `/sale-items/[id]` 三條獨立 RSC 的慣例。

### 2.3 TopNav 設定（每頁）

依 [003b v0.5 backHref](./003b-topnav.md) 規則：

| Page | TopNav title | onBack 行為 |
|---|---|---|
| `/cms/charities` | 「公益團體」 | `backHref="/cms"` |
| `/cms/charities/new` | 「新增公益團體」 | `backHref="/cms/charities"`（回 list、不回 dashboard） |
| `/cms/charities/[id]/edit` | 「編輯公益團體」 | `backHref="/cms/charities"` |

> 為何 `/cms/charities` 不用 smart-back 回上一頁：admin 在 list ↔ edit ↔ list 來回操作時，連按返回應該回 dashboard（`/cms`），不該回到剛編輯完的那筆 detail。固定路徑符合直覺。

v0.2+ 若 admin 操作鏈變深（list → bulk action → confirm → list），再考慮把 backHref 換成更聰明的策略。

---

## 3. Auth 模型

### 3.1 現況 vs 需求

| 項 | 現況 | 011 需求 |
|---|---|---|
| Session 結構 | `StoredSession = { userId, accessToken, accessTokenExpiresAt, refreshToken, refreshTokenExpiresAt, user: { id, name }, csrfToken, createdAt }`（[`src/lib/session/types.ts`](../../src/lib/session/types.ts)） | 加 `role: RoleValue`（對齊 BE `Role.ADMIN = 0` / `USER = 1`） |
| Proxy gate | `src/proxy.ts` 檢查 cookie 存在（[010 §3.1](./010-cms-auth-gate.md)） | 不變（cookie 存在仍是必要條件；role 在 RSC / BFF 驗）|
| Page-level gate | `src/app/cms/page.tsx` 呼 `getSessionService().get()`，null → redirect `/`（[010 §3.2](./010-cms-auth-gate.md)） | 改用 `requireAdminSession()`（[§3.5](#35-requireadminsession-helper-rsc-用)）：null OR non-admin → redirect `/?reason=cms-not-admin` |
| Admin BFF route | 既有 `createRoute()` helper（[`src/lib/api/create-route.ts`](../../src/lib/api/create-route.ts)）已包 auth / CSRF / body parse / Cache-Control / session touch | **新增 `createAdminRoute()` wrapper**（[§3.6](#36-createadminroute-bff-wrapper)）：在 createRoute 之上加 role check；非 admin → 403 |
| CSRF | 既有 `verifyCsrf` 由 createRoute 自動套用（非 safe method 自動驗）；csrfToken 在 StoredSession 內 | **不另立規格**；createRoute 預設 csrfExempt=false 就夠了 |

### 3.2 Session role 擴展（型別與 helper）

```ts
// src/lib/session/types.ts
export const Role = { ADMIN: 0, USER: 1 } as const
export type RoleValue = (typeof Role)[keyof typeof Role]

export type StoredSession = {
  userId: string
  accessToken: string
  accessTokenExpiresAt: number
  refreshToken: string
  refreshTokenExpiresAt: number
  user: { id: string; name: string }
  role: RoleValue            // ← v0.2 新欄
  csrfToken: string
  createdAt: number
}
```

### 3.3 既存 session 的 backward-compat 策略（v0.2 補）

加 `role` 欄後，Redis 內的舊 session 沒這欄。三條路：

| 方案 | 行為 | 採用？ |
|---|---|---|
| **A 部署時清空 Redis sessions namespace** | 全 user 被踢出、需重新登入。乾淨、無歧義 | ✅ **採用**（demo 階段使用者極少，登出無痛；prod 後 OAuth 流程預設都有 role 後再說） |
| B `role` Zod schema 用 `.default(Role.USER)` | 舊 session 解析成功、視為一般使用者 | ❌ 隱性風險：admin 沒被踢、登入後仍是 admin 但漏掉 role；下次 BE refresh token 才補上 |
| C 雙模 schema：v1 / v2 共存 | 過度設計 demo 場景 | ❌ |

實作：iron-session schema 不改，session-service 在 `create()` / `update()` 全面要求 role；舊 session 拿到後 Zod 噴錯 → service 視為 null → 等同登出。具體實作 patch 進 `src/lib/session/types.ts` + 對應 schema。

### 3.4 需配套更新的登入路徑（v0.2 補）

| 路徑 | 動作 |
|---|---|
| [`/api/dev/login`](../../src/app/api/dev/login/route.ts) | `DEV_USER` 物件加 `role: Role.ADMIN`；新增第二條 mock user (`DEV_USER_NORMAL`) 帶 `role: Role.USER`；測試用 query / header 切換（spec 005 dev login 是 demo 入口，沒切換成本） |
| `/api/auth/register`（spec 007） | OAuth callback 拿到 account.role 寫入 session create 的 input；目前還未串 BE role（BE 007 已寫但 FE 路徑可能未消費），實作時補上 |
| password login（spec 008） | 同上：登入 response 含 role；session.create 帶入 |
| `getSessionService().create()` API | input 加上 `role: RoleValue` required；既有 3 條呼叫點全部加上 |

> 此節是 011 spec 的「**前置條件清單**」— 011a impl 開工前**必須**先完成 §3.2 + §3.3 + §3.4 三節的程式改動，否則 admin gate 整套無 role 可驗。

### 3.5 `requireAdminSession()` helper（RSC 用）

```ts
// src/lib/session/requireAdmin.ts（新）
import 'server-only'
import { redirect } from 'next/navigation'
import { getSessionService } from './service'
import { Role, type StoredSession } from './types'

/**
 * RSC 用 admin gate：null / non-admin → redirect /?reason=cms-not-admin
 * （AuthRedirectToast 需新增此 reason；toast.error('需要管理員權限') 樣式）
 */
export async function requireAdminSession(): Promise<StoredSession> {
  const session = await getSessionService().get()
  if (!session) redirect('/?reason=cms-not-admin')
  if (session.role !== Role.ADMIN) redirect('/?reason=cms-not-admin')
  return session
}
```

[`AuthRedirectToast`](../../src/app/AuthRedirectToast.tsx)（[spec 010](./010-cms-auth-gate.md)）需新增 reason `cms-not-admin`，文案：「需要管理員權限」（toast.error 樣式）。

### 3.6 `createAdminRoute()`（BFF wrapper）

BFF 不該手動組 NextResponse；既有 [`createRoute()`](../../src/lib/api/create-route.ts) 已包 auth / CSRF / body Zod / params / query / Cache-Control / session touch / logging。**加一層 `createAdminRoute()` wrapper** 把「session 非 null + role === ADMIN」收成一條 helper，避免每條 admin route 重複寫 role check。

```ts
// src/lib/api/createAdminRoute.ts（新）
import 'server-only'
import type { ZodType } from 'zod'
import { createRoute } from './create-route'
import { ForbiddenError } from '@/lib/errors/ForbiddenError'
import { Role, type StoredSession } from '@/lib/session/types'

type AdminRouteHandlerArgs<TBody, TQuery, TParams> = {
  req: Request
  requestId: string
  body: TBody
  query: TQuery
  params: TParams
  session: StoredSession         // 非 null + 已驗 role
}

type AdminRouteOptions<TBody, TQuery, TParams> = {
  bodySchema?: ZodType<TBody>
  querySchema?: ZodType<TQuery>
  paramsSchema?: ZodType<TParams>
  handler: (
    args: AdminRouteHandlerArgs<TBody, TQuery, TParams>,
  ) => Promise<Response> | Response
}

/**
 * BFF admin route helper。要點：
 *  - requireAuth: true（無 session → createRoute throw UnauthenticatedError → 401）
 *  - csrfExempt: false（預設；createRoute 自動驗 csrfToken on POST/PATCH/DELETE）
 *  - 多一層 role check：session.role !== ADMIN → throw ForbiddenError → 403
 */
export function createAdminRoute<TBody = undefined, TQuery = undefined, TParams = undefined>(
  opts: AdminRouteOptions<TBody, TQuery, TParams>,
) {
  return createRoute({
    requireAuth: true,
    bodySchema: opts.bodySchema,
    querySchema: opts.querySchema,
    paramsSchema: opts.paramsSchema,
    handler: async (args) => {
      if (args.session.role !== Role.ADMIN) {
        throw new ForbiddenError('admin role required')
      }
      return opts.handler({ ...args, session: args.session })
    },
  })
}
```

`ForbiddenError` 對應錯誤碼 `FORBIDDEN`、HTTP 403；若 [`src/lib/errors/`](../../src/lib/errors/) 沒有，新增（仿 [`UnauthenticatedError`](../../src/lib/errors/UnauthenticatedError.ts)）+ [`toErrorResponse`](../../src/lib/errors/toErrorResponse.ts) 加 case。

### 3.7 RSC + BFF 雙層 admin gate

防禦深度：

1. **Proxy（edge）**：cookie 存在性檢查；無 cookie → bounce `/`（既有 [010 §3.1](./010-cms-auth-gate.md)）
2. **RSC**：每條 `/cms/charities*` page.tsx 呼 `requireAdminSession()`（§3.5）→ null / non-admin → redirect
3. **BFF route**：每條 `/api/cms/*` route.ts 用 `createAdminRoute()`（§3.6）→ 401 / 403

正常情況三層都通過；任一層失敗皆能擋下。

---

## 4. 共同決策（跨 charity / project / item）

| 決策 | 載於 | 在這裡複述的理由 |
|---|---|---|
| **BFF Zod schema 跟 BE 020 TypeBox 對齊** | [§5](#5-bff-route-handler-架構) | charity / project / item 三條 BFF 都要 mirror BE 對應 TypeBox 完整欄位 + 範圍；任一不對齊 → 400 |
| **`PATCH` 採 partial-update 語意** | BE 020 §6 / §11 / §16 | FE form 一律送「使用者編輯過的全部欄位」，未編輯欄位不送（避免 null 誤覆蓋）；form state 用 dirty tracking |
| **Form state 用 useReducer** | [011d §2.x](./011d-cms-admin-ui-primitives.md) | 對齊 [008b §3.2](./008b-donation-settings-sheet.md) / [009a §5.4](./009a-donation-confirm.md) 既有套路 — 三層測試（reducer pure → hook → component）一致 |
| **Client-side validation = 軟攔截；BE 是 source of truth** | §5 | FE Zod 只擋明顯錯誤（必填、長度上限）以給即時 feedback；submit 後若 BE 回 400 / 422 → toast.error + 高亮對應欄位（v0.2+） |
| **送出成功 → `router.replace(/cms/{resource})` 回 list** | §2 | 對齊 009a v0.6 「confirm 頁完成任務後不留 history」 — admin save 完不該按返回看到 edit 頁、又能再點送出 |
| **送出失敗 → 留在 form 頁 + `toast.error('操作失敗，請稍後再試')`** | §5 | 對齊 009a v0.5 失敗路徑；保留使用者剛填的內容、不洗掉 |
| **BFF 一律用 `createAdminRoute`** | [§3.6](#36-createadminroute-bff-wrapper) | 集中 admin auth + role check + CSRF + body Zod + Cache-Control + session touch；caller 只寫 handler |
| **CSRF 自動驗** | [§3.6](#36-createadminroute-bff-wrapper) | `createRoute` 內建：non-safe method (POST/PATCH/DELETE) 自動 `verifyCsrf`；csrfExempt=false 為預設、admin 不該 exempt |
| **Lifecycle action（archive/delete/restore）v0.1 不做** | [§6 OQ](#6-開放問題) | 排 v0.2；list 暫時只看 `live`（未 archive / 未 delete）；admin 看不到 archived/deleted 的編輯入口 |
| **Image upload v0.1 不做** | [§6 OQ](#6-開放問題) | 排 v0.3；charity logoKey、project/item coverImageKey 三欄 form 不顯示，全部送 null；公開頁顯示原本 fallback |
| **i18n (nameEn / descriptionEn / contentEn) v0.1 不做** | [§6 OQ](#6-開放問題) | 排 v0.5；form 只展示 zh 必填欄；en 三欄 BE TypeBox 都是 optional，省略 = 不送 |
| **Category 編輯 v0.1 不做** | [§6 OQ](#6-開放問題) | 排 v0.6；category 是 dictionary、極少改；MVP 由 seed + 開發者直接改 DB 處理 |
| **Categories 顯示用既存 `/api/categories`** | [§5.5](#55-fetchcategories-rsc-helper-v02-補) / 011a §4.1 | charity create / edit form 要選 categoryIds[]；既存 [`/api/categories` BFF](../../src/app/api/categories/route.ts) 已轉發 `/user/v1/donation/categories`；本 spec 新增 `fetchCategories()` RSC helper（[§5.5](#55-fetchcategories-rsc-helper-v02-補)）。Admin view 看不到 archived category 是已知小缺口（v0.6 補） |

### 4.1 「為何不直接展示 BE response 全部欄位」

BE response 含 lifecycle timestamps（`archivedAt`、`deletedAt`、`publishStartAt`、`publishEndAt`、`createdAt`、`updatedAt`）。MVP form 編輯 publish window 兩欄、不編輯 lifecycle timestamps（後者由 lifecycle action endpoint 改）。Read-only 顯示 `createdAt` / `updatedAt` 在 edit 頁底部即可。

---

## 5. BFF Route Handler 架構

### 5.1 路徑映射表

| FE BFF route | BE endpoint | 用途 | 011a MVP |
|---|---|---|---|
| `GET /api/cms/charities` | `GET /cms/donation/charities` ⚠️ | admin list | ✅（**BE 需補 admin list GET endpoint**） |
| `POST /api/cms/charities` | `POST /cms/donation/charities` | create | ✅ |
| `GET /api/cms/charities/[id]` | `GET /cms/donation/charities/:id` ⚠️ | edit 頁 RSC fetch | ✅（**BE 需補 admin detail GET endpoint**；詳 [§5.4](#54-be-硬依賴backendcharitydetail-缺欄位)） |
| `PATCH /api/cms/charities/[id]` | `PATCH /cms/donation/charities/:id` | edit submit | ✅ |
| `DELETE /api/cms/charities/[id]` | `DELETE /cms/donation/charities/:id` | soft delete | v0.2 |
| `POST /api/cms/charities/[id]/archive` 等 | `POST /:id/archive` 等 | lifecycle | v0.2 |

### 5.2 BFF route 骨架（用 `createAdminRoute`）

對齊既有 [`/api/checkout/donation`](../../src/app/api/checkout/donation/route.ts) / [`/api/categories`](../../src/app/api/categories/route.ts) pattern，**全部走 `createRoute` family**，不手動組 `NextResponse`：

```ts
// src/app/api/cms/charities/route.ts（POST + GET list 範例）
import 'server-only'
import { z } from 'zod'

import { okResponse } from '@/lib/api/responses'
import { backendFetch } from '@/lib/api/backend'
import { createAdminRoute } from '@/lib/api/createAdminRoute'
import { ContractViolationError } from '@/lib/errors/ContractViolationError'
import { BackendAdminCharityDetail } from '@/lib/schemas/admin-detail'  // §5.4 新

const CharityCreateBody = z.object({
  name: z.string().trim().min(1).max(120),
  description: z.string().min(1).max(500),
  contactPhone: z.string().trim().min(1).max(40).optional(),
  contactEmail: z.string().email().max(254).optional(),
  officialWebsite: z.string().url().max(2048).optional(),
  approvalNo: z.string().min(1).max(100).optional(),
  displayOrder: z.number().int().min(-1000).max(1000).default(0),
  publishStartAt: z.string().datetime().optional(),
  publishEndAt: z.string().datetime().optional(),
  categoryIds: z.array(z.string().uuid()).max(16).default([]),
}).refine(
  (v) => !v.publishStartAt || !v.publishEndAt || v.publishEndAt > v.publishStartAt,
  { message: 'publishEndAt must be > publishStartAt', path: ['publishEndAt'] },
)

export const POST = createAdminRoute({
  bodySchema: CharityCreateBody,
  handler: async ({ body, requestId }) => {
    const { data } = await backendFetch<unknown>('/cms/donation/charities', {
      method: 'POST',
      body,
      requestId,
    })
    const parsed = BackendAdminCharityDetail.safeParse(data)
    if (!parsed.success) {
      throw new ContractViolationError(
        `Upstream POST /cms/donation/charities response failed schema: ${parsed.error.message}`,
      )
    }
    return okResponse(parsed.data)
  },
})

// GET list — admin 看全部，pagination 之後 v0.2 加（demo 一頁夠）
export const GET = createAdminRoute({
  handler: async ({ requestId }) => {
    const { data } = await backendFetch<unknown>(
      '/cms/donation/charities?limit=100',
      { requestId },
    )
    // v0.1 list response shape 暫不在本層 Zod 驗證（demo 階段 trust）
    return okResponse(data)
  },
})
```

要點：

- **auth + CSRF 自動處理**：`createAdminRoute` → `createRoute(requireAuth=true)` → 無 session → `UnauthenticatedError` 401；non-admin → `ForbiddenError` 403；POST/PATCH/DELETE 自動 `verifyCsrf`
- **`body` 已 Zod parsed**：caller handler 拿到 typed `body`，invalid → `createRoute` 自動 400 ValidationError
- **`requestId` 自動產生 + 透傳**：對齊既有 log + tracing pattern
- **response 用 `okResponse(data)`**：自動包 `{ data }` envelope + Cache-Control `no-store, private`
- **BE response 一律 Zod 驗證**：對齊 [009 v0.8 audit pattern](./009-checkout-confirm.md) — 防 BE drift 靜默失敗

詳細欄位、PATCH partial schema、detail GET、edit fetch 程式碼放 [011a §6](./011a-cms-charity-admin.md#6-bff-route-handler)；本節只示範通用結構。

### 5.3 error envelope 統一

`createRoute` 自動處理常見錯誤（[`toErrorResponse`](../../src/lib/errors/toErrorResponse.ts)）：

| 來源 | HTTP | code | FE 攔截行為 |
|---|---|---|---|
| `UnauthenticatedError`（無 session）| 401 | `UNAUTHENTICATED` | `router.replace('/?reason=cms-not-admin')` |
| `ForbiddenError`（non-admin）| 403 | `FORBIDDEN` | 同上 |
| `parseBody` Zod fail | 400 | `VALIDATION_FAILED` | toast.error + 高亮欄位（v0.2 細實作） |
| BE 4xx passthrough | 4xx | BE 給的 code | 依 code 行為 |
| `ContractViolationError`（BE response 壞 shape）| 502 | `CONTRACT_VIOLATION` | toast.error('上游錯誤，請聯絡管理員')（罕見、log 記下供 BE debug） |
| `CHARITY_NOT_FOUND`（PATCH/DELETE 對不存在 id）| 404 | BE 給 | toast.error('資料已不存在') + 回 list |
| 其他 | 5xx | `INTERNAL` | toast.error('操作失敗，請稍後再試') |

### 5.4 BE 硬依賴：BackendCharityDetail 缺欄位

**現況問題**：[`BackendCharityDetail`](../../src/lib/schemas/detail.ts) 為 user-facing detail，**不含** admin 編輯必須的 3 欄：`displayOrder` / `publishStartAt` / `publishEndAt`（user 沒理由看到）。

**影響**：011a edit 頁需要預填 10 欄；其中 3 欄 BE 端 user detail 不回，FE 無從預填 → admin 每次儲存 都會 reset 排序與排程時間。

**v0.2 採用方案 A（必要）**：對應 [BE spec 026 donation admin read API](../../../backend/docs/specs/026-donation-admin-read-api.md) v0.1 — 規劃 6 個 admin GET endpoint：

```
GET /cms/donation/charities          → admin list（含 lifecycle metadata；支援 includeArchived/Deleted 旗標）
GET /cms/donation/charities/:id      → admin detail（含 displayOrder / publishStartAt / publishEndAt / archivedAt / deletedAt / createdAt / updatedAt）
GET /cms/donation/donation-projects, /sale-items 同上（detail 多 parentCharityArchivedAt/DeletedAt 兩欄，提示 cascading visibility）
```

FE 對應：

```ts
// src/lib/schemas/admin-detail.ts（新）
import { z } from 'zod'
import { InflatedCategory } from './categories'

export const BackendAdminCharityDetail = z.object({
  // user-facing 子集
  id: z.string().uuid(),
  name: z.string(),
  description: z.string(),
  logoUrl: z.string().url().nullable(),
  contactPhone: z.string().nullable(),
  contactEmail: z.string().nullable(),
  officialWebsite: z.string().nullable(),
  approvalNo: z.string().nullable(),
  categories: z.array(InflatedCategory),
  createdAt: z.string(),
  updatedAt: z.string(),
  // admin 專有
  displayOrder: z.number().int(),
  publishStartAt: z.string().nullable(),
  publishEndAt: z.string().nullable(),
  archivedAt: z.string().nullable(),
  deletedAt: z.string().nullable(),
})
export type BackendAdminCharityDetail = z.infer<typeof BackendAdminCharityDetail>
```

> **此節是 011 spec 對 BE 的 hard prerequisite**：011a impl 不能在 BE 020 v0.5 補 admin GET endpoint 前開工，否則 edit 頁 3 欄會「每次儲存都被預設 reset」。

**降級方案 C（若 BE 時程不允許）**：FE 接受 edit 頁 3 欄空白 / 預設值，明確標示「未載入原值；儲存將覆蓋為以下值」警告語。**不建議**，但可作為 BE 補不上時的緊急 plan。

### 5.5 `fetchCategories()` RSC helper（v0.2 補）

create / edit form 的 `<MultiSelectChips>` 需要 categoryIds 候選清單。既有 [`/api/categories`](../../src/app/api/categories/route.ts) 已存在；FE 需新增 RSC-friendly helper：

```ts
// src/lib/api/getCategories.ts（新）
import 'server-only'
import { headers } from 'next/headers'

import { backendFetch } from './backend'
import { ContractViolationError } from '@/lib/errors/ContractViolationError'
import {
  BackendCategoryListResponse,
  type CategoryListItem,
} from '@/lib/schemas/categories'

export async function fetchCategories(): Promise<CategoryListItem[]> {
  const h = await headers()
  const lang = h.get('accept-language')
  const { data } = await backendFetch<unknown>('/user/v1/donation/categories', {
    headers: lang ? { 'accept-language': lang } : undefined,
  })
  const parsed = BackendCategoryListResponse.safeParse(data)
  if (!parsed.success) {
    throw new ContractViolationError(
      `Categories response schema mismatch: ${parsed.error.message}`,
    )
  }
  return parsed.data.items
}
```

對齊既有 [`fetchCharityDetail` pattern](../../src/lib/api/getDetail.ts)。create / edit page.tsx 直接 RSC 呼叫：

```ts
const [charity, categories] = await Promise.all([
  fetchAdminCharityDetail(id),  // §5.4 新 helper
  fetchCategories(),
])
```

---

## 6. 開放問題

- **「admin 也想看 archived / deleted」UI**：v0.2 lifecycle 上線時設計 list filter（『全部 / 已上架 / 已封存 / 已刪除』tabs）；v0.1 admin list 等同 user list（只看 live）
- **Image upload 流程**：BE 018 已定 presign → PUT → patch flow；FE 缺 `<ImageUploader>` primitive；先 image-less v0.1，v0.3 補 011e spec
- **i18n 雙語 form**：BE 接受 nameEn / descriptionEn / contentEn optional；UI 是否平鋪 / tab 分頁？等到產品決定再排（v0.5）
- **Bulk action**（多選 archive / restore）：v0.1 不做；v0.2 lifecycle 完整後再評估必要性
- **Optimistic UI**：v0.1 不做；submit 後等 BE 回應再導頁，避免「prev page 顯示舊資料」假象
- ~~**CSRF token**：admin BFF mutate route（POST/PATCH/DELETE）需不需要 CSRF token？~~ → ✅ v0.2 確認：`createRoute` 對 non-safe method 自動 `verifyCsrf`；`createAdminRoute` 繼承之，**不另立規格**
- **Audit log**：admin 操作（誰 / 什麼時候 / 改了什麼）是否要記？BE 020 §14 OQ #4 列入未來；FE 不主動規劃
- **Account 管理**：BE 沒有 admin account CRUD endpoint（spec 024 §5.2 future）；FE 也不做
- **同時編輯衝突**：兩個 admin 同時改同一筆 → BE 後寫者覆蓋前寫者；BE 020 §14 OQ #8 列入未來 ETag / version；FE v0.1 不防
- **BE 020 admin GET endpoint 上線時程**：v0.2 規格 §5.4 標為 hard dependency；FE 不能在 BE 補完前開工 011a。若 BE 時程有問題、評估降級方案 C（接受預填 reset）作為臨時 plan

---

## 7. 變更紀錄

| 版本 | 日期 | 變更 |
|---|---|---|
| 0.1 | 2026-06-16 | 初版：規劃 011 family（index + 011a charity + 011b project + 011c item + 011d primitives）。對齊 BE 020 (23 個 /cms admin endpoint) + 023 (`/cms` prefix) + 024 (CUD 一律 /cms) + 015 (lifecycle 5 欄)。Auth gate 規劃三層（proxy / RSC / BFF）+ `StoredSession.role` 擴展 + `requireAdminSession()` / `readAdminSession()` helper。共同決策：BFF Zod mirror BE TypeBox、PATCH partial-update、useReducer form state、save 成功 router.replace 回 list、失敗 toast.error + 留頁。v0.1 MVP charity-first thin slice：lifecycle / image upload / i18n / category 全排 v0.2+ |
| 0.2 | 2026-06-16 | **self-audit 修正**：(a) §3.1 `StoredSession` 真實 shape 含 8 欄（含 csrfToken / accessToken / 等）— 規格之前簡寫易誤導；(b) §3.2 加 `Role` const + `RoleValue` 型別；(c) §3.3 新增「既存 Redis session backward-compat 策略」三方案表 + 採用 A 清空；(d) §3.4 新增「需配套更新的登入路徑」表：`/api/dev/login` / OAuth / password login + `getSessionService.create()` API 改 input；(e) §3.5 `requireAdminSession` 標明 RSC 用；(f) §3.6 新 `createAdminRoute()` helper（包既有 createRoute + role check + 自動 CSRF），取代之前自寫 NextResponse 的範例；(g) §4 共同決策表加「BFF 一律用 createAdminRoute」「CSRF 自動驗」兩條；CSRF OQ 劃掉；(h) §5.2 BFF route 範例改用 `createAdminRoute` + `okResponse` + `backendFetch` + ContractViolationError，對齊既有 `/api/checkout/donation` / `/api/categories` pattern；(i) §5.3 error envelope 表加 ForbiddenError / ContractViolationError；(j) **§5.4 新「BE 硬依賴」段**：`BackendCharityDetail` user-facing 不含 `displayOrder` / `publishStartAt` / `publishEndAt`，必須等 BE 020 補 `GET /cms/donation/charities/:id` admin detail endpoint + FE 加 `BackendAdminCharityDetail` Zod schema；標 hard prerequisite + 緊急降級方案 C；(k) §5.5 新增 `fetchCategories()` RSC helper 範例 |
