# Spec 012a — Backend Auth：業務邏輯（契約 / BFF / adapter）

狀態：**已實作（2026-07-18）**（v0.3；原 Draft v0.1，自 spec 012 v0.4 拆出）
關係：本檔為 [spec 012（索引）](./012-backend-auth-integration.md) 的**業務邏輯半**。
UI 面向（移除公開註冊、LoginCard 行為）見 [spec 012b](./012b-backend-auth-ui.md)。
**後端契約 source of truth = 本檔 §2**（2026-07-18 讀 `/StreamSightBackend` 原始碼驗證）。

> **實作對齊（2026-07-18）**：§4 全數落地——`schemas/auth.ts`（`BackendTokenResponse`/`adaptTokenResponse`/
> `BackendAdminMeResponse`/`AdminRole`）、`Role` 翻正 `{USER:0,ADMIN:1}` + `adminRole`、`backend.ts` 扁平錯誤碼 +
> `if(activeSession)` 401 refresh、login route 打 `/admin/*` + `userId=sub` + 存 `adminRole`、`service.refresh()`
> snake+Zod+adapter、`REFRESH_LOCK_TTL_MS=15s`、mock 對齊。§7 驗收全數對應到測試（見章末勾選）。
> 額外：`backend.ts` 加 **204 No Content** 處理（供 013a `/me/password` 等）。

> 章節號對照（供外部引用定位）：本檔 §2＝原 012 §3、§3＝原 §4、§4＝原 §5（邏輯部分）、
> §5＝原 §6、§6＝原 §7（邏輯步驟）、§7＝原 §8（邏輯驗收）。原 §5.3（註冊移除）移至 012b。

---

## 1. 名詞

| 詞 | 意義 |
|---|---|
| principal | 後端帳號主體，`principals.id`（int）。JWT 的 `sub`。user / admin 各以 `principal_id` 一對一掛上。 |
| role | **principal 型別判別子**，JWT 整數 `role` claim。`Role`：**`USER=0`、`ADMIN=1`**（`app/core/enums.py`）。 |
| admin_role | **admin 型別內的權限階梯**（有序），存 `admins.admin_role`。`SUPER_ADMIN > EDITOR > VIEWER`。 |
| grade | JWT 字串 claim，該身分的等級：admin→`admin_role`、user→`user_tier`。**僅 UX 提示、非授權邊界**。 |
| access token | JWT，HS256，30 分鐘，帶 `role` + `grade` claim。 |
| refresh token | opaque 隨機字串，14 天，單次使用、rotation、family + reuse detection。 |
| family | 同一次登入的 refresh 輪替鏈共用 `family_id`；reuse 偵測以 family 連坐撤銷。 |

---

## 2. 後端契約（Source of Truth）

> 均為 **2026-07-18** 讀 `/StreamSightBackend` 原始碼所得。**全部 snake_case，無全域 camelCase alias**。

### 2.1 端點總表（無全域路由前綴）

| 用途 | Method + Path | 認證 | Request | Response |
|---|---|---|---|---|
| **後台登入** | `POST /admin/auth/login` | — | **`{ username, password }`** | `TokenResponse`（role=1，grade=admin_role） |
| **後台 me** | `GET /admin/me` | Bearer(role=1) | — | **`AdminResponse`** |
| 一般登入 | `POST /auth/login` | — | `{ email, password }` | `TokenResponse`（role=0） |
| 一般 me | `GET /users/me` | Bearer(role=0) | — | `UserResponse` |
| 註冊（**只建一般 user**） | `POST /auth/register` | — | `{ email, name, password }` | `TokenResponse`（role=0），201 |
| **建 admin（管理）** | `POST /admin/admins` | **Bearer(SUPER_ADMIN)** | `{ username, name, password, admin_role }` | `AdminResponse`，201 |
| Refresh | `POST /auth/refresh` | — | `{ refresh_token }` | `TokenResponse`（角色無關重簽） |
| 登出 | `POST /auth/logout` | — | `{ refresh_token }` | 204 |
| 全裝置登出 | `POST /auth/logout-all` | Bearer | — | 204 |

來源：`app/api/routers/{admin,auth,users}/router.py`，`app/api/__init__.py`（`api_router` 無 prefix）。

> ⚠️ **本期只用後台線**（admin username 登入 + `/admin/me`）。一般 user 線本期**不接**（見 [索引 §OQ-Q5](./012-backend-auth-integration.md)：本專案不碰一般 user）。

### 2.2 JWT access token

- 演算法 HS256（`settings.jwt_algorithm`），簽章 key `jwt_secret_key`。
- 有效期 `jwt_access_token_expire_seconds`，**預設 1800s（30 分）**。
- Payload（`app/core/auth/jwt.py:38-46`）：
  ```json
  { "sub": "<principal_id>", "type": "access", "role": 1, "grade": "super_admin", "iat": ..., "exp": ... }
  ```
- `role`：**IntEnum，`USER=0`、`ADMIN=1`**（`app/core/enums.py`）。⚠️ 與現行前端 `Role={ADMIN:0,USER:1}` **相反**（見 §3-M1）。
- `grade`：字串。admin 登入時 = `admin_role`；refresh 每次 rotation 重簽刷新（陳舊窗口 ≤ 一個 access TTL）。**非授權邊界**，僅供 CMS 選單 UX 提示。
- `extract_role` fail-safe：缺 claim / 未知整數 → 退回 `Role.USER`（BFF `resolveRole` 對齊）。
- BFF 只需 base64url 解 payload 讀 `sub`/`role`/`grade`（不驗簽，token 來自可信 fetch）——現有 `decodeJwtPayload` 可用。

### 2.3 Refresh 機制（rotation + reuse detection）

來源：`app/services/auth.py:211-266`、`app/models/refresh_token.py`、`app/core/auth/refresh.py`。

- refresh token = `secrets.token_urlsafe(32)` opaque；DB 只存 `HMAC-SHA256(pepper, token)`。
- 有效期 `refresh_token_expire_seconds`，**預設 1209600s（14 天）**。
- **rotation**：每次 `/auth/refresh` 撤銷舊 token、發新 token，同 `family_id`。
- **單次消費**：原子撤銷（rowcount==1 才贏）。
- **reuse detection**：已撤銷 token 再現 →
  - grace（`refresh_token_reuse_grace_seconds`，**預設 10s**）內：只回 401，不連坐。
  - 超過 grace：**撤銷整個 family**。
- refresh **不需帶 role**：後端查 principal 定型別、依 `principal.role` 重簽正確 role 的 access token（天然防提權），並重簽 `grade`。
- 回應同 `TokenResponse`（見 2.4）；**不回 refresh token 的到期時間**。

### 2.4 Token 回應形狀（`TokenResponse`）

`app/api/routers/auth/schemas.py` + `app/dtos/auth.py:73-88`：
```json
{ "access_token": "<jwt>", "token_type": "bearer", "refresh_token": "<opaque>", "expires_in": 1800 }
```
- **snake_case**；`token_type` 字面值 **`"bearer"`（小寫）**。
- `expires_in` = **access token 剩餘秒數**（相對值）；**無 refresh 到期欄位**。
- `refresh_token` 型別為 `str | None`（login/register/refresh 都會帶）。

### 2.5 `/admin/me` 回應形狀（`AdminResponse`）

`app/api/routers/admin/schemas.py:21-33`：
```json
{ "id": 1, "username": "root", "name": "Root Admin", "admin_role": "super_admin" }
```
- **無 `email`、無 `is_active`、無 `role`**。
- `id` 為 **int**，是 **admin.id（child PK）**，**不是** JWT 的 `sub`(principal_id)。
- `admin_role` 為字串 enum（`super_admin`/`editor`/`viewer`）；為 rbac 等級的權威來源。

### 2.6 錯誤回應

`app/core/exceptions/handlers.py`：
```json
{ "error": "<error_code>", "message": "<str>", "details": { ... } }
```
- `error` 是**扁平字串代碼本身**（`unauthorized`/`forbidden`/`not_found`/`conflict`/`bad_request`/`business_rule_violation`/`validation_error` …），**非巢狀 `error.code`**。⚠️ 現行 `backendFetch` 讀錯此欄（§3-C9 / §4.10）。
- **所有 401 共用泛用碼 `"unauthorized"`**——token 缺失/過期/無效/停用皆同碼，**無 `AUTH_TOKEN_EXPIRED`**。→ BFF 無法靠 error code 區分「該 refresh 還是該 destroy」，改用「有 refresh token 就試一次 refresh + 重試」策略（§4.10）。
- 常見：401（憑證/token 錯，admin 登入統一模糊訊息防列舉）、403（角色/等級不符）、409（重複）、422（body 驗證失敗或 `business_rule_violation`，帶 `details`）。

### 2.7 id / principal 模型

- `principals.id`（int）= JWT `sub`；`users`/`admins` 各以 `principal_id`（unique FK）一對一掛上。
- refresh token 綁 `principal_id`（角色無關）。
- **意涵**：BFF「使用者穩定識別」以 **JWT `sub`（principal_id）** 為準，不要用 `/admin/me.id`（child PK，跨 user/admin 會撞號）。

### 2.8 後端建立 admin 的既有途徑

核心邏輯 `AdminService.create(username, name, password, admin_role=VIEWER, is_protected=False)`（`app/services/admin.py`）。

| 途徑 | 機制 | 認證 | 產出 |
|---|---|---|---|
| `POST /admin/admins` | HTTP API（`admin/router.py:113`） | **需已登入 SUPER_ADMIN** | `is_protected=false` admin，回 `AdminResponse` 201 |
| `scripts/create_admin.py` | CLI seed 腳本（冪等） | 無（直接進 DB） | **初始 root**：SUPER_ADMIN + `is_protected=true`，讀 `INITIAL_ADMIN_*` env |

- 安全模型：「**受保護 root**」——root 由 seed 唯一建立且不可移除；其餘 admin 只能由已登入 SUPER_ADMIN 經 `POST /admin/admins` 建。**沒有任何匿名/公開的 admin 建立途徑。** → 支撐 [索引 §OQ-Q3](./012-backend-auth-integration.md)「移除公開自助註冊」決策，Admin 管理另立 [spec 013](./013-admin-management-page.md)。

---

## 3. 與現行 BFF 的落差（Gap Analysis）

分兩類：**C = 契約/欄位**、**M = 機制**。

| # | 類 | 現行 BFF | 後端實際 | 影響 |
|---|---|---|---|---|
| C1 | 路徑 | `POST /auth/login` + `GET /auth/me` | 後台是 `/admin/auth/login` + `/admin/me`；`/auth/me` 不存在 | 🔴 login step2 404 |
| C2 | login body | `{ identifier, password }` | **`{ username, password }`** | 🔴 422 |
| C3 | register body | `{ username, password, role }` | `/auth/register` 吃 `{ email, name, password }` 且只建一般 user | 🔴 422 / role 被忽略 |
| C4 | 回應命名 | 期望 camel | snake `access_token/refresh_token/expires_in/token_type` | 🔴 Zod parse fail → 502 |
| C5 | `token_type` | `z.literal('Bearer')` | `"bearer"` | 🔴 大小寫 |
| C6 | refresh 到期 | 需要 `refreshExpiresIn` | 只回 `expires_in`（access） | 🔴 缺欄位 |
| C7 | me id 型別 | `z.string()` | int | 🔴 parse fail |
| C8 | me 欄位 | 期望 `username`/`email`/`createdAt`… | `/admin/me` 只有 `{ id, username, name, admin_role }` | 🔴 schema mismatch |
| M1 | role 值 | `ADMIN=0, USER=1` | `USER=0, ADMIN=1`（**相反**） | 🔴 授權倒置（user→admin） |
| M2 | refresh 請求 | body `{ refreshToken }` | `{ refresh_token }` | 🔴 422 |
| M3 | refresh 回應處理 | 無驗證、`{...current,...data}` | 回 snake，key 不同不覆蓋 → 保留舊 token | 🔴 假成功→重放→family 連坐→強制登出 |
| M4 | 到期模型 | 絕對 epoch-ms | 相對秒（`expires_in`），login 有轉、refresh 沒轉 | 🔴 refresh 後到期變 undefined |
| M5 | cache 鍵 | 依 `userId` cache tokens | rotation 依 `family_id`（每登入一條） | 🟡 同 user 多 session 互踩 |
| M6 | 鎖/grace 時序 | `REFRESH_LOCK_TTL_MS=10s` | grace `10s` | 🟡 鎖過期==grace，後端慢於 10s 誤連坐 |
| M7 | admin_role/grade | 不知情 | JWT 帶 grade、`/admin/me` 帶 admin_role | 🟡 CMS 無法區分 SUPER_ADMIN 專屬功能 → §4.8 |
| C9 | 錯誤碼解析 | 讀 `errBody.error.code`（巢狀） | 扁平 `error: "<code>"` | 🔴 `code` 恆 undefined；401 refresh 觸發失效（見 M8） |
| M8 | 401 refresh 觸發 | 僅 `code === 'AUTH_TOKEN_EXPIRED'` 才 refresh | 後端 401 一律泛用 `"unauthorized"` | 🔴 **永不命中 → access token 一過期就強制重登** |

**對得上的**：refresh token 皆 opaque ✅；JWT 帶 role claim ✅；rotation 與 BFF「鎖串行化單次 refresh」happy path 相容 ✅。

---

## 4. 重規劃：BFF 目標設計（邏輯）

### 4.0 設計原則

1. 後端契約固定，落差全由 BFF 吸收。
2. 差異集中在**一層 auth adapter**，不散在各 route。
3. role 值定義**對齊後端**（改前端常數，最小面積）。
4. 對外（瀏覽器）BFF 回應形狀**維持不變**（`{ data: { sessionId, csrfToken, user, expiresAt } }`）。

### 4.1 登入路由分流：只走後台

- `/api/auth/login` 對接 `POST /admin/auth/login` + `GET /admin/me`。一般 user 線本期不接。

### 4.2 登入請求欄位映射（維持 username）

| BFF `/api/auth/login` 收 | 送後端 `/admin/auth/login` |
|---|---|
| `{ identifier, password }` | `{ username: identifier, password }` |

- 登入表單「帳號」欄位維持 username 語意（後端 admin 無 email）。`identifier` 直接當 `username`；後端 DTO strip+lower 正規化。
- 憑證錯 → 後端 401 統一模糊訊息，`passClientErrors` 原樣回，前端顯示「帳號或密碼錯誤」。

### 4.4 回應映射（後端 snake → BFF 內部 camel/絕對時間）

```
adaptTokenResponse(raw, now):
  access_token   → accessToken
  refresh_token  → refreshToken
  expires_in(秒) → accessTokenExpiresAt = now + expires_in*1000
  refresh 到期   → refreshTokenExpiresAt = now + REFRESH_TTL_FALLBACK_MS（14d fallback；見 索引 §OQ-Q2）
  token_type     → 忽略（或 assert 大小寫不敏感 == 'bearer'）
```
- Zod 改驗 **snake_case**（新 `BackendTokenResponse`），移除 `z.literal('Bearer')`、移除必填 `refreshExpiresIn`。
- `/admin/me` adapter：`BackendAdminMeResponse = { id:number, username, name, admin_role:enum }` → 顯示名用 `name`；`id`（child PK）**不進 session userId**（見 4.5）。

### 4.5 使用者識別：改用 JWT `sub`

- session 的 `userId` **改用 JWT `sub`（principal_id）**，不用 `/admin/me.id`。
- `decodeJwtPayload(accessToken)` 取 `sub`（+ `role` + `grade`）；`/admin/me` 只用來拿顯示用 `name`。

### 4.6 Role 對齊

- `src/lib/session/types.ts` 的 `Role` 改為 **`{ USER: 0, ADMIN: 1 }`**（對齊後端）。
- `resolveRole`：直接讀 JWT `role` claim（`0→USER, 1→ADMIN`），未知值 fail-safe 成 USER。**移除**「`/me` 回 role 才用」的分支（`/admin/me` 不回 role）。
- `requireAdmin` / `/cms` gate：`role === Role.ADMIN(1)` 才放行。
- ⚠️ **翻轉風險**：常數改值後，所有比對 `Role.ADMIN`/`Role.USER` 的既有測試斷言與 mock（`auth-mock.ts`）都要同步更新，否則靜默倒置。

### 4.7 Refresh path 修正（關鍵）

`service.refresh()` 現直接 spread 未驗證回應 → 改為：
1. 送 body **`{ refresh_token: current.refreshToken }`**（snake）。
2. 用 `BackendTokenResponse` **Zod 驗證** 回應。
3. 走 `adaptTokenResponse` 轉絕對時間，**確實覆蓋** `accessToken/refreshToken/accessTokenExpiresAt`。
4. 401 → clear cookie + destroy session。

**時序安全（對齊 reuse detection）**：
- `REFRESH_LOCK_TTL_MS`（`src/lib/api/constants.ts`）**從 `10_000` 改為 `15_000`（15s）**，使鎖 TTL > 後端 grace（10s）+ refresh 最壞延遲，避免「鎖過期→重放舊 token→超過 grace→family 連坐」。
- cache（`FRESH_TOKENS_TTL_MS=60s`）維持，讓 lock loser 讀新 token。
- 多 session 互踩（M5）：後台單一 admin 暫可接受；長期改 cache/lock 鍵含 sessionId 或 family（見 索引 §OQ-Q4）。

### 4.8 admin_role 存入 session（**本期必做**——spec 013 gate 前置）

- login route 讀 `/admin/me.admin_role`（child 現值、最新，優先）存進 session；`grade` claim 為輔（可能陳舊 ≤ 一個 TTL）。
- **型別**：`StoredSession` 加 `adminRole?: 'super_admin' | 'editor' | 'viewer'`（user session 無此欄）。
- refresh 時 `grade` 重簽刷新；若要 UI 即時反映降權，refresh 後可一併更新 `session.adminRole`（非必要，授權以後端 403/422 為準）。
- ⚠️ **非授權邊界**：前端據 `adminRole` 顯示/隱藏按鈕只是 UX；真授權以後端 403/422 為準（`ensureAdminAccess` 已處理 403 → destroy + redirect）。

### 4.9 對外 BFF 契約（不變）

`/api/auth/login` 對瀏覽器仍回：
```json
{ "data": { "sessionId": "...", "csrfToken": "...", "user": { "id", "name" }, "expiresAt": <ms> } }
```
- 前端 LoginCard 行為不變（UI 面向見 [spec 012b](./012b-backend-auth-ui.md)）。

### 4.10 `backendFetch` 錯誤契約修正（**關鍵；所有已登入呼叫的前置**）

現行 `src/lib/api/backend.ts` 仍貼舊 JKODonation 巢狀錯誤契約（§3-C9 / M8）。

**修正 1 — 扁平 error 碼解析**：
- 現行讀 `errBody?.error?.code`（`backend.ts:96`、`passClientErrors` 分支 `:140`）→ 改讀扁平字串 `error`。helper：
  ```ts
  function readBackendCode(errBody): string | null {
    const e = errBody?.error
    if (typeof e === 'string') return e            // 新契約：扁平字串碼
    if (e && typeof e === 'object') return e.code ?? null  // 舊契約防呆
    return null
  }
  ```

**修正 2 — 401 refresh 觸發策略（因後端無過期專碼）**：
- 現行 `if (activeSession && backendCode === 'AUTH_TOKEN_EXPIRED')` **永不命中**（M8）→ 改為 **`if (activeSession)`**：帶 session 的已登入呼叫回 401 就**試一次 refresh + 重試一次**（沿用 `retried` 旗標，至多一次防迴圈）。
- `refresh()` 自身失敗（refresh token 已死）→ 內部已 destroy + 丟 `UnauthenticatedError`，上拋。
- refresh 成功但**重試仍 401**（停用/降權/刪除）→ `destroy()` + 丟 `UnauthenticatedError`（保留 `backend.ts:125-128`）。
- **安全性**：401 代表請求在後端授權層即被擋、未執行，故即使非冪等 mutation 重試也不會重複套用。
- `session: null` 的內部呼叫（如 `/auth/refresh` 本身）：`activeSession` 為 null → 不觸發遞迴 refresh。

> **TDD**：先加「後端回扁平 `{error:'unauthorized'}` 401 → 觸發一次 refresh + 重試」的紅測試，再改實作轉綠。

---

## 5. 後端相依需求

**無新增端點需求**（Admin 建立/管理所需端點後端均已存在，§2.8）。

建議（可選、非硬相依）：
1. `refresh_token_reuse_grace_seconds` 由 10s 調大（如 30s），或回應加 `refresh_expires_in`，讓 BFF 正確追蹤 refresh 到期並放寬鎖時序。

---

## 5b. 復用對照（既有資產，開發前先讀）

> 2026-07-18 盤點。本 spec **不新建基礎層**，是在既有 auth bridge 上**修正**（role 翻正、錯誤契約、adapter）。

| 既有檔 | 現況 | 本 spec 對它做什麼 |
|---|---|---|
| `src/lib/session/types.ts` | `Role = {ADMIN:0,USER:1}`；`StoredSession` 有 token 欄、**無 `adminRole`** | 翻正 Role 為 `{USER:0,ADMIN:1}`(§4.6)、加 `adminRole?`(§4.8) |
| `src/lib/api/backend.ts` | 讀巢狀 `error.code`、只在 `AUTH_TOKEN_EXPIRED` refresh(`:96,:98`) | 改扁平碼 + `if(activeSession)` refresh(§4.10) |
| `src/lib/api/constants.ts` | `REFRESH_LOCK_TTL_MS=10_000` | 改 `15_000`(§4.7) |
| `src/app/api/auth/login/route.ts` | 打 `/auth/login`、`resolveRole` 解 JWT | 改打 `/admin/auth/login`+`/admin/me`、存 adminRole(§4.1/§4.4/§4.8) |
| `src/lib/session/service.ts` `refresh()` | 直接 spread 未驗證回應 | snake body + Zod + adapter(§4.7) |
| `src/lib/auth/decodeJwtPayload.ts` | 可用 | 取 `sub`/`role`/`grade`(§4.5) |
| `src/lib/schemas/auth.ts`（snake→camel 慣例、`PASSWORD_*` 常數） | 可用 | `BackendTokenResponse`/`BackendAdminMeResponse` 沿用風格(§4.4) |
| `src/lib/mock/auth-mock.ts` | 發 `role: Role.ADMIN`(=0)、舊路徑 | 對齊新契約(snake、`/admin/*`、role 翻正)(§6.6) |
| `src/lib/errors/*`、`create-route.ts`、`responses.ts` | 完整 | **as-is 複用**，不動 |

> 重點：**沒有全新模組要寫**；風險在「翻轉 Role 常數」的連動測試/mock（§4.6 已標）。

---

## 6. 實作順序（邏輯步驟；TDD）

> 全部不依賴後端新端點，可立即開工。UI 步驟（淘汰 register）見 [spec 012b §實作](./012b-backend-auth-ui.md)。

1. **schemas**：新增 `BackendTokenResponse`（snake）+ `adaptTokenResponse` + `BackendAdminMeResponse`（先寫測試）。
2. **Role 對齊**：改 `session/types.ts` 常數 + `resolveRole` + 加 `adminRole?` 欄位，更新受影響單元測試斷言 + mock。
3. **`backendFetch` 錯誤契約修正（§4.10）**：扁平 `error` 碼解析 + 401 refresh 策略改 `if (activeSession)`。先紅後綠。**這步先於 login/refresh 驗證**。
4. **login route**：改打 `/admin/auth/login` + `/admin/me`，套 adapter，`identifier→username`，`userId=sub`，**存 `adminRole`（供 spec 013 gate；§4.8）**。
5. **refresh path**：`service.refresh()` 送 snake body + Zod 驗證 + adapter；調 `REFRESH_LOCK_TTL_MS`→15s。
6. **mock**：`auth-mock` 對齊新契約（snake 回應、role=1 admin token + grade、`/admin/*` 路徑、`/admin/me` 回 `{id,username,name,admin_role}`）。錯誤 mock 用扁平 `{error,message}`。
7. （UI）**淘汰 register** → 見 [spec 012b](./012b-backend-auth-ui.md)。
8. **e2e（邏輯 happy path）**：登入→`/cms` 放行；refresh 輪替不掉登入。

每步：先紅 → 綠 → 重構。

## 7. 驗收清單（邏輯 Contract Tests）— 全數實作並有測試（2026-07-18）

- [x] `/api/auth/login` 以 **username**/密碼 → 200，session role=ADMIN(1)。（`login/route.test.ts`；`/cms` 放行由 013a gate）
- [x] 後端回 snake token → BFF 正確解析，`expiresAt` 為未來時間（非 NaN）。（login test「access ttl…」）
- [x] JWT `role=1` → ADMIN；`role=0` → USER；缺/未知 → USER。（login test + `resolveRole`）
- [x] `/admin/me` 回 `{id,username,name,admin_role}` → 正確映射（不因缺 email 而 502）。（`schemas/auth.test.ts`）
- [x] session `userId` == JWT `sub`（principal_id），非 `/admin/me.id`。（login test：`SUB ≠ ADMIN_CHILD_ID`）
- [x] refresh：BFF 送 `{refresh_token}`，回應經 Zod + adapter，session token **確實更新**。（`service.test.ts`）
- [x] refresh 失敗（401）→ session destroy + 清 cookie。（`service.test.ts`「backend rejects…destroys local session」）
- [x] 併發 refresh：僅一次打後端（鎖），其餘讀 cache。（`service.test.ts`「5 parallel…once」）
- [x] Role 常數翻轉後：既有 admin gate 測試/mock 斷言仍正確（無靜默倒置）。（全套綠燈；斷言改用 `Role.ADMIN` 常數）
- [x] session 帶 `adminRole`（super_admin/editor/viewer），供 spec 013 gate。（login test「stores adminRole…」）
- [x] **backendFetch 扁平錯誤碼**：`passClientErrors` 對 `{error:'conflict',…}` 取得 `beCode='conflict'`。（`backend.test.ts`）
- [x] **backendFetch 401 refresh**：扁平 `{error:'unauthorized'}` 401 → 一次 refresh + 重試；重試仍 401 → destroy；`session:null` 不遞迴。（`backend.test.ts`）

（register 淘汰的驗收見 [spec 012b](./012b-backend-auth-ui.md)。）

---

最後更新：2026-07-18（v0.3，實作對齊：檔頭已實作標記、§7 驗收全數勾選並註明對應測試）
