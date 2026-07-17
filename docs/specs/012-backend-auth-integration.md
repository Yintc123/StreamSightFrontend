# Spec 012 — Backend Auth 契約與 BFF 對接重規劃

狀態：Draft v0.1（2026-07-17）
作者：規劃階段，尚未實作
取代：本檔為 **BFF ↔ 後端 auth 對接的權威契約**，覆寫 spec 005 / 007 / 010 中
對「舊 JKODonation 後端」的過時假設（欄位名、`/auth/me`、role 值、token 形狀）。

---

## 1. 目的與範圍

前端定位為 **BFF**（隱藏後端、做欄位裁切與聚合）。後端（StreamSight FastAPI，
`/StreamSightBackend`）已改寫為 **email 登入 + principal/role + JWT 帶 role +
refresh rotation** 的架構。目前 BFF 的 auth bridge 仍照舊契約寫，**與後端多處
不相容且 refresh 會反噬**（見 §4 Gap）。

本規格：
1. 把**後端實際契約**釘死為 source of truth（§3）。
2. 列出與現行 BFF 的落差（§4）。
3. 重規劃 BFF 對接設計（§5），核心是在 `backendFetch` 加一層 **auth adapter**
   吸收 snake↔camel / 單位 / 欄位差異，並校正 role 值定義。
4. 給出實作順序與驗收清單（§7 / §8）。

**不在範圍**：後端本身的修改（本規格假設後端契約固定，由 BFF 貼合）。唯一
建議後端調整項獨立列於 §6。

---

## 2. 名詞

| 詞 | 意義 |
|---|---|
| principal | 後端帳號主體，`principals.id`（int）。JWT 的 `sub`。user / admin 各以 `principal_id` 一對一掛上。 |
| access token | JWT，HS256，30 分鐘，帶 `role` claim。 |
| refresh token | opaque 隨機字串，14 天，單次使用、rotation、family + reuse detection。 |
| family | 同一次登入的 refresh 輪替鏈共用 `family_id`；reuse 偵測以 family 連坐撤銷。 |

---

## 3. 後端契約（Source of Truth）

> 以下均為 2026-07-17 讀 `/StreamSightBackend` 原始碼所得，附檔案位置。
> **全部 snake_case，無全域 camelCase alias**（已確認無 `alias_generator`）。

### 3.1 端點總表（無全域路由前綴）

| 用途 | Method + Path | 認證 | Request | Response |
|---|---|---|---|---|
| 後台登入 | `POST /admin/auth/login` | — | `{ email, password }` | `TokenResponse`（role=1） |
| 後台 me | `GET /admin/me` | Bearer(role=1) | — | `AdminResponse` |
| 一般登入 | `POST /auth/login` | — | `{ email, password }` | `TokenResponse`（role=0） |
| 一般 me | `GET /users/me` | Bearer(role=0) | — | `UserResponse` |
| 註冊 | `POST /auth/register` | — | `{ email, name, password }` | `TokenResponse`（role=0），201 |
| Refresh | `POST /auth/refresh` | — | `{ refresh_token }` | `TokenResponse`（角色無關重簽） |
| 登出 | `POST /auth/logout` | — | `{ refresh_token }` | 204 |
| 全裝置登出 | `POST /auth/logout-all` | Bearer | — | 204 |

來源：`app/api/routers/{admin,auth,users}/router.py`，`app/api/__init__.py`（`api_router` 無 prefix）。

### 3.2 JWT access token

- 演算法 HS256（`settings.jwt_algorithm`），簽章 key `jwt_secret_key`。
- 有效期 `jwt_access_token_expire_seconds`，**預設 1800s（30 分）**。
- Payload（`app/core/auth/jwt.py:34-40`）：
  ```json
  { "sub": "<principal_id>", "type": "access", "role": 0, "iat": ..., "exp": ... }
  ```
- `role`：**IntEnum，`USER=0`、`ADMIN=1`**（`app/core/enums.py:12-13`）。
  ⚠️ 與現行前端 `Role={ADMIN:0,USER:1}` **相反**（見 §4-C1）。
- BFF 只需 base64url 解 payload 讀 `role`（不驗簽，token 來自可信 fetch）——
  現有 `decodeJwtPayload` 可用。

### 3.3 Refresh 機制（rotation + reuse detection）

來源：`app/services/auth.py:197-253`、`app/models/refresh_token.py`、
`app/repositories/refresh_token.py`、`app/core/auth/refresh.py`。

- refresh token = `secrets.token_urlsafe(32)` opaque；DB 只存 `HMAC-SHA256(pepper, token)`。
- 有效期 `refresh_token_expire_seconds`，**預設 1209600s（14 天）**。
- **rotation**：每次 `/auth/refresh` 撤銷舊 token、發新 token，同 `family_id`。
- **單次消費**：`UPDATE ... WHERE id AND revoked_at IS NULL`（原子，rowcount==1 才贏）。
- **reuse detection**：已撤銷 token 再現 →
  - 在 grace（`refresh_token_reuse_grace_seconds`，**預設 10s**）內：只回 401，不連坐。
  - 超過 grace：**撤銷整個 family**（該登入的所有 refresh 全失效）。
- refresh **不需帶 role**：後端查 principal 定型別、依 `principal.role` 重簽正確 role
  的 access token（天然防提權）。
- 回應同 `TokenResponse`（見 3.4）；**不回 refresh token 的到期時間**。

### 3.4 Token 回應形狀（`TokenResponse`）

`app/api/routers/auth/schemas.py` + `app/dtos/auth.py:56-70`：
```json
{
  "access_token": "<jwt>",
  "token_type": "bearer",
  "refresh_token": "<opaque>",
  "expires_in": 1800
}
```
- **snake_case**；`token_type` 字面值 **`"bearer"`（小寫）**。
- `expires_in` = **access token 剩餘秒數**（相對值）；**無 refresh 到期欄位**。

### 3.5 `/me` 回應形狀

`AdminResponse`（`app/api/routers/admin/schemas.py`）：
```json
{ "id": 1, "email": "a@b.c", "name": "Admin", "is_active": true }
```
`UserResponse`（`app/api/routers/users/schemas.py`）：多 `created_at`、`updated_at`。
- `id` 為 **int**，且是 **user.id / admin.id（child PK）**，**不是** JWT 的 `sub`(principal_id)。
- 無 `username`（後端無 username 概念，只有 `email` + `name`）。
- 無 `role` 欄位（role 只在 JWT）。

### 3.6 錯誤回應

`app/core/exceptions/handlers.py`：
```json
{ "error": "<ERROR_CODE>", "message": "<str>", "details": { ... } }
```
- `error` 是**字串代碼本身**（非巢狀 `error.code`）。
- 常見：401 Unauthorized（token/憑證錯）、403 Forbidden（角色不符，如 user token 打 admin 端點）、
  409（email 重複）、422（body 驗證失敗，`details.errors`）。

### 3.7 id / principal 模型

- `principals.id`（int）= JWT `sub`；`users`/`admins` 各以 `principal_id`（unique FK）一對一掛上。
- `(principal_id, role)` 複合 FK 硬化型別一致性。
- refresh token 綁 `principal_id`（角色無關）。
- **意涵**：BFF 若要「使用者穩定識別」，應以 **JWT `sub`（principal_id）** 為準，
  不要用 `/me` 的 `id`（那是 child PK，語意不同、跨 user/admin 會撞號）。

---

## 4. 與現行 BFF 的落差（Gap Analysis）

分兩類：**C = 契約/欄位**（login 根本建不出 session）、**M = 機制**（session 建了之後 refresh/role 出錯）。

| # | 類 | 現行 BFF | 後端實際 | 影響 |
|---|---|---|---|---|
| C1 | 路徑 | `POST /auth/login` + `GET /auth/me` | 後台是 `/admin/auth/login` + `/admin/me`；`/auth/me` 不存在（是 `/users/me`） | 🔴 login step2 404 |
| C2 | login body | `{ identifier, password }` | `{ email, password }`（EmailStr） | 🔴 422 |
| C3 | register body | `{ username, password, role }` | `{ email, name, password }`；不吃 role | 🔴 422 / role 被忽略 |
| C4 | 回應命名 | 期望 camel `accessToken/refreshToken/accessExpiresIn/refreshExpiresIn/tokenType` | snake `access_token/refresh_token/expires_in/token_type` | 🔴 Zod parse fail → 502 |
| C5 | `token_type` | `z.literal('Bearer')` | `"bearer"` | 🔴 大小寫 |
| C6 | refresh 到期 | 需要 `refreshExpiresIn` | 只回 `expires_in`（access） | 🔴 缺欄位 |
| C7 | id 型別 | `z.string()` | int | 🔴 parse fail |
| C8 | me 欄位 | 期望 `username` | 只有 `name`（無 username） | 🔴 顯示名對不上 |
| M1 | role 值 | `ADMIN=0, USER=1` | `USER=0, ADMIN=1`（**相反**） | 🔴 授權倒置（user→admin） |
| M2 | refresh 請求 | body `{ refreshToken }` | `{ refresh_token }` | 🔴 422 |
| M3 | refresh 回應處理 | `backendFetch<TokenPair>` 無驗證、`{...current,...data}` | 回 snake，key 不同不覆蓋 → 保留舊 token | 🔴 假成功→重放→family 連坐→強制登出 |
| M4 | 到期模型 | 絕對 epoch-ms（`accessTokenExpiresAt`） | 相對秒（`expires_in`），login 有轉、refresh 沒轉 | 🔴 refresh 後到期變 undefined |
| M5 | cache 鍵 | 依 `userId` cache tokens | rotation 依 `family_id`（每登入一條） | 🟡 同 user 多 session 會互踩 |
| M6 | 鎖/grace 時序 | `REFRESH_LOCK_TTL_MS=10s` | grace `10s` | 🟡 鎖過期==grace，後端慢於 10s 會誤連坐 |

**對得上的**：refresh token 皆 opaque ✅；JWT 帶 role claim（機制存在）✅；
rotation 概念與 BFF「鎖串行化單次 refresh」在 happy path 相容 ✅；
`sub` 是 int 但 BFF 只讀 role、不用 sub（現況）——**本規格改為改用 sub 當 userId**（見 §5.4）。

---

## 5. 重規劃：BFF 目標設計

### 5.0 設計原則

1. **後端契約固定，落差全由 BFF 吸收**（符合 BFF 定位）。
2. 差異集中在**一層 auth adapter**（`backendFetch` 的 auth 專用封裝或 mapping 函式），
   不要散在各 route。
3. role 值定義**對齊後端**（改前端常數，最小面積）。
4. 對外（瀏覽器）的 BFF 回應形狀**維持不變**（`{ data: { sessionId, csrfToken, user, expiresAt } }`），
   避免動到前端頁面。

### 5.1 登入路由分流：後台 vs 一般

現況：首頁登入卡「登入後台」、成功導 `/cms`、`proxy.ts` 守 `/cms` → **語意是 admin 登入**。

**決策（預設）**：`/api/auth/login` 對接**後台** `POST /admin/auth/login` + `GET /admin/me`。
- 一般 user 登入（`/auth/login` + `/users/me`）列為**次要/可選**，本期不接（除非 §9 決策改變）。
- `/api/auth/register` 對接 `POST /auth/register`（只能建**一般 user**，role=0）→
  ⚠️ 註冊出來的帳號**無法進 /cms**（非 admin）。此為產品決策，見 §9-Q3。

### 5.2 請求欄位映射（BFF inbound → 後端）

| BFF `/api/auth/login` 收 | 送後端 `/admin/auth/login` |
|---|---|
| `{ identifier, password }` | `{ email: identifier, password }` |

- 前端登入表單「帳號」欄位**語意改為 email**（label 建議改「Email」，見 §9-Q1）。
- `identifier` 直接當 `email` 塞給後端；後端 EmailStr 會驗格式，非 email 會 422 →
  BFF 以 `passClientErrors` 原樣回，前端顯示「Email 或密碼錯誤」。

| BFF `/api/auth/register` 收 | 送後端 `/auth/register` |
|---|---|
| `{ username, password }`(+ 需補 `name`,`email`) | `{ email, name, password }` |

- 後端註冊需要 `email` + `name`，前端目前只收 username + password →
  **註冊表單需加 email 欄位**（`name` 可用 email 或另加顯示名欄），見 §9-Q3。
- **不再送 `role`**（後端不吃；admin 帳號由後端種子/後台管理建立）。

### 5.3 回應映射（後端 snake → BFF 內部 camel/絕對時間）

新增 adapter：把 `TokenResponse` 轉成 BFF 既有的 token 形狀。
```
adaptTokenResponse(raw, now):
  access_token   → accessToken
  refresh_token  → refreshToken
  expires_in(秒) → accessTokenExpiresAt = now + expires_in*1000
  refresh 到期   → refreshTokenExpiresAt = now + REFRESH_TTL_FALLBACK_MS
                   （後端不回，用固定 14d fallback；見 §9-Q2）
  token_type     → 忽略（或 assert 大小寫不敏感 == 'bearer'）
```
- Zod schema 改成驗 **snake_case**（新 `BackendTokenResponse`），移除 `z.literal('Bearer')`、
  移除必填 `refreshExpiresIn`。
- `/me`：改打 `/admin/me`，adapter：`{ id, email, name, is_active }` → 顯示名用 `name`，
  `email` 照帶；`id`（int）→ 字串化僅供顯示。

### 5.4 使用者識別：改用 JWT `sub`

- session 的 `userId` **改用 JWT `sub`（principal_id）**，不用 `/me.id`。
  - 理由：refresh 綁 principal、`sub` 跨 user/admin 唯一且穩定；`/me.id` 是 child PK 會撞號。
- `decodeJwtPayload(accessToken)` 取 `sub` + `role`；`/me` 只用來拿顯示用 `name`/`email`。

### 5.5 Role 對齊

- 將前端 `src/lib/session/types.ts` 的 `Role` 改為 **`{ USER: 0, ADMIN: 1 }`**（對齊後端）。
- `resolveRole`：直接讀 JWT `role` claim（`0→USER, 1→ADMIN`），未知值 fail-safe 成 USER
  （對齊後端 `extract_role`）。
- `requireAdmin` / `/cms` gate：`role === Role.ADMIN(1)` 才放行。
- 後台登入走 `/admin/auth/login` → JWT `role=1` → 正確判 ADMIN。

### 5.6 Refresh path 修正（關鍵）

現行 `service.refresh()` 直接 spread 未驗證回應 → 改為：
1. 送 body **`{ refresh_token: current.refreshToken }`**（snake）。
2. 用 `BackendTokenResponse` **Zod 驗證** 回應（如同 login，不再裸 cast）。
3. 走 `adaptTokenResponse` 轉絕對時間，**確實覆蓋** `accessToken/refreshToken/accessTokenExpiresAt`。
4. 錯誤處理維持：401 → clear cookie + destroy session（對齊後端「refresh 失敗即失效」）。

**時序安全（對齊 reuse detection）**：
- `REFRESH_LOCK_TTL_MS` 從 10s **提高到 > 後端 grace + 後端 refresh 最壞延遲**
  （建議 15s，或後端 grace 調大；見 §6）。避免「鎖過期→第二請求重放舊 token→超過 grace→family 連坐」。
- cache（`FRESH_TOKENS_TTL_MS=60s`）維持，讓 lock loser 讀新 token 而非重打後端。
- **多 session 互踩（M5）**：後台目前單一 admin，暫可接受；長期改為 cache/lock
  **鍵含 sessionId 或 family**，而非只 userId（見 §9-Q4）。

### 5.7 對外 BFF 契約（不變）

`/api/auth/login`、`/api/auth/register` 對瀏覽器仍回：
```json
{ "data": { "sessionId": "...", "csrfToken": "...", "user": { "id", "name" }, "expiresAt": <ms> } }
```
前端頁面（LoginCard / RegisterCard）除表單欄位語意（email）外，**行為不變**。

---

## 6. 建議後端配合項（可選、非必要）

BFF 可全吸收，但以下若後端願意調整能更穩：
1. `refresh_token_reuse_grace_seconds` 由 10s 調大（如 30s），或回應加
   `refresh_expires_in`，讓 BFF 能正確追蹤 refresh 到期並放寬鎖時序。
2. （非必要）token 回應提供 camelCase alias / `refresh_expires_in`，可省 BFF adapter。

若後端**不動**，§5 全部由 BFF 完成即可。

---

## 7. 實作順序（TDD，逐步可驗）

1. **schemas**：新增 `BackendTokenResponse`（snake）+ `adaptTokenResponse` + me adapter（先寫測試）。
2. **Role 對齊**：改 `session/types.ts` 常數 + `resolveRole`，更新受影響單元測試斷言。
3. **login route**：改打 `/admin/auth/login` + `/admin/me`，套 adapter，`identifier→email`，`userId=sub`。
4. **register route**：改打 `/auth/register`，body `{email,name,password}`，移除 role；表單補 email/name。
5. **refresh path**：`service.refresh()` 送 snake body + Zod 驗證 + adapter；調 `REFRESH_LOCK_TTL_MS`。
6. **mock**：`auth-mock` 對齊新契約（snake 回應、role=1 admin token、`/admin/*` 路徑）。
7. **e2e**：登入→`/cms` 放行；refresh 輪替不掉登入的 happy path。

每步：先紅（改/加測試）→ 綠（最小實作）→ 重構。

## 8. 驗收清單（Contract Tests）

- [ ] `/api/auth/login` 以 email/密碼 → 200，session role=ADMIN(1)，`/cms` 放行。
- [ ] 後端回 snake token → BFF 正確解析，`expiresAt` 為未來時間（非 NaN）。
- [ ] JWT `role=1` → BFF 判 ADMIN；`role=0` → USER；缺/未知 → USER。
- [ ] refresh：BFF 送 `{refresh_token}`，回應經 Zod + adapter，session token **確實更新**。
- [ ] refresh 失敗（401）→ session destroy + 清 cookie。
- [ ] 併發 refresh：僅一次打後端（鎖），其餘讀 cache，不觸發 reuse detection。
- [ ] register：email 重複 → 後端 409 原樣透傳，前端顯示「Email 已被使用」。
- [ ] 非 email 的 identifier → 後端 422 透傳，前端顯示錯誤。

---

## 9. 待決策（Open Questions）

- **Q1（登入識別）**：登入表單「帳號」改為 **Email**（後端只支援 email 登入）。
  是否接受？或要 BFF/後端另加 username 登入？（後端目前無 username，成本在後端。）
- **Q2（refresh 到期）**：後端不回 refresh 到期。BFF 用固定 14d fallback 推算，
  或請後端加 `refresh_expires_in`？
- **Q3（註冊定位）**：後端 `/auth/register` 只能建 **一般 user（role=0，進不了 /cms）**。
  首頁「建立帳號」要：(a) 保留但明確標示為一般用戶註冊；(b) 移除，admin 由後端種子建立；
  (c) 需要 admin 自助註冊 → 要後端加 admin 註冊端點。
- **Q4（多 session）**：refresh cache/lock 目前以 userId 為鍵，與後端 per-family rotation
  在「同 user 多裝置」下會互踩。單一 admin demo 可暫緩；要否本期就改成 per-session 鍵？
- **Q5（登入分流）**：本規格預設首頁 = admin 登入。是否也要一般 user 登入入口？

---

最後更新：2026-07-17
