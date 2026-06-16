# Spec 011：CMS 資源管理（charity / project / item，index）

- **狀態**：Draft（v0.1 — family 開卷；含 routing / auth / BFF / 共同決策；MVP charity-first thin slice）
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

| 項 | 現況 | 011 v0.1 需求 |
|---|---|---|
| Session 結構 | `StoredSession = { userId, user: { id, name }, ... }`（無 `role`） | 加 `role: 0 | 1`（對齊 BE `Role.ADMIN = 0` / `USER = 1`） |
| Proxy gate | `src/proxy.ts` 檢查 cookie 存在（[010 §3.1](./010-cms-auth-gate.md)） | 不變（cookie 存在仍是必要條件；role 在 RSC 驗）|
| Page-level gate | `src/app/cms/page.tsx` 呼 `getSessionService().get()`，null → redirect `/`（[010 §3.2](./010-cms-auth-gate.md)） | 加 role check：`session?.role !== 0` → redirect `/?reason=cms-not-admin`（同 reason pattern） |
| Admin BFF route | 不存在 | 新增 `requireAdmin` helper：每條 `/api/cms/*` BFF route 先驗 role；非 admin → 401 |

### 3.2 Session role 擴展

`StoredSession` 加 `role: number` 欄位。後端 session 建立時（spec 005 dev login + spec 007 OAuth + spec 008 password）把 `account.role` 寫入 session。讀取端：

```ts
// src/lib/session/types.ts
export const Role = { ADMIN: 0, USER: 1 } as const
export type RoleValue = (typeof Role)[keyof typeof Role]

export interface StoredSession {
  userId: string
  user: { id: string; name: string }
  role: RoleValue       // ← 新欄
  // ...
}
```

`/api/dev/login` 需更新：mock account 也帶 role；測試用兩條 mock account（一條 admin / 一條 user）以利驗整套 auth flow。

### 3.3 RSC + BFF 雙層 admin gate

防禦深度：

1. **Proxy（edge）**：cookie 存在性檢查；無 cookie → bounce `/`。**不解 session、不查 role**（edge runtime 無 secret / Redis 連線）
2. **RSC**（每個 `/cms/charities*` page.tsx）：呼 `requireAdminSession()` helper → `session === null || session.role !== 0` → redirect `/?reason=cms-not-admin`
3. **BFF route**（每條 `/api/cms/*` route.ts）：呼 `requireAdminSession()` → 同上條件 → 401（API 不該 redirect）

任一層失敗皆能擋下；正常情況三層都會通過。

### 3.4 `requireAdminSession()` helper

```ts
// src/lib/session/requireAdmin.ts（新）
import { redirect } from 'next/navigation'
import { getSessionService } from './service'
import { Role } from './types'

/** RSC 用：null / non-admin → redirect /?reason=cms-not-admin */
export async function requireAdminSession() {
  const session = await getSessionService().get()
  if (!session) redirect('/?reason=cms-not-admin')
  if (session.role !== Role.ADMIN) redirect('/?reason=cms-not-admin')
  return session
}

/** BFF route 用：回 null 讓 caller 自己組 401 response */
export async function readAdminSession() {
  const session = await getSessionService().get()
  if (!session || session.role !== Role.ADMIN) return null
  return session
}
```

[`AuthRedirectToast`](../../src/app/AuthRedirectToast.tsx)（[spec 010](./010-cms-auth-gate.md)）需新增一個 reason `cms-not-admin`，渲染 `toast.error('需要管理員權限')`。

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
| **Lifecycle action（archive/delete/restore）v0.1 不做** | §6 | 排 v0.2；list 暫時只看 `live`（未 archive / 未 delete）；admin 看不到 archived/deleted 的編輯入口 |
| **Image upload v0.1 不做** | §6 | 排 v0.3；charity logoKey、project/item coverImageKey 三欄 form 不顯示，全部送 null；公開頁顯示原本 fallback |
| **i18n (nameEn / descriptionEn / contentEn) v0.1 不做** | §6 | 排 v0.5；form 只展示 zh 必填欄；en 三欄 BE TypeBox 都是 optional，省略 = 不送 |
| **Category 編輯 v0.1 不做** | §6 | 排 v0.6；category 是 dictionary、極少改；MVP 由 seed + 開發者直接改 DB 處理 |
| **Categories 顯示用既存 `/user/v1/donation/categories`** | §5 / 011a §5 | charity create / edit form 要選 categoryIds[]；現有 user-side endpoint 已能列出，admin form 直接 fetch；admin view 看不到 archived category 是已知小缺口（v0.6 補） |

### 4.1 「為何不直接展示 BE response 全部欄位」

BE response 含 lifecycle timestamps（`archivedAt`、`deletedAt`、`publishStartAt`、`publishEndAt`、`createdAt`、`updatedAt`）。MVP form 編輯 publish window 兩欄、不編輯 lifecycle timestamps（後者由 lifecycle action endpoint 改）。Read-only 顯示 `createdAt` / `updatedAt` 在 edit 頁底部即可。

---

## 5. BFF Route Handler 架構

### 5.1 路徑映射表

| FE BFF route | BE endpoint | 用途 | 011a MVP |
|---|---|---|---|
| `GET /api/cms/charities` | `GET /cms/donation/charities` | admin list | ✅ |
| `POST /api/cms/charities` | `POST /cms/donation/charities` | create | ✅ |
| `GET /api/cms/charities/[id]` | `GET /cms/donation/charities/:id`（或 `GET /user/v1/donation/charities/:id`） | edit 頁 RSC fetch | ✅（先用 user 端 detail；admin 端若 BE 020 v0.4 後加 admin GET，切換）|
| `PATCH /api/cms/charities/[id]` | `PATCH /cms/donation/charities/:id` | edit submit | ✅ |
| `DELETE /api/cms/charities/[id]` | `DELETE /cms/donation/charities/:id` | soft delete | v0.2 |
| `POST /api/cms/charities/[id]/archive` 等 | `POST /:id/archive` 等 | lifecycle | v0.2 |

### 5.2 共用 route handler 骨架

```ts
// src/app/api/cms/charities/route.ts（POST 範例）
import { z } from 'zod'
import { NextRequest, NextResponse } from 'next/server'
import { readAdminSession } from '@/lib/session/requireAdmin'
import { backendFetch } from '@/lib/api/backendFetch'

const CharityCreateBody = z.object({
  name: z.string().trim().min(1).max(120),
  description: z.string().min(1).max(500),
  contactPhone: z.string().trim().min(1).max(40).nullish(),
  contactEmail: z.string().email().max(254).nullish(),
  officialWebsite: z.string().url().max(2048).nullish(),
  approvalNo: z.string().min(1).max(100).nullish(),
  displayOrder: z.number().int().min(-1000).max(1000).default(0),
  publishStartAt: z.string().datetime().nullish(),
  publishEndAt: z.string().datetime().nullish(),
  categoryIds: z.array(z.string().uuid()).max(16).default([]),
}).refine(
  (v) => !v.publishStartAt || !v.publishEndAt || v.publishEndAt > v.publishStartAt,
  { message: 'publishEndAt must be > publishStartAt', path: ['publishEndAt'] },
)

export async function POST(req: NextRequest) {
  if (!(await readAdminSession())) {
    return NextResponse.json({ error: 'UNAUTHORIZED' }, { status: 401 })
  }
  const parsed = CharityCreateBody.safeParse(await req.json())
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'VALIDATION_FAILED', issues: parsed.error.issues },
      { status: 400 },
    )
  }
  const res = await backendFetch('/cms/donation/charities', {
    method: 'POST',
    body: JSON.stringify(parsed.data),
    headers: { 'Content-Type': 'application/json' },
  })
  if (!res.ok) {
    // BE error envelope passthrough（同 spec 022 audit pattern）
    return NextResponse.json(await res.json(), { status: res.status })
  }
  return NextResponse.json(await res.json(), { status: 201 })
}
```

詳細欄位、PATCH partial schema、edit fetch 程式碼放 [011a §6](./011a-cms-charity-admin.md#6-bff-route-handler)；本節只示範通用結構。

### 5.3 error envelope 統一

BE 020 error 範例（spec 022 audit 後固定 shape）：
```json
{ "code": "VALIDATION_FAILED", "message": "name must be 1-120 chars", "details": {...} }
```

BFF 一律 passthrough（不改寫）；FE 攔截到 4xx / 5xx 時看 `error.code` 決定行為：
- `UNAUTHORIZED` (401) → `router.replace('/?reason=cms-not-admin')`
- `VALIDATION_FAILED` (400) → toast.error + 高亮 issues 對應欄位（v0.2+ 細實作）
- `CHARITY_NOT_FOUND` (404)（edit/delete 時）→ toast.error('資料已不存在') + 回 list
- 其他 → toast.error('操作失敗，請稍後再試')

---

## 6. 開放問題

- **「admin 也想看 archived / deleted」UI**：v0.2 lifecycle 上線時設計 list filter（『全部 / 已上架 / 已封存 / 已刪除』tabs）；v0.1 admin list 等同 user list（只看 live）
- **Image upload 流程**：BE 018 已定 presign → PUT → patch flow；FE 缺 `<ImageUploader>` primitive；先 image-less v0.1，v0.3 補 011e spec
- **i18n 雙語 form**：BE 接受 nameEn / descriptionEn / contentEn optional；UI 是否平鋪 / tab 分頁？等到產品決定再排（v0.5）
- **Bulk action**（多選 archive / restore）：v0.1 不做；v0.2 lifecycle 完整後再評估必要性
- **Optimistic UI**：v0.1 不做；submit 後等 BE 回應再導頁，避免「prev page 顯示舊資料」假象
- **CSRF token**：admin BFF mutate route（POST/PATCH/DELETE）需不需要 CSRF token？依 spec 001d session-csrf。v0.1 先比照既有 `/api/checkout/*` 同樣處理（同 origin same-site cookie + Origin header 檢查）
- **Audit log**：admin 操作（誰 / 什麼時候 / 改了什麼）是否要記？BE 020 §14 OQ #4 列入未來；FE 不主動規劃
- **Account 管理**：BE 沒有 admin account CRUD endpoint（spec 024 §5.2 future）；FE 也不做
- **同時編輯衝突**：兩個 admin 同時改同一筆 → BE 後寫者覆蓋前寫者；BE 020 §14 OQ #8 列入未來 ETag / version；FE v0.1 不防

---

## 7. 變更紀錄

| 版本 | 日期 | 變更 |
|---|---|---|
| 0.1 | 2026-06-16 | 初版：規劃 011 family（index + 011a charity + 011b project + 011c item + 011d primitives）。對齊 BE 020 (23 個 /cms admin endpoint) + 023 (`/cms` prefix) + 024 (CUD 一律 /cms) + 015 (lifecycle 5 欄)。Auth gate 規劃三層（proxy / RSC / BFF）+ `StoredSession.role` 擴展 + `requireAdminSession()` / `readAdminSession()` helper。共同決策：BFF Zod mirror BE TypeBox、PATCH partial-update、useReducer form state、save 成功 router.replace 回 list、失敗 toast.error + 留頁。v0.1 MVP charity-first thin slice：lifecycle / image upload / i18n / category 全排 v0.2+ |
