# Spec 011：使用者管理模組（Admin 帳號管理 + 自助個人資料）

> ⚠️ **已被 spec 013 取代（2026-07-18）**：本 spec 的資料模型假設（CMS 管理「User 帳號」，
> `email` + `isActive`）**作廢**。本專案不碰一般 user；CMS 實際管理的是**其他 admin 帳號**
> （`username` + `name` + `admin_role` + 封存/軟刪除生命週期 + 受保護 root），對接後端
> `/admin/admins/...`。**權威規格改為 [spec 013（Admin 管理頁面）](./013-admin-management-page.md)**。
> 本檔的靜態 UI（`/cms/users`）與視覺 token 決策仍可參考，但欄位/流程一律以 013 為準。

- **狀態**：Draft（v0.2 — 對齊實作：A 子模組 `/cms/users` 的**靜態 UI 已落地**（可跑、無 fetch / 無 gate），本版把視覺契約從舊 spec 抄來的「brand 紅」修正為專案實際的**深色 observability + cyan** design system、登錄 prototype 檔案、回寫建置期的 UI 決策）
- **建立日期**：2026-07-18（v0.1）
- **設計系統**：深色 observability 主題（deep-slate 底 + electric cyan accent），token 定義見 [`src/app/globals.css`](../../src/app/globals.css)。**本 spec 一律用語義 token（`brand` / `ink-*` / `surface-*` / `line` / `ok`·`warn`·`danger`），不寫 hex、不沿用舊 spec 005/007 的「brand 紅」（那是深色化前的過時描述）。**
- **範圍**：兩個子模組
  - **A. Admin 帳號管理**（`/cms/users`）：登入的管理者（ADMIN）對 **User 帳號** 做列表 / 檢視 / 建立 / 編輯 / 啟用停用 / 刪除
  - **B. 自助個人資料**（`/cms/settings`）：登入者管理**自己**的帳號（改顯示名 / email、改密碼、刪除自己）
- **路徑（前端）**：
  - 基礎建設（**已實作**）：
    - `src/lib/session/types.ts`（§3.2 — session 帶 `role`）
    - `src/lib/session/requireAdmin.ts` / `.test.ts`（§3.5 — RSC admin gate）
    - `src/lib/auth/decodeJwtPayload.ts`（§3.4 — 從 access JWT 讀 `role` claim）
    - `src/app/AuthRedirectToast.tsx`（[spec 010 §3.3](./010-cms-auth-gate.md) — 消化 `?reason=cms-not-admin` toast）
    - `src/lib/client/csrf.ts`（spec 011a — client CSRF token fetcher）
  - 靜態 UI **已落地**（v0.2；純視覺、無 fetch / 無 gate — [§5.5](#55-靜態-ui-prototype-狀態v02)）：
    - `src/app/cms/users/page.tsx`（A — RSC 外殼；**尚未**掛 `requireAdminSession()`，待 §3.5 接上）
    - `src/app/cms/users/UsersTable.tsx`（A — client 列表：搜尋 / 狀態篩選 / 開建立編輯 sheet / 刪除確認；對 local state 操作）
    - `src/app/cms/users/UserFormSheet.tsx`（A — 建立 / 編輯共用表單，掛 `BottomSheet`）
    - `src/app/cms/users/mock-users.ts`（A — 寫死假資料，camelCase 對齊 [§5.3](#53-zod-契約srclibschemasuserts強制-tdd)）
  - 待實作（本 spec 主體，資料 / 邏輯層）：
    - `src/lib/api/create-admin-route.ts` / `.test.ts`（§3.6 — BFF admin gate，`createRoute` 的 admin 版）
    - `src/app/cms/users/UsersTable.test.tsx` / `UserFormSheet.test.tsx`（A — 接資料後補；純視覺階段依 CLAUDE.md 可後補、由 e2e 兜底）
    - `src/app/cms/settings/page.tsx` + `ProfileForm.tsx` / `.test.tsx`（B — 自助個人資料）
    - `src/app/api/cms/users/route.ts`（A — `GET` 列表 / `POST` 建立）+ `.test.ts`
    - `src/app/api/cms/users/[id]/route.ts`（A — `PATCH` / `DELETE`）+ `.test.ts`
    - `src/app/api/cms/me/route.ts`（B — 自助 `GET` / `PATCH` / `DELETE`）+ `.test.ts`
    - `src/lib/schemas/user.ts`（A/B 共用 Zod：`UserCreate` / `UserUpdate` / `BackendUserResponse`）+ `.test.ts`
- **依賴**：
  - [spec 010 CMS Auth Gate](./010-cms-auth-gate.md)（`/cms*` proxy + RSC 登入守門；本模組所有頁掛在 `/cms` 底下）
  - [spec 012 Backend Auth 契約](./012-backend-auth-integration.md)（**權威後端契約**；本 spec 的欄位命名 / role 值 / 端點一律以 012 為準，覆寫 spec 005/007 舊假設）
  - 既有 [`createRoute`](../../src/lib/api/create-route.ts)（§3.6 的 `createAdminRoute` 是其 admin 版）、[`backendFetch`](../../src/lib/api/backend.ts)、iron-session / Redis session（[spec 001b/c](./001c-session-service.md)）、CSRF（[spec 001d](./001d-security-csrf.md)）
  - [spec 006 錯誤處理](./006-error-handling.md)（5xx global toast；列表 query error）
  - UI primitives：既有 [`BottomSheet`](../../src/components/ui/BottomSheet.tsx)、`EmptyState`、`InlineError`、`Spinner`

---

## 1. 職責

CMS 後台目前只有「登入 vs 未登入」一刀（[spec 010](./010-cms-auth-gate.md)）與登入表單（spec 005/007）。本模組補上「**帳號的生命週期管理**」，分兩個彼此獨立、可分期交付的子模組：

```
/cms
 ├─ /cms/users        ← A. Admin 帳號管理（管別人）  ── 需 ADMIN
 │    ├─ 列表（搜尋 / 分頁 / 啟用停用篩選）
 │    ├─ 建立 User
 │    ├─ 編輯 User（email / name / is_active）
 │    └─ 刪除 User
 └─ /cms/settings     ← B. 自助個人資料（管自己）    ── 任何登入者
      ├─ 檢視自己的 profile
      ├─ 改 name / email
      ├─ 改密碼（待 BE）
      └─ 刪除自己（待 BE）
```

> **A 是本期主體**：後端 `/users` CRUD 端點**已存在且可用**（[§4.1](#41-後端端點總表)），FE 只要接上 + 補 admin gate。
> **B 是次要 / 前向設計**：自助改 profile / 改密碼 / 刪自己的**後端端點目前不存在**（[§4.3](#43-自助端點的後端缺口)）；本 spec 先把 FE/BFF 設計與 Zod 契約寫好、標為 BE 依賴，端點就位再落地（沿用 [spec 007 §6](./007-register-page.md) 「FE 先寫、BE cross-ref」pattern）。

---

## 2. 名詞與角色模型

| 詞 | 意義 |
|---|---|
| **principal** | 後端帳號主體，`principals.id`（int）= JWT `sub`。user / admin 各以 `principal_id` 一對一掛上（[spec 012 §3.7](./012-backend-auth-integration.md)）。 |
| **User（role=0）** | 一般使用者帳號。本模組 A 管的就是這類；後端 `/users` CRUD 對應之。 |
| **Admin（role=1）** | CMS 管理者。登入 `/cms` 的就是 admin；A 的操作者、B 的自助對象。 |
| **child PK `id`（int）** | `/users/{id}` / `AdminResponse.id` 回的 `id`，是 **user/admin 子表 PK**，**不是** principal_id。CRUD 定址用它；「使用者穩定識別」用 JWT `sub`（[spec 012 §3.7](./012-backend-auth-integration.md)）。 |

### 2.1 ⚠️ Role 值：以 spec 012 為準（`USER=0, ADMIN=1`）

後端 `app/core/enums.py`：**`USER=0`、`ADMIN=1`**（[spec 012 §3.2](./012-backend-auth-integration.md)）。

現行前端 [`src/lib/session/types.ts`](../../src/lib/session/types.ts) 寫 `Role = { ADMIN: 0, USER: 1 }`，**與後端相反**——這是 [spec 012 §4 M1](./012-backend-auth-integration.md) 標記的 drift（授權倒置：user 會被當 admin）。

> **本 spec 的 admin gate（§3.5 / §3.6）判斷 `session.role === Role.ADMIN`，正確性完全繫於 `Role.ADMIN` 這個常數。** spec 012 修正落地時會把 `Role` 常數翻正為 `{ USER: 0, ADMIN: 1 }`；因 gate 讀的是**具名常數**而非 magic number，翻正後 gate 邏輯零改動、自動正確。本 spec 不重定義 `Role`，統一指向 [spec 012 §5.0](./012-backend-auth-integration.md)，避免兩份 spec 各定一套。**A 子模組的實作 PR 必須在 spec 012 M1 修正之後或同批進行**，否則 admin gate 會放行 user。

---

## 3. 基礎建設（admin gate；§3.2 / §3.4 / §3.5 已實作）

這些是 A/B 都倚賴的底座，**程式碼已存在**（多處 `Spec 011 §…` 註解即指此）。本節把它們的契約寫清楚，作為後續功能節的地基。

### 3.2 Session 帶 `role`（已實作）

[`src/lib/session/types.ts`](../../src/lib/session/types.ts) 的 `StoredSession` 有 `role: RoleValue` 欄（見 [§2.1](#21-role-值以-spec-012-為準-user0-admin1) 的值定義）：

- 登入 / 註冊時由 BFF 寫入（[`/api/auth/login` resolveRole`](../../src/app/api/auth/login/route.ts)）。
- 舊 session（此欄未存在時）讀回 `role: undefined`；admin 檢查用 `=== Role.ADMIN`，`undefined` **fail closed**（視為非 admin）。

### 3.4 從 access JWT 讀 `role`（已實作）

BE `/me`（`/admin/me` / `/users/me`）**不回 `role`**（role 只在 JWT claims，[spec 012 §3.5](./012-backend-auth-integration.md)）。[`resolveRole()`](../../src/app/api/auth/login/route.ts) 先看 `/me`（未來相容），fallback 用 [`decodeJwtPayload`](../../src/lib/auth/decodeJwtPayload.ts) base64url 解 access token payload 讀 `role`。BFF 不驗簽（token 來自可信 backendFetch）。

### 3.5 RSC admin gate（已實作）

[`requireAdmin.ts`](../../src/lib/session/requireAdmin.ts) 已提供：

| 函式 | 用途 |
|---|---|
| `requireAdminSession()` | RSC / layout 入口：`session===null` 或 `role!==ADMIN` → `redirect('/?reason=cms-not-admin')`；否則回 `StoredSession` |
| `ensureAdminAccess(fn)` | 包住頁內 fetch：`UnauthenticatedError`(401) 或 `BackendClientError`(403，被降權) → 先 `session.destroy()` 再 redirect，保持 fail-closed |

`?reason=cms-not-admin` 由 [`AuthRedirectToast`](../../src/app/AuthRedirectToast.tsx)（[spec 010 §3.3](./010-cms-auth-gate.md)）在首頁彈 `toast.error('需要管理員權限')`。

### 3.6 BFF admin gate — `createAdminRoute()`（**待實作**）

`requireAdmin.ts` 的註解已寫「BFF route handlers 用 `createAdminRoute()`」，但**此函式尚未定義**。本 spec 定義之：`createRoute` 的 admin 版，多一道 role gate。

```ts
// src/lib/api/create-admin-route.ts
import { createRoute } from './create-route'
import { Role } from '@/lib/session/types'
import { ForbiddenError } from '@/lib/errors/ForbiddenError'

export function createAdminRoute<...>(opts) {
  return createRoute({
    ...opts,
    requireAuth: true,                       // 先擋未登入 → 401
    handler: (args) => {
      if (args.session.role !== Role.ADMIN) {
        throw new ForbiddenError('Admin role required')  // → 403
      }
      return opts.handler(args)
    },
  })
}
```

- `requireAuth: true` 讓 `createRoute` 在 `session===null` 時丟 `UnauthenticatedError`（→ 401）；本 gate 再把「登入了但非 admin」擋成 403（[ForbiddenError](../../src/lib/errors/ForbiddenError.ts) 已存在）。401/403 之別對齊後端（[spec 012 §3.6](./012-backend-auth-integration.md)）。
- CSRF：非安全方法（POST/PATCH/DELETE）沿用 `createRoute` 的 `verifyCsrf`（[spec 001d](./001d-security-csrf.md)），**不** `csrfExempt`（有 session 可防護，與 login 的匿名 exempt 不同）。
- A 子模組**所有** BFF route 都用 `createAdminRoute`。

---

## 4. 後端契約（source of truth；讀 `/StreamSightBackend` 原始碼所得）

一律 **snake_case**、`id` 為 **int**、錯誤形狀 `{ error, message, details }`（[spec 012 §3.6](./012-backend-auth-integration.md)）。

### 4.1 後端端點總表

| 用途 | Method + Path | 認證（BE 現況） | Request | Response |
|---|---|---|---|---|
| 列表 User | `GET /users` | **無守門 ⚠️** | — | `list[UserResponse]` |
| 建立 User | `POST /users` | **無守門 ⚠️** | `{ email, name }` | `UserResponse`, 201 |
| 取單一 User | `GET /users/{id}` | **無守門 ⚠️** | — | `UserResponse` |
| 更新 User | `PATCH /users/{id}` | **無守門 ⚠️** | `{ email?, name?, is_active? }` | `UserResponse` |
| 刪除 User | `DELETE /users/{id}` | **無守門 ⚠️** | — | 204 |
| 自己（user） | `GET /users/me` | Bearer(role=0) | — | `UserResponse` |
| 自己（admin） | `GET /admin/me` | Bearer(role=1) | — | `AdminResponse` |

來源：`app/api/routers/users/router.py`、`app/api/routers/admin/router.py`。

### 4.2 回應形狀

```jsonc
// UserResponse (app/api/routers/users/schemas.py)
{ "id": 1, "email": "a@b.c", "name": "Alice", "is_active": true,
  "created_at": "<ISO>", "updated_at": "<ISO>" }

// AdminResponse (app/api/routers/admin/schemas.py)
{ "id": 1, "email": "a@b.c", "name": "Admin", "is_active": true }
```

- 無 `username`、無 `role`（後端無 username 概念，role 只在 JWT）。
- `UserUpdate` 三欄皆 optional；`name` 長度 1–100、`email` 為 `EmailStr`。
- **啟用/停用 = `PATCH is_active`**（軟停用；不是刪除）。**User 無 archive / 軟刪除**（那是 [BE `admin-account-refinement`](../../../StreamSightBackend/docs/specs/admin-account-refinement.md) 對 **admin** 的 draft，且僅到 service 層、無 HTTP 端點，本 spec 不涵蓋）。

### 4.3 ⚠️ 兩個後端缺口（本 spec 的 BE 依賴）

1. **`/users` CRUD 目前完全無認證守門**（只有 `/users/me` 有 `get_current_user`）。任何人都能列 / 建 / 改 / 刪 User。
   - **FE 端緩解**：A 的所有 BFF route 走 `createAdminRoute`（§3.6）——真後端隱藏在 BFF 後，瀏覽器打不到 BE，只能經過 BFF admin gate。
   - **仍需 BE 補**：BE 應在 `/users`（`/me` 除外）掛 `Depends(require_role(Role.ADMIN))`（`require_role` factory 已存在，`app/api/dependencies/auth.py:71`）。列為 [§9 開放問題](#9-開放問題)、建議獨立 BE PR；深度防禦，不能只靠 BFF。
2. **自助（B）端點不存在**：後端**無** `PATCH /admin/me`、無改密碼、無 `DELETE /admin/me`。`/admin/me` 只有 `GET`。B 子模組的寫入路徑全部懸空 → 見 [§6](#6-b自助個人資料cmssettings)。

---

## 5. A — Admin 帳號管理（`/cms/users`）

### 5.1 UI Layout

深色 observability 主題：`surface-page` 底、`surface-card` 卡片、cyan（`brand`）強調 CTA。頂部 sticky 標題列（標題 + 帳號數 + `＋新增`），下方工具列（搜尋 + 狀態分段控制），再下方清單。**RWD：手機為卡片式一列一卡；`sm:` 以上轉為格線表格（含表頭）。** 建立/編輯與刪除確認都走 [`BottomSheet`](../../src/components/ui/BottomSheet.tsx)。

```
┌──────────────────────────────────────────┐  ← sticky header, bg-surface-card, border-b
│  使用者管理  6            [＋ 新增使用者] │  ← h1(ink-AAA)+count(ink-A) / btn bg-brand
├──────────────────────────────────────────┤
│ 🔍 搜尋名稱或 email__________________      │  ← input bg-surface-card, focus ring brand
│ [ 全部 ][ 啟用 ][ 停用 ]                   │  ← 分段控制；選中 = bg-brand text-ink-on-brand
│ ┌── 名稱/Email ──── 狀態 ─ 建立 ─ 操作 ─┐ │  ← 表頭僅 sm: 顯示
│ │ 陳怡君  yijun.chen@…  ●啟用 7/02 [編輯][刪除]
│ │ 王曉明  ming.wang@…   ○停用 7/05 [編輯][刪除]
│ └──────────────────────────────────────┘ │  ← 每列 rounded-xl border-line bg-surface-card
│ 無結果 → <EmptyState/>（找不到 / 尚無使用者）│
└──────────────────────────────────────────┘
     ▲ 點「新增 / 編輯」→ BottomSheet 表單
     │  名稱 [____]  Email [____]  啟用帳號 [◐ switch]（僅編輯顯示）
     │  [取消]                              [建立 / 儲存]
     ▲ 點「刪除」→ BottomSheet 確認（[取消] [刪除 bg-danger]）
```

| 元素 | className / token 重點（對齊實作）|
|---|---|
| Page 外殼 | `min-h-dvh bg-surface-page flex flex-col`（RSC `page.tsx`）|
| Header | `sticky top-0 z-10 h-14 bg-surface-card border-b border-line`；h1 `text-[17px] font-bold text-ink-AAA` + count `text-ink-A` |
| `＋新增` 按鈕 | `bg-brand text-ink-on-brand h-9 rounded-lg`；hover `bg-brand-400` |
| 搜尋框 | `h-10 bg-surface-card border-line`，`focus:border-brand focus:ring-1 focus:ring-brand`；`type="search"`，左側放大鏡 icon |
| 狀態篩選 | 分段控制（`role=tablist`）：選中 `bg-brand text-ink-on-brand`、未選 `text-ink-AA hover:text-ink-AAA` |
| 清單容器 | `<ul>`；`sm:` 表頭列 `text-xs text-ink-A`；每列 `rounded-xl border border-line bg-surface-card`，`grid` 手機單欄、`sm:grid-cols-[1fr_auto_auto_auto]` |
| 狀態徽章 | `StatusBadge`：啟用 = `text-ok` + 綠點；停用 = `text-ink-A` + 灰點 |
| 列操作 | 「編輯」`text-brand hover:bg-brand-overlay`；「刪除」`text-danger hover:bg-danger/10` |
| 空狀態 | `<EmptyState illustration="/figma/empty-no-data.png" .../>`；文案依有無搜尋字串切換 |
| 表單 | `UserFormSheet` 掛 `BottomSheet`：名稱 + Email 欄位 + inline 驗證；`is_active` 用 `role=switch` toggle（僅編輯顯示）|

> **主要 CTA 用 cyan `brand`、破壞性操作用 `danger`、狀態用 `ok`/`ink-A`**——不拿 `brand` 當狀態或錯誤色（globals.css 設計規則）。

**實作 vs 目標的差異**（靜態階段刻意簡化，見 [§5.5](#55-靜態-ui-prototype-狀態v02)）：
- 搜尋為即時 filter（尚未接 `useDebouncedValue`；資料接上時再加 150ms debounce）。
- 尚無 `<Spinner/>` 載入態（無 fetch，本就不需要）；接資料後於首載 / 重抓時加。

| 元素 | 資料接上後（目標）|
|---|---|
| Page gate | RSC `const session = await requireAdminSession()` 守門後 render `<UsersTable/>` |
| 列表資料 | client 用 TanStack Query 打 `GET /api/cms/users`（方便搜尋/失效重抓；亦可 RSC 首屏 + hydrate，見 [§9](#9-開放問題)） |
| 搜尋 | client-side filter（BE `GET /users` 無 query 參數，一次回全量；資料量小的 demo 可接受，見 [§9](#9-開放問題)）+ `useDebouncedValue` 150ms |
| 狀態篩選 | client-side by `isActive` |
| 表單提交 | Zod（[§5.3](#53-zod-契約srclibschemasuserts強制-tdd)）驗證 → 打 BFF；409 inline「此 email 已被使用」|

### 5.2 行為契約

下表為**資料接上後的目標**行為。靜態 prototype（[§5.5](#55-靜態-ui-prototype-狀態v02)）已實作互動骨架，差別只在資料來源是 in-memory `mock-users.ts`、且尚無 gate / toast / 網路錯誤態（成功路徑直接改 local state，不 invalidate、不打 API）。

| 互動 | 行為 |
|---|---|
| 進 `/cms/users`（非 admin） | `requireAdminSession()` → redirect `/?reason=cms-not-admin` + toast「需要管理員權限」 |
| 進 `/cms/users`（admin） | render 表格；client `GET /api/cms/users` 載入 |
| 載入中 / 空 / 錯誤 | `<Spinner/>` / `<EmptyState/>` / query error 交 [spec 006](./006-error-handling.md) global handler + inline retry |
| 打字搜尋 | debounce 後 client filter，不重打 API |
| 按「新增」 | 開 BottomSheet，空表單；email+name 必填 |
| 送出建立成功（201） | 關 sheet、`invalidateQueries(['cms-users'])` 重抓、toast「已建立」 |
| email 重複（BE 409） | sheet 內 inline「此 email 已被使用」、不關 sheet |
| 驗證失敗（Zod / BE 422） | inline 顯示欄位錯誤 |
| 按某列「編輯」 | 開 sheet，帶入該 User；可改 email/name、toggle 啟用停用 |
| 送出編輯成功 | 關 sheet、失效重抓、toast「已更新」 |
| 按「刪除」 | 開刪除確認 `BottomSheet`（帶被刪者名字、`bg-danger` 確認鈕）→ `DELETE` → 204 → 失效重抓、toast「已刪除」 |
| 停用（不刪） | 編輯 sheet 把 `is_active` 關掉並儲存（`PATCH { is_active: false }`）；列表狀態欄改「停用」 |

### 5.3 Zod 契約（`src/lib/schemas/user.ts`，強制 TDD）

client + BFF 共用；規則對齊 [§4.2](#42-回應形狀) BE。

```ts
export const UserCreate = z.object({
  email: z.string().email('請輸入有效的 email'),
  name: z.string().min(1, '請輸入名稱').max(100, '名稱最多 100 字'),
})
export const UserUpdate = z.object({
  email: z.string().email().optional(),
  name: z.string().min(1).max(100).optional(),
  isActive: z.boolean().optional(),          // BFF → BE 映射成 snake `is_active`
})
export const BackendUserResponse = z.object({
  id: z.number().int(),
  email: z.string(),
  name: z.string(),
  is_active: z.boolean(),
  created_at: z.string(),
  updated_at: z.string(),
})
```

> **命名映射在 BFF 一層吸收**（[spec 012 §5.3 原則](./012-backend-auth-integration.md)）：對瀏覽器用 camel（`isActive` / `createdAt`），對 BE 用 snake（`is_active`）。`BackendUserResponse` 讀 snake，BFF 轉 camel 回前端。

### 5.4 BFF Routes

`src/app/api/cms/users/route.ts`（`createAdminRoute`）：

```ts
export const GET = createAdminRoute({
  handler: async ({ session, requestId }) => {
    const { data } = await backendFetch<unknown>('/users', {
      method: 'GET',
      headers: { authorization: `Bearer ${session.accessToken}` },
      requestId,
    })
    const users = z.array(BackendUserResponse).parse(data)
    return okResponse(users.map(toClientUser))    // snake → camel
  },
})

export const POST = createAdminRoute({
  bodySchema: UserCreate,
  handler: async ({ body, session, requestId }) => {
    const { data } = await backendFetch<unknown>('/users', {
      method: 'POST', body,                        // { email, name }
      headers: { authorization: `Bearer ${session.accessToken}` },
      requestId, passClientErrors: true,           // 409/422 原樣透傳
    })
    return okResponse(toClientUser(BackendUserResponse.parse(data)), 201)
  },
})
```

`src/app/api/cms/users/[id]/route.ts`（`createAdminRoute`，`paramsSchema: { id: z.coerce.number().int() }`）：

- `PATCH`：`bodySchema: UserUpdate` → 送 BE `PATCH /users/{id}`，body 把 `isActive` 映射成 `is_active`。
- `DELETE`：送 BE `DELETE /users/{id}` → 透傳 204。

| 觸發 | client 看到 |
|---|---|
| 未登入 | 401（proxy/gate 通常先擋，BFF 兜底） |
| 登入但非 admin | 403 `FORBIDDEN` |
| Zod body 失敗 | 400 `VALIDATION_FAILED`，不打 BE |
| BE 409（email 重複） | 409 透傳，inline「此 email 已被使用」 |
| BE 422 | 422 透傳，message 來自 `details` |
| BE 5xx / timeout | 502 / 504（既有 BffError） |
| 缺 CSRF（寫入方法） | 403 `CSRF_INVALID` |

> **關鍵：BFF 帶 `session.accessToken` 當 Bearer 打 BE。** 即使 BE `/users` 現在無守門（[§4.3](#43-兩個後端缺口本-spec-的-be-依賴)），BFF 一律帶 admin token，等 BE 補 `require_role(ADMIN)` 後零改動即相容。

### 5.5 靜態 UI prototype 狀態（v0.2）

A 子模組的**畫面已可跑**（`pnpm dev` → `/cms/users`），供視覺 / 排版 / 互動驗收；資料 / 邏輯層待後續 PR。符合 [CLAUDE.md](../../CLAUDE.md)「純 UI 可先刻、測試後補、e2e 兜底」。

**已落地檔案**：`page.tsx`（RSC 外殼）、`UsersTable.tsx`、`UserFormSheet.tsx`、`mock-users.ts`。

**已實作（對 in-memory `mock-users.ts` 操作）**：
- 列表渲染（RWD 手機卡片 / `sm:` 表格）、狀態徽章、帳號數。
- 搜尋（即時 filter，名稱 + email）、狀態分段控制（全部 / 啟用 / 停用）。
- 新增 / 編輯共用 `UserFormSheet`（inline 驗證：name 必填、email 格式）、`is_active` switch（僅編輯）。
- 刪除確認 `BottomSheet`；建立 / 編輯 / 刪除即時反映到清單。
- 空狀態（有搜尋字串 → 「找不到符合的使用者」；否則 → 「尚無使用者」）。

**刻意未做（待資料 / gate 接上）**：
| 項目 | 現況 | 接上時 |
|---|---|---|
| Admin gate | 無（`page.tsx` 未掛 `requireAdminSession`）| §3.5 RSC gate + §3.6 `createAdminRoute` |
| 資料來源 | `mock-users.ts` local state | TanStack Query → `GET /api/cms/users`（§5.4）|
| 提交 | 改 local state | 打 BFF、`invalidateQueries`、成功 toast |
| email 重複 / 422 | 無（只有 client 格式驗證）| BE 409 → inline「此 email 已被使用」（§5.4）|
| 載入 / 網路錯誤態 | 無（無 fetch）| `<Spinner/>` + [spec 006](./006-error-handling.md) 錯誤處理 |
| 搜尋 debounce | 即時 filter | `useDebouncedValue` 150ms |
| 單元測試 | 無（純視覺）| §8.1 `UsersTable.test.tsx` / `UserFormSheet.test.tsx` |

**預覽方式**：`/cms*` 被 [spec 010](./010-cms-auth-gate.md) proxy 以 cookie **存在性**守門，而本頁尚無 RSC gate → 在 DevTools 設任意非空 `document.cookie = 'streamsight_session=preview'` 即可進入預覽。

---

## 6. B — 自助個人資料（`/cms/settings`）

> **前向設計 / BE 依賴**：本節寫 FE/BFF 目標與 Zod 契約，但 [§4.3](#43-兩個後端缺口本-spec-的-be-依賴) 指出**後端寫入端點不存在**。故本節分「可立即做」與「待 BE」。

### 6.1 可立即做（讀）

`GET /admin/me` 已存在。`/cms/settings` RSC 用 `requireAdminSession()` 拿 session，client 打 `GET /api/cms/me`（BFF → BE `/admin/me`）顯示 name / email / 狀態。**唯讀畫面本期即可交付。**

### 6.2 待 BE（寫）

| 功能 | 需要的 BE 端點（**目前不存在**） | FE 已備妥 |
|---|---|---|
| 改 name / email | `PATCH /admin/me`（`{ name?, email? }`） | `ProfileUpdate` Zod、`PATCH /api/cms/me` route 設計 |
| 改密碼 | `POST /admin/password/change`（`{ current, next }`） | 表單 + Zod（對齊 [spec 007 §2.4](./007-register-page.md) 密碼規則 8–256） |
| 刪除 / 停用自己 | `DELETE /admin/me` 或 archive | 二次確認 UI → 登出流程 |

`PATCH /api/cms/me` 的 BFF 用 `createRoute({ requireAuth: true })`（**不是** `createAdminRoute`——自助不限 admin，任何登入者改自己）。改完若動到 name/email，需**同步更新 iron-session 內的 `user`**（否則 CMS 標頭仍顯示舊名）：`getSessionService().update(...)`。

> 端點就位前，B 的寫入 UI 以 disabled + tooltip「功能建置中」佔位，或整段延到後續 PR。列 [§9](#9-開放問題)。

---

## 7. 安全 / Threat model

| 情境 | 該擋？ | 怎麼擋 |
|---|---|---|
| 未登入訪客訪 `/cms/users` | ✅ | proxy（[spec 010](./010-cms-auth-gate.md)）+ `requireAdminSession()` |
| 登入的 **User（非 admin）** 訪 `/cms/users` | ✅ | `requireAdminSession()` role gate → redirect + toast |
| User 直接打 `/api/cms/users*` BFF | ✅ | `createAdminRoute` 403 |
| 瀏覽器繞過 BFF 直打 BE `/users`（無守門） | ⚠️ 部分 | BE 對外不公開（BFF 隱藏）；**仍需 BE 補 `require_role`**（[§4.3](#43-兩個後端缺口本-spec-的-be-依賴) / [§9](#9-開放問題)）——深度防禦 |
| Admin 中途被降權（session 還在） | ✅ | 頁內 fetch 走 `ensureAdminAccess`；BE 403 → destroy session + redirect |
| CSRF（改別人 / 改自己） | ✅ | 寫入方法經 `verifyCsrf`（非 csrfExempt）；client 用 `src/lib/client/csrf.ts` 取 token |
| Admin 刪掉自己（`/cms/users` 誤刪 admin 帳號） | ⚠️ | `/users` 只含 User（role=0），admin 不在此列表，天然隔離；B 的「刪自己」另有二次確認 |

---

## 8. 測試

### 8.1 強制 TDD（邏輯 / 資料 / route）

| 檔 | 案例重點 |
|---|---|
| `src/lib/schemas/user.ts.test.ts` | `UserCreate` email 格式 / name 長度邊界；`UserUpdate` 全 optional；`BackendUserResponse` snake 欄位 + `toClientUser` 映射 |
| `src/lib/api/create-admin-route.test.ts` | ①session=null→401 ②session.role=USER→403 ③role=ADMIN→進 handler ④POST 缺 CSRF→403 ⑤csrf 正確→通過 |
| `src/app/api/cms/users/route.test.ts` | GET happy（帶 Bearer、snake→camel）、POST happy 201、POST BE 409 透傳、非 admin 403、Zod fail 400、BE 5xx→502 |
| `src/app/api/cms/users/[id]/route.test.ts` | PATCH `isActive→is_active` 映射、DELETE 204 透傳、id 非數字→400、BE 404 透傳 |
| `src/app/cms/users/UsersTable.test.tsx` | 渲染列 / 空清單 EmptyState / 搜尋 debounce filter / 狀態篩選 / 點編輯開 sheet / 刪除二次確認 |
| `src/app/cms/users/UserFormSheet.test.tsx` | 建立必填擋 submit、email 格式 inline、編輯帶入初值、409 inline「此 email 已被使用」、成功關 sheet + invalidate |
| `src/app/api/cms/me/route.test.ts` | GET happy（→BE `/admin/me`）；PATCH（待 BE，可先寫 skipped/紅） |

### 8.2 RSC（免測，信賴上游）

`page.tsx` 只有 `requireAdminSession()` 一行守門（其邏輯已由 [`requireAdmin.test.ts`](../../src/lib/session/requireAdmin.test.ts) 覆蓋）+ render，不另寫 RSC 測試（同 [spec 010 §6.2](./010-cms-auth-gate.md)）。

### 8.3 e2e（PR 前）

`tests/e2e/user-management.spec.ts`：admin 登入 → `/cms/users` → 新增 User → 出現在列表 → 編輯改名 → 停用 → 刪除；另一條：User 登入訪 `/cms/users` → 跳首頁 + toast「需要管理員權限」。

---

## 9. 開放問題

- **BE `/users` 補 admin 守門**（**最高優先**）：`GET/POST/{id}` 目前無認證（[§4.3](#43-兩個後端缺口本-spec-的-be-依賴)）。BFF gate 是必要但非充分；建議獨立 BE PR 掛 `require_role(Role.ADMIN)`。在此之前，A 的資料安全**僅**靠「BE 不對外公開 + BFF gate」。
- **spec 012 role 修正的順序依賴**（[§2.1](#21-role-值以-spec-012-為準-user0-admin1)）：A 的 admin gate 正確性繫於 `Role.ADMIN` 常數翻正；A 的實作需排在 spec 012 M1 之後或同批。
- **B 自助寫入端點缺**（[§6.2](#62-待-be寫)）：`PATCH /admin/me` / 改密碼 / `DELETE /admin/me` 都不存在。需 BE 提供；FE Zod/UI 先備妥。
- **搜尋 / 分頁在 client 還是 server**：BE `GET /users` 無 query 參數、一次回全量。demo 資料量小 → client-side filter 夠用；量大時需 BE 加 `?q=` / cursor 分頁（對齊既有 [`pagination.ts`](../../src/lib/schemas/pagination.ts)），再改成 infinite query。
- **RSC 首屏 vs 純 client 抓**：本 spec 取純 client（TanStack Query）以利搜尋/失效；若要首屏 SEO/速度，可 RSC 預抓 + hydrate。demo 走簡單路線。
- **Admin 管理 Admin**：後端**無** admin CRUD（`/admin/*` 只有 login+me）；[BE `admin-account-refinement`](../../../StreamSightBackend/docs/specs/admin-account-refinement.md) + [`rbac.md`](../../../StreamSightBackend/docs/specs/rbac.md)（`AdminRole` 階梯 / `set_role` / archive-restore）皆 Draft 未實作。本模組 A **只管 User**；管理 admin / 升降權另立 spec。
- **啟用停用 vs 軟刪除**：User 只有 `is_active`（軟停用）+ 硬 `DELETE`。archive/soft-delete 是 admin 專屬 draft，未落到 User。刪除語意本期即硬刪（BE `DELETE /users/{id}`）。
- **i18n**：所有訊息 hardcode 中文；接 next-intl 後抽 string table（同 spec 007 §8）。

---

## 10. 變更紀錄

| 版本 | 日期 | 變更 |
|---|---|---|
| 0.1 | 2026-07-18 | 初版，補建缺漏的 spec 011：(a) 整理已落地的 admin gate 基礎建設（§3.2 session role / §3.4 JWT role decode / §3.5 `requireAdminSession`+`ensureAdminAccess`），對齊程式碼既有 `Spec 011 §…` 註解；(b) 定義待實作的 `createAdminRoute`（§3.6）；(c) 以 [spec 012](./012-backend-auth-integration.md) 為權威契約釘死 role 值（`USER=0/ADMIN=1`）與後端端點，標記現行 `Role` 常數 drift 與順序依賴；(d) A 子模組（`/cms/users`）：對接**已存在**的 BE `/users` CRUD，含 UI/行為契約/Zod/BFF route/測試計畫；(e) B 子模組（`/cms/settings`）：唯讀（`/admin/me`）可即做、寫入端點標為 BE 依賴；(f) 揭露兩個後端缺口（`/users` 無守門、自助寫入端點不存在）並列 §9 開放問題與 threat model。 |
| 0.2 | 2026-07-18 | **對齊 A 子模組靜態 UI 實作**：(a) 修正視覺契約——舊版 §5.1 從 spec 005/007 抄來「brand 紅 header」是深色化前的過時描述；改為專案實際的**深色 observability + electric cyan** design system，header 補設計系統聲明、§5.1 className/token 對照表全面重寫（`surface-*` / `ink-*` / `brand` / `ok` / `danger`，主 CTA cyan、破壞性操作 danger、狀態 ok/ink-A）；(b) 登錄已落地的 prototype 檔案（`page.tsx` / `UsersTable.tsx` / `UserFormSheet.tsx` / `mock-users.ts`）到檔案清單，與「待實作」分開列；(c) 新增 [§5.5 靜態 UI prototype 狀態](#55-靜態-ui-prototype-狀態v02)：已實作互動（搜尋 / 狀態分段控制 / 建立編輯 sheet / `is_active` switch / 刪除確認 BottomSheet / 空狀態）vs 刻意未做（gate / 資料 / toast / debounce / 測試）對照表 + 預覽方式；(d) 回寫建置期決策：刪除確認用 `BottomSheet`（非 `window.confirm`）、狀態篩選用分段控制、EmptyState 用 `/figma/empty-no-data.png`、RWD 手機卡片→`sm:` 表格；(e) §5.2 加註「靜態階段跑 local state」。**契約 / BFF / 後端 / 測試計畫（§3–4、§5.3–5.4、§7–9）不變。** |
