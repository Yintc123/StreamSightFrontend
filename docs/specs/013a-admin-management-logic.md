# Spec 013a — Admin 管理：業務邏輯（契約 / 授權 / BFF / mutation）

狀態：Draft **v0.1**（2026-07-18，自 spec 013 v0.3 拆出）
關係：本檔為 [spec 013（索引）](./013-admin-management-page.md) 的**業務邏輯半**。
頁面 / 元件 / 視覺 / 遷移 / e2e 見 [spec 013b](./013b-admin-management-ui.md)。
後端契約權威 = [spec 012a](./012a-backend-auth-logic.md)。

> 章節號對照（供引用定位）：本檔 §1＝原 013 §3、§2＝原 §4（授權）、§3＝原 §5（BFF）、
> §4＝原 §6（Zod）、§5＝原 §8（mutation）、§6＝原 §9（邏輯測試）。頁面/元件（原 §7/§10）移至 013b。

---

## 0. 硬前置（**必須先落地**）

1. **[spec 012a](./012a-backend-auth-logic.md) 核心 auth bridge**（login 改打 `/admin/auth/login`、Role 對齊、refresh 修正）。
2. **[012a §4.8](./012a-backend-auth-logic.md)**：session 帶 **`adminRole`**——本頁 SUPER_ADMIN gate（頁面 + BFF）直接依賴。
3. **[012a §4.10](./012a-backend-auth-logic.md)**：`backendFetch` 扁平錯誤碼解析 + 401 refresh 策略修正——本頁每個
   `/admin/admins` 呼叫都是已登入呼叫，不修的話 access token 一過期就被強制登出而非 refresh。

> **spec 013 的開發應排在 spec 012 完成之後。**

一般依賴：既有 `createRoute`（`src/lib/api/create-route.ts`，支援 `requireAuth`/`paramsSchema`/`querySchema`/
CSRF/session）、`backendFetch`、iron-session/Redis session、CSRF（spec 001b/c/d）、spec 006（錯誤處理）。

---

## 0. 復用對照（既有資產，開發前先讀）

> 2026-07-18 盤點結果。**整個 BFF 基礎層已存在**；本頁的邏輯多為「照範本 + adapter」而非新建。

### 0.1 直接複用（as-is）

| 既有檔 | 用途 | 用在 |
|---|---|---|
| `src/lib/api/create-route.ts` | 路由工廠(requireAuth/params/query/body schema/CSRF/session touch) | `createAdminRoute` **薄封裝它**(§3.1) |
| `src/lib/api/backend.ts` `backendFetch` | 帶 Bearer、`passClientErrors`、error 映射 | 所有 `/admin/admins*` 呼叫 |
| `src/lib/api/responses.ts` `okResponse` + `src/lib/schemas/envelope.ts` | `{data}`/`{error}` 外層 | 對外回應 |
| `src/lib/api/parsers.ts` | `parseBody/Query/PathParams` | createRoute 內部已用 |
| `src/lib/session/service.ts` `getSessionService()` | create/update/destroy/refresh/touch | 改密碼後 destroy |
| `src/lib/session/requireAdmin.ts` | `ensureAdminAccess`(401/403→destroy+redirect) | 降權即時性(§2) |
| `src/lib/errors/*` | `ForbiddenError`/`BackendClientError`/`toErrorResponse` | 403 gate、409/422 透傳 |
| `src/lib/auth/decodeJwtPayload.ts` | 讀 JWT sub/role/grade | — |
| `src/lib/client/csrf.ts` `getCsrfToken()` | client 取 CSRF | mutation 前(已存在) |

### 0.2 複用為模板 / 遵循既有慣例

| 既有 | → 新 | 說明 |
|---|---|---|
| `src/lib/api/create-route.ts` | `create-admin-route.ts`(§3.1) | Omit `requireAuth`、恆 true + super_admin 斷言 |
| `src/lib/schemas/auth.ts`（snake→camel + 常數 `PASSWORD_MIN/MAX` 等）、`pagination.ts` | `src/lib/schemas/admin.ts`(§4) | 沿用 adapter 風格；時間戳 `z.string()` |
| `src/app/api/auth/login|register/route.ts`（two-leg backendFetch + adapter + `passClientErrors`） | `/api/cms/admins*` routes(§3.2) | route 樣板 |
| `src/app/api/csrf/route.ts`（簡單 requireAuth GET） | `/api/cms/me` GET | 樣板 |
| `src/lib/mock/auth-mock.ts` + `register.ts` | `admin-mock.ts`(§3.3) | 執行期 mock；**需先擴充 `dispatch.ts` 中段 param** |
| `tests/mocks/handlers.ts` + `tests/helpers/backend-mock.ts` `mockBackend()` | admin MSW handlers(§3.3、§6) | 錯誤/守衛測試基座 |

### 0.3 ⚠️ 盤點時發現、與既有 code 的差異（**非「已實作」**）

- **`backendFetch` 錯誤契約尚未修**：現行讀**巢狀** `errBody.error.code`、只在 `AUTH_TOKEN_EXPIRED` 才 refresh
  （`backend.ts:96,98`）。本頁每個呼叫都是已登入呼叫，**依賴 [012a §4.10](./012a-backend-auth-logic.md) 先修**成扁平碼 + `if(activeSession)` refresh。
- **`create-admin-route.ts` 不存在**：現行 admin gate 只在 RSC(`requireAdminSession`)；BFF 層是手動 inline
  `if(session.role!==Role.ADMIN)`。本頁 §3.1 正式建立薄封裝，且 gate 是 **`role===ADMIN && adminRole==='super_admin'`**（非只 ADMIN）。
- **`auth-mock` 發 `role: Role.ADMIN`（現 =0）**：[012a §4.6](./012a-backend-auth-logic.md) role 翻正後需一起改。

---

## 1. 後端契約（source of truth = [012a §2.8](./012a-backend-auth-logic.md) + 後端 admin-management-api.md）

所有 `/admin/admins/...` 端點**限 SUPER_ADMIN**（`require_min_admin_role(SUPER_ADMIN)`）；
`/admin/me*` 為任何已認證 admin 自助。全部 snake_case。

| 用途 | 後端端點 | 授權 | 成功碼 | 回應 DTO |
|---|---|---|---|---|
| 列表（篩狀態、分頁） | `GET /admin/admins?status=&limit=&offset=` | SUPER_ADMIN | 200 | `AdminListResponse` |
| 新增 | `POST /admin/admins` | SUPER_ADMIN | 201 | `AdminResponse` |
| 明細 | `GET /admin/admins/{id}` | SUPER_ADMIN | 200 | `AdminSummary` |
| 改名 | `PATCH /admin/admins/{id}` | SUPER_ADMIN | 200 | `AdminResponse` |
| 升降權 | `PUT /admin/admins/{id}/role` | SUPER_ADMIN | 200 | `AdminResponse` |
| 封存 | `POST /admin/admins/{id}/archive` | SUPER_ADMIN | 200 | `AdminSummary` |
| 解除封存 | `POST /admin/admins/{id}/unarchive` | SUPER_ADMIN | 200 | `AdminSummary` |
| 軟刪除 | `DELETE /admin/admins/{id}` | SUPER_ADMIN | **200** | `AdminSummary` |
| 復原 | `POST /admin/admins/{id}/restore` | SUPER_ADMIN | 200 | `AdminSummary` |
| 改自己密碼 | `POST /admin/me/password` | 已認證 admin | 204 | — |
| 讀自身 | `GET /admin/me` | 已認證 admin | 200 | `AdminResponse` |

### 1.1 DTO（後端 snake_case）

```
AdminResponse  = { id:int, username:str, name:str, admin_role:"super_admin"|"editor"|"viewer" }
AdminSummary   = AdminResponse + {
  is_protected:bool, is_active:bool,
  archived_at:datetime|null, archived_by:int|null, archived_by_username:str|null,
  deleted_at:datetime|null,  deleted_by:int|null,  deleted_by_username:str|null,
  created_at:datetime, updated_at:datetime
}
AdminListResponse = { items:AdminSummary[], total:int, limit:int, offset:int }

# requests
AdminCreateRequest     = { username, name, password, admin_role?=viewer }
AdminUpdateRequest     = { name }
AdminRoleUpdateRequest = { admin_role }
ChangeOwnPasswordRequest = { current_password, new_password }
```
- `id` 為 **admin child PK**（int），非 principal_id。`status` ∈ `active|archived|deleted|all`（預設 active）；
  `limit` 預設 50 上限 200；`offset ≥ 0`。

### 1.2 業務規則（後端強制，前端據此做 UX affordance；**後端 422 為權威**）

| 規則 | 後端行為 | 前端 UX（UI 呈現見 013b） |
|---|---|---|
| 受保護 root（`is_protected=true`） | 降級/封存/刪除 → **422** | 該列動作鈕全禁用，標「root · 不可移除」 |
| 移除 super_admin | 直接 archive/delete → **422**（須先降級） | 對 super_admin 只顯示「先降級」，隱藏直接封存/刪除 |
| 對自己操作 | 自我 archive/delete/自我提權 → **422** | 自己那列禁用危險動作 |
| username 重複 | 建立 → **409** | 表單 inline「帳號已被使用」 |
| username 格式 / 新舊密碼相同 | **400** | inline 錯誤 |
| DTO 驗證（長度） | **422**（pydantic） | 前端 Zod 先擋 |
| 等級不足 / 非 admin | **403** | 見 §2（不該發生：頁面已 gate） |
| 不存在 / 已軟刪除 | **404** | toast「該帳號不存在或已刪除」，refetch 列表 |

---

## 2. 授權模型（頁面 + BFF 雙層 gate）

`/admin/admins/...` 限 SUPER_ADMIN，所以**整個 admin 管理頁面限 SUPER_ADMIN**。

- **頁面 gate（RSC）**：新增 `requireSuperAdminSession()`（`requireAdmin.ts` 旁），session 需 `role===ADMIN`
  **且** `adminRole===SUPER_ADMIN`（來自 [012a §4.8](./012a-backend-auth-logic.md) 存入 session 的 `adminRole`）。
  非 super_admin（editor/viewer）→ `redirect('/cms?reason=not-super-admin')`。
- **BFF gate**：`createAdminRoute` 再加一層 super_admin 檢查（§3.1）；即使頁面被繞過，BFF 仍擋。最終權威仍是後端 403/422。
- **導覽可見性**（UI，見 013b）：CMS 導覽只在 `adminRole===SUPER_ADMIN` 顯示入口——**純 UX、非安全邊界**。
- ⚠️ **降權即時性**（後端 rbac）：`grade`/`adminRole` 在 token 內最多陳舊一個 access TTL。若「被降權的是自己」，
  前端收到後端 403/422 時應 `destroy session`→重登（沿用既有 `ensureAdminAccess` 的 403 處理）。

---

## 3. BFF 路由設計（對外 camel、對內貼後端 snake）

對外沿用專案慣例：成功 `{ data: ... }`；錯誤走既有 error envelope（spec 006）。
所有寫入端點**非 csrfExempt**（登入態，需 CSRF token）。

### 3.1 `createAdminRoute`（`src/lib/api/create-admin-route.ts`，新）

**最佳實踐：不重造，薄封裝既有 `createRoute`。** `createRoute` 已提供 `requireAuth`、`paramsSchema`/
`querySchema`/`bodySchema` 解析、CSRF、session 單次讀取與 `touch`。`createAdminRoute` **只補三件事**：

1. **強制 `requireAuth: true`**（handler 拿到的 `session` 型別即非 null）。
2. **SUPER_ADMIN 斷言**：進 backend 呼叫前檢查 `session.role === Role.ADMIN && session.adminRole === 'super_admin'`，
   否則丟 `ForbiddenError`（403）。`role !== ADMIN`（一般 user）→ 403；`adminRole !== super_admin`（editor/viewer）→ 403。
3. **簽名對齊**：泛型/選項與 `createRoute` 一致，只是省去 `requireAuth` 參數（恆 true）。

```ts
export function createAdminRoute<TBody, TQuery, TParams>(
  opts: Omit<RouteOptions<TBody, TQuery, TParams, true>, 'requireAuth'>,
) {
  return createRoute<TBody, TQuery, TParams, true>({
    ...opts,
    requireAuth: true,
    handler: (args) => {
      const { session } = args // StoredSession（requireAuth:true）
      if (session.role !== Role.ADMIN || session.adminRole !== 'super_admin') {
        throw new ForbiddenError('super admin required')
      }
      return opts.handler(args)
    },
  })
}
```
- handler 內對 `backendFetch(path, { session, passClientErrors })` 帶 `session` → 自動附 Bearer + 走
  [012a §4.10](./012a-backend-auth-logic.md) 修正後的 401→refresh→重試 / destroy 流程。
- 依賴 `session.adminRole`（[012a §4.8](./012a-backend-auth-logic.md)）與 `ForbiddenError`（已存在）。
- **TDD**：無 session→401；`role=USER`→403；admin 但 `adminRole=viewer/editor`→403；`super_admin`→通過；非安全方法缺 CSRF→阻擋。

### 3.2 路由表（前端 BFF）

| 前端 BFF | Method | 對接後端 | wrapper | 說明 |
|---|---|---|---|---|
| `/api/cms/admins` | `GET` | `GET /admin/admins` | `createAdminRoute` | 透傳 `status/limit/offset`；回 `{ data: { items, total, limit, offset } }`（snake→camel adapter） |
| `/api/cms/admins` | `POST` | `POST /admin/admins` | `createAdminRoute` | body `{ username, name, password, adminRole }`→snake；`passClientErrors`（409/400/422 透傳） |
| `/api/cms/admins/[id]` | `GET` | `GET /admin/admins/{id}` | `createAdminRoute` | 明細 |
| `/api/cms/admins/[id]` | `PATCH` | `PATCH /admin/admins/{id}` | `createAdminRoute` | body `{ name }` |
| `/api/cms/admins/[id]/role` | `PUT` | `PUT /admin/admins/{id}/role` | `createAdminRoute` | body `{ adminRole }` |
| `/api/cms/admins/[id]/archive` | `POST` | `POST /admin/admins/{id}/archive` | `createAdminRoute` | |
| `/api/cms/admins/[id]/unarchive` | `POST` | `POST /admin/admins/{id}/unarchive` | `createAdminRoute` | |
| `/api/cms/admins/[id]` | `DELETE` | `DELETE /admin/admins/{id}` | `createAdminRoute` | 軟刪除；回更新後 summary |
| `/api/cms/admins/[id]/restore` | `POST` | `POST /admin/admins/{id}/restore` | `createAdminRoute` | |
| `/api/cms/me/password` | `POST` | `POST /admin/me/password` | **`createRoute({requireAuth:true})`** | body `{ currentPassword, newPassword }`；204 |
| `/api/cms/me` | `GET` | `GET /admin/me` | **`createRoute({requireAuth:true})`** | 供前端取自身 `id`（child PK）做「自己那列」判定 |

- **wrapper 選用（定案）**：`/api/cms/admins*`（管理他人）全部 `createAdminRoute`（限 SUPER_ADMIN）；
  **`/api/cms/me` 與 `/api/cms/me/password`（自助）用 `createRoute({requireAuth:true})`，不是 `createAdminRoute`**
  ——自助端點對任何已認證 admin 開放（editor/viewer 也能讀自己、改自己密碼），對接後端 `/admin/me*`。
  兩者非安全方法皆非 `csrfExempt`。
- **adapter**：`adaptAdminSummary`（snake→camel：`admin_role→adminRole`、`is_protected→isProtected`、
  `is_active→isActive`、`archived_at→archivedAt` …）、`adaptAdminResponse`。集中在 `src/lib/schemas/admin.ts`。
- **時間戳格式（定案）**：所有 `*_at`／`*At` 一律**保留後端 ISO 字串**（Zod 用 `z.string()`），**不轉 epoch-ms**。
  對齊 spec 011 `BackendUserResponse` 既有慣例；格式化交 UI 層。

### 3.3 Mock 與測試分層（**重要：CI 跑 `USE_MOCK=1`**）

兩種 mock 層級，**別混用**：

- **單元/整合測試（Vitest + MSW）**：MSW 在 HTTP 層攔截 `backendFetch` 對後端的 fetch，handlers 放
  `tests/mocks/handlers.ts`。**可自由回任意路徑與狀態碼（409/422/404/403）**，故**所有錯誤路徑與生命週期
  端點的測試走這裡**。BFF route 測試以此為主。
- **執行期 mock（`USE_MOCK=1`，dev server / e2e smoke 無真後端）**：走 `src/lib/mock`
  （`registerMock`/`resolveMock`），需新增 `admin-mock` handlers 覆蓋 `/admin/admins`、`/admin/me` 等。

執行期 mock harness 兩個限制的處置（Q6 已定案）：
1. **中段參數（本期擴充）**：`registerMock` 現只支援結尾單一 `:param`（`dispatch.ts:27-29` 對中段參數 throw，
   `dispatch.test.ts:71` 有守）。本頁需 `/admin/admins/:id/role|archive|unarchive|restore`（中段 `:id` + 結尾動作）→
   **本期擴充 `registerMock`/`resolveMock` 支援中段 `:param`**（多段 pattern 比對），否則生命週期端點在
   `USE_MOCK=1` 下連 happy path 都跑不了。小範圍 `dispatch.ts` 修改，**需先寫測試**（現有結尾 `:param` 行為不可回歸）。
2. **無狀態碼（不擴充）**：mock handler 只回成功 body，無法模擬 409/422/404。**刻意不擴充**（過度工程）。→
   `USE_MOCK=1` e2e **只覆蓋 happy path**；錯誤與守衛一律靠上面的 **MSW 單元/整合測試**。

---

## 4. Zod 契約（`src/lib/schemas/admin.ts`，強制 TDD）

- `AdminRole = z.enum(['super_admin','editor','viewer'])`。
- `BackendAdminResponse`（snake）、`BackendAdminSummary`（snake，時間戳 `z.string()`）、`BackendAdminListResponse` — 驗後端回應。
- `AdminCreateInput`（client + BFF inbound，camel）：`username`（1–100）、`name`（1–100）、`password`（8–128）、
  `adminRole`（enum，預設 viewer）。
- `AdminUpdateInput = { name }`、`AdminRoleInput = { adminRole }`、`ChangePasswordInput = { currentPassword, newPassword(8–128) }`。
- `ClientAdmin`（UI 用 camel 型別）：`{ id, username, name, adminRole, isProtected, isActive, archivedAt, deletedAt, createdAt, ... }`（時間戳為 ISO 字串）。

---

## 5. 資料抓取與 mutation

- **TanStack Query**：`useQuery(['cms-admins', status])` 抓列表；mutation（create/update/role/archive/unarchive/
  delete/restore）成功後 `invalidateQueries(['cms-admins'])`。
- **樂觀更新**可選；生命週期動作回更新後 `AdminSummary`，可直接寫回快取。
- **錯誤映射**（§1.2）：409→表單 inline；422→toast 顯示後端 message（受保護/兩步/自我）；404→toast + refetch；
  403→`ensureAdminAccess` 式 destroy+redirect（降權即時）。
- **改密碼**：成功(204)後後端已撤所有 refresh token → 前端 destroy session + 導登入，提示重登。

---

## 6. TDD 測試計畫（邏輯/資料類，強制）

- `schemas/admin.ts`：各 Zod happy + edge（enum 未知值、長度邊界、snake→camel adapter、時間戳保留字串）。
- `createAdminRoute`：無 session→401；role=USER→403；admin 但非 super_admin→403；super_admin→通過；CSRF 缺失→阻擋。
- BFF routes（Vitest + MSW）：list 透傳 status/分頁；create 409/400/422 透傳；lifecycle 200 回 summary；
  role 422（受保護/自我提權）透傳；me/password 204→session destroy 流程；`/api/cms/me` GET 回自身 id。
- **錯誤/守衛測試一律走 MSW**（§3.3）：409/422/404/403 在 HTTP 層模擬，不靠執行期 mock。
- （元件層測試 `AdminsTable` 等見 [013b](./013b-admin-management-ui.md)。）

---

最後更新：2026-07-18（v0.2，自 spec 013 v0.3 拆出業務邏輯半；+§0 復用對照）
