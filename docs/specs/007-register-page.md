# Spec 007：建立帳號頁（`/register`）

- **狀態**：Draft（v0.2 — 對齊 [backend spec 008 v0.6](../../../backend/docs/specs/008-auth-flow-password.md)；路徑從 `/admin` 改 `/register`；password 規則改 Argon2id 8–256；補 GET /auth/me 流程 + 429 rate-limit UX）
- **建立日期**：2026-06-15（v0.1）/ 2026-06-16（v0.2）
- **路徑（前端）**：
  - `src/app/register/page.tsx`（目前 placeholder；本 spec 描述要替換的版本）
  - `src/app/register/RegisterCard.tsx`（新 client component；mirror LoginCard 結構）
  - `src/app/register/RegisterCard.test.tsx`
  - `src/app/api/auth/register/route.ts`（新 BFF route）
  - `src/app/api/auth/register/route.test.ts`
  - `src/lib/schemas/auth.ts`（新；register request / response 共用 Zod schema）
- **路徑（backend）**：
  - `POST /auth/register` — **已於 [backend spec 008 v0.6 §4 / §8.1](../../../backend/docs/specs/008-auth-flow-password.md)** 規範並由 BE 實作
  - `GET /auth/me` — 註冊後拿 user profile（[BE 008 §6.4](../../../backend/docs/specs/008-auth-flow-password.md)；register response 本身不含 user）
- **依賴**：
  - [spec 005 §3 LoginCard](./005-homepage-auth.md#3-行為契約)（互為對稱的 UI 模板）
  - [spec 006 §3 globalQueryError](./006-error-handling.md#33-handleglobalqueryerror)（5xx 共用 toast）
  - 既有 iron-session / Redis session store / CSRF（spec 001a/c/d）
  - 既有 BffError 映射、`createRoute` helper、`getSessionService`

---

## 1. 職責

把目前 `/register` 的 placeholder 換成可用的「建立帳號」表單。流程：

```
/ (LoginCard) ──「建立帳號」──▶ /register ──「註冊」──▶ /cms（auto-login）
                                  │
                                  └──「我已有帳號」──▶ /
```

註冊成功 = backend 建 Account + PasswordCredential → BFF 拿到 tokens 後再打 `GET /auth/me` 取 user → 建 iron-session（與 [dev/login](../../src/app/api/dev/login/route.ts) 同套）→ 帶 Set-Cookie 回 client → client `router.push('/cms')`。**不需要使用者再回首頁登入一次**。

---

## 2. 決策

### 2.1 為何走 auto-login

| | 註冊後 auto-login（選用） | 註冊後跳 / 讓使用者再登一次 |
|---|---|---|
| 步驟 | 1 步：填表 → 進後台 | 2 步：填表 → 跳 / → 填同樣帳密 → 進後台 |
| 安全 | 同：兩種方案都建 session cookie | 同 |
| 流量 | 1 個 POST（+ BFF 內部 1 個 GET /auth/me） | 2 個 POST（register + login）|
| UX | 順暢 | 阻斷感重 |

主流產品（Notion / Linear / Figma 註冊流）都 auto-login，沒有不選的理由。BE 008 §4.2「註冊即登入」呼應此設計：register 成功立即發 access + refresh token，FE 只要包進 iron-session 即可。

### 2.2 為何用「最小欄位」（帳號 + 密碼 + 密碼確認）

- 對齊 LoginCard 已有的「帳號 / 密碼」雙欄；視覺上 register 是「login + 密碼確認」延伸，使用者學習成本最低
- BE 008 §4.1 接受 `{ username?, email?, password }` 並要求**至少一個** identifier（§4.2 規則）；FE v0.2 先只開 username 欄位，email 留 [§8 開放問題](#8-開放問題)
- 7 天 demo 不接 email verification / OAuth provider

### 2.3 為何不再寫整份 backend contract（v0.2 收斂）

v0.1 把 backend contract 整套寫進本 spec §6，當時假設 BE 沒實作。v0.2 起 [BE spec 008 v0.6](../../../backend/docs/specs/008-auth-flow-password.md) 已涵蓋完整 password auth flow（含 register / login / GET-PATCH-DELETE /auth/me / password change / rate-limit），且 BE 已實作。本 spec 不再複述，僅在 [§6 BE 對接表](#6-be-對接backend-spec-008-的-cross-ref) 列「FE 對 BE 的關鍵假設」+ cross-ref。

### 2.4 密碼規則 — 對齊 BE 008 §3.1/§3.2 Argon2id

- 雜湊：BE 端用 **Argon2id**（NIST/OWASP 2025 首選；[BE 008 §3.1](../../../backend/docs/specs/008-auth-flow-password.md)）
- 長度：**8–256 字元**（[BE 008 §3.2](../../../backend/docs/specs/008-auth-flow-password.md)；NIST SP 800-63B 風格，不強制字元類別）
- 字元：任意可印字元 + 空白（允許 passphrase）；禁 NULL / 控制字元（BE 端把關）
- 生產環境通常會加 zxcvbn / 黑名單比對；本 spec 不涵蓋，列 [§8 開放問題](#8-開放問題)

> v0.1 寫 8–72（bcrypt 上限）已撤回；BE 是 Argon2id，無 72 上限。

### 2.5 為何不用 Server Action

Next.js 16 Server Actions 適合提交表單。本專案 LoginCard 走 `fetch('/api/dev/login')` 是因為要兼顧 client-side 載入狀態（`useTransition`）+ CSRF token 走 BFF route 比較直觀。Register 沿用同 pattern 一致性更高，也方便 unit test fetch mock。

---

## 3. UI Layout

對齊 LoginCard 風格：brand 紅 header + 卡片表單，但**少了 skip link**（register 流程結束就是進後台，不該逃離）。

```
┌─────────────────────────────────┐
│      建立帳號 (brand 紅)        │ ← h1
├─────────────────────────────────┤
│                                 │
│      ┌─────────────────┐        │
│      │ 建立帳號         │       │ ← h2
│      │ 帳號 [____]     │       │
│      │ 密碼 [____]     │       │
│      │ 確認密碼 [____] │       │
│      │ [    註冊      ]│       │ ← bg-brand text-white
│      │ [   我已有帳號  ]│       │ ← outline brand → /
│      └─────────────────┘        │
│                                 │
└─────────────────────────────────┘
```

| 元素 | className 重點 |
|---|---|
| Page wrapper | `min-h-dvh bg-surface-page flex flex-col` |
| Header | `flex items-center justify-center w-full h-11 bg-brand`；h1 white bold 17 |
| Main | `flex-1 flex flex-col items-center justify-center gap-6 px-[15px] py-10` |
| Card | `w-full max-w-[345px] mx-auto bg-surface-card rounded-2xl shadow-sm border border-line p-5 flex flex-col gap-4` |
| Field block | 同 LoginCard `<Field>` — `<label>` 包 `<span text-[13px]>` + `<input>` |
| Submit | `h-11 rounded-lg bg-brand text-white text-base font-medium disabled:opacity-50 ...` |
| Secondary | `h-11 rounded-lg border border-brand text-brand ...` |

> 重用 `<Field>` 元件：把目前 inline 在 LoginCard 內的 `<Field>` 抽到 `src/app/auth/Field.tsx` 給 LoginCard + RegisterCard 共用。

---

## 4. 行為契約

| 互動 | 行為 |
|---|---|
| 進入 `/register` | RSC 渲染 header + `<RegisterCard />` |
| 帳號 / 密碼 / 確認任一空 | 「註冊」按鈕 `disabled` |
| 密碼 ≠ 確認密碼 | 顯示 inline `「兩次密碼輸入不一致」`、submit `disabled` |
| 密碼 < 8 字 | 顯示 inline `「密碼至少 8 個字元」`、submit `disabled`（送出時也擋） |
| 密碼 > 256 字 | 同 disabled + inline `「密碼最多 256 字元」`（v0.2；對齊 BE 008 §3.2 上限） |
| 帳號 < 3 字 或 > 30 字 | 顯示 inline 提示、submit `disabled`（v0.2 — 上限從 20 改 30 對齊 BE 008 §3.4） |
| 帳號含非法字元 | inline「帳號需為 3–30 個英數字、底線或連字號」（v0.2 — regex 加 `-`） |
| 三欄合法、按「註冊」 | `POST /api/auth/register` |
| 註冊成功（200）| `router.push('/cms')`；不顯示成功 toast（auto-redirect 已是回饋）|
| 帳號重複（409 `AUTH_USERNAME_TAKEN`） | 顯示 inline `「帳號已被使用」`、不跳轉、不消除 inline message until 使用者改帳號（v0.2 — code 名 `CONFLICT` → `AUTH_USERNAME_TAKEN`） |
| 帳密暴力嘗試 / 過於頻繁（429 `AUTH_RATE_LIMITED`）| 顯示 inline `「嘗試次數過多，請稍後再試」`、不跳轉；按鈕保持 enabled（v0.2 新；對齊 [BE 008 §7](../../../backend/docs/specs/008-auth-flow-password.md) per-IP 5/h、per-email 3/24h） |
| 400 validation 失敗 | 顯示 backend `message`（已過 i18n，BFF 透傳）、不跳轉（v0.2 — code 名 `VALIDATION_ERROR` → `VALIDATION_FAILED`；BE 不發 422，移除 422 row） |
| 5xx | global toast `「server 目前維修中…」`（[spec 006](./006-error-handling.md)） + inline `「註冊失敗」` |
| 註冊 in-flight | submit 改「註冊中…」、`disabled`；`useTransition` 管 isPending |
| 按「我已有帳號」 | `router.push('/')`，**不**打 API |

### 4.1 Client-side 驗證表

對齊 [BE 008 §3.2 / §3.4](../../../backend/docs/specs/008-auth-flow-password.md)。client 仍要做（pre-flight UX）；BE 是 source of truth、會 redo 一次。

| 欄位 | 規則 | 錯誤訊息 |
|---|---|---|
| `username` | 3–30 字、`/^[a-zA-Z0-9_-]+$/`、儲存時 BE lowercase | `帳號需為 3–30 個英數字、底線或連字號` |
| `password` | 8–256 字元（[Argon2id NIST SP 800-63B](../../../backend/docs/specs/008-auth-flow-password.md)） | `密碼至少 8 個字元` / `密碼最多 256 字元` |
| `passwordConfirm` | `=== password` | `兩次密碼輸入不一致` |

驗證寫成 Zod schema (`src/lib/schemas/auth.ts`)，client + BFF 共用同一份 source。BE TypeBox 是另一套，但規則對齊。

---

## 5. BFF Route — `POST /api/auth/register`

### 5.1 入站契約

```http
POST /api/auth/register
Content-Type: application/json
X-CSRF-Token: <csrf>   # 走 csrf-check（非 dev/login 的 csrfExempt 模式）

{
  "username": "alice",
  "password": "hunter2hunter2"
}
```

`passwordConfirm` **不**送 backend——client 端確認後丟掉，只送一份密碼避免明文 over-the-wire 兩遍。

### 5.2 BFF 流程（v0.2 — 兩段：register + me）

```ts
// src/app/api/auth/register/route.ts
export const POST = createRoute({
  bodySchema: RegisterRequest,         // Zod: username + password
  handler: async ({ body, requestId }) => {
    // 1. backend register → 拿 tokens（BE 008 §8.1：flat shape，無 user）
    const { data: tokens } = await backendFetch<BackendTokenBundle>(
      '/auth/register',
      { method: 'POST', body, requestId },
    )

    // 2. backend me → 拿 user profile（BE 008 §6.4）
    const { data: user } = await backendFetch<BackendMeResponse>(
      '/auth/me',
      {
        method: 'GET',
        headers: { authorization: `Bearer ${tokens.accessToken}` },
        requestId,
      },
    )

    // 3. BFF 建 iron-session（user + tokens 一起包進 cookie）
    const result = await getSessionService().create({ user, tokens })

    return okResponse({
      ...result,                      // sessionId + csrfToken
      user,
      expiresAt: Date.now() + tokens.accessExpiresIn * 1000,
    }, 201)
  },
})
```

> **為何要兩段**：BE 008 §8.1 的 register response 只有 tokens、不含 user 物件（避免 endpoint 同時做兩件事的職責汙染）。FE iron-session 需要 user 才能在 `/cms` 顯示「歡迎 alice」。GET /auth/me 是 BE 提供的官方取 user profile 入口（[BE 008 §6.4](../../../backend/docs/specs/008-auth-flow-password.md)）。

### 5.3 成功回應（FE 端）

```http
HTTP/1.1 201 Created
Set-Cookie: jko_session=<iron-encrypted>; HttpOnly; SameSite=Lax; Secure
Cache-Control: no-store, private

{
  "data": {
    "sessionId": "<43-char base64url>",
    "csrfToken": "<43-char base64url>",        // BFF 自產（spec 001d），非 BE 透傳
    "user": {
      "id": "<uuid>",
      "username": "alice",
      "email": null,
      "displayOrder": null,
      "role": 1,                                // BE 008 §10 role enum：0=ADMIN, 1=USER
      "createdAt": "<ISO>",
      "lastLoginAt": "<ISO>",
      "lastLoginType": "PASSWORD"
    },
    "expiresAt": 1781567400000                  // 由 accessExpiresIn 推算（Date.now() + sec*1000）
  }
}
```

### 5.4 錯誤映射（v0.2 — 對齊 BE 008 §9）

| 觸發 | client 看到 |
|---|---|
| Zod parse fail (username 格式 / password 長度) | 400 `VALIDATION_FAILED`，message 來自 Zod |
| backend 400 `VALIDATION_FAILED` | 400 透傳；message 為 BE 端規則違反（同 schema name）|
| backend 401 `AUTH_IDENTIFIER_REQUIRED`（缺 username + email）| **不會發生**——FE 只送 username；BFF 可以 dev-only 警告 |
| backend 409 `AUTH_USERNAME_TAKEN` | 409 透傳，`{ message: '帳號已被使用' }` |
| backend 409 `AUTH_EMAIL_TAKEN` | 409 透傳；本 v0.2 FE 未送 email、不會發生 |
| backend 429 `AUTH_RATE_LIMITED` | 429 透傳，message `「嘗試次數過多，請稍後再試」` |
| backend 503（Redis 不可用 / rate-limit fail-closed） | 503 透傳 |
| backend 5xx / timeout | 502 / 504（既有 BffError 路線） |
| 缺 CSRF token | 403 `CSRF_INVALID` |

---

## 6. BE 對接（backend spec 008 的 cross-ref）

v0.1 整段 backend contract 移除，改為「FE 對 BE 的 4 個關鍵假設」：

| 假設 | BE 出處 | FE 動作 |
|---|---|---|
| `POST /auth/register` body shape: `{ username?, email?, password }` | [BE 008 §4.1 / §8.1](../../../backend/docs/specs/008-auth-flow-password.md) | FE 只送 username + password |
| register response shape: flat `{ accessToken, accessExpiresIn, refreshToken, refreshExpiresIn, tokenType }` | [BE 008 §8.1](../../../backend/docs/specs/008-auth-flow-password.md) | BFF parse 後再打 `GET /auth/me` 取 user |
| `GET /auth/me` 回 `{ id, username, email, displayOrder, role, createdAt, updatedAt, lastLoginAt, lastLoginType }` | [BE 008 §6.4](../../../backend/docs/specs/008-auth-flow-password.md) | BFF 把 user 物件包進 iron-session |
| error code 字典（[BE 008 §9](../../../backend/docs/specs/008-auth-flow-password.md)） | — | BFF 用 code 名映射 inline message；429 走「嘗試次數過多」UX |

CSRF token **由 BFF 自產**（[spec 001d](./001a-foundations.md)），不是 BE 透傳。BE 端走 Bearer JWT 認證，不參與 CSRF。

---

## 7. 測試

### 7.1 `RegisterCard.test.tsx`（client，TDD 強制）

| # | 案例 | 期望 |
|---|---|---|
| 1 | 渲染 username / password / passwordConfirm 三欄 + 兩顆按鈕 | OK |
| 2 | 任一欄空 → 註冊 disabled | OK |
| 3 | username 4 字、password 7 字 → 註冊 disabled + inline「密碼至少 8 個字元」 | OK |
| 4 | password ≠ confirm → disabled + inline「兩次密碼輸入不一致」 | OK |
| 5 | username 含中文 → disabled + inline「帳號需為 3–30 個英數字、底線或連字號」（v0.2 — 上限 + 連字號描述對齊）| OK |
| 5b | username 31 字 → disabled + inline 上限提示（v0.2）| OK |
| 5c | password 257 字 → disabled + inline「密碼最多 256 字元」（v0.2）| OK |
| 6 | 三欄合法 + 按「註冊」 → POST /api/auth/register + push('/cms') | mock fetch 201 |
| 7 | 409 `AUTH_USERNAME_TAKEN` → 顯示 inline「帳號已被使用」、不 push（v0.2 — code 名） | mock fetch 409 |
| 7b | 429 `AUTH_RATE_LIMITED` → inline「嘗試次數過多，請稍後再試」、不 push、按鈕保持 enabled（v0.2 新） | mock fetch 429 |
| 8 | 5xx → 不在 RegisterCard 內 inline 處理 toast（由 global handler 接） | 確認 fetch.error 沒被吞、且 component 自己也顯示 inline「註冊失敗」 |
| 9 | 「我已有帳號」→ push('/')、不打 API | OK |
| 10 | inflight → 按鈕文字「註冊中…」、disabled | useTransition isPending = true |

### 7.2 `route.test.ts`（BFF route）

| # | 案例 | 期望 |
|---|---|---|
| 1 | happy path → backend register 200 + GET /auth/me 200 + session 建立 + 回 201 + Set-Cookie | mock 兩條 backend call |
| 2 | body schema fail | 400 VALIDATION_FAILED、不打 backend |
| 3 | backend register 409 `AUTH_USERNAME_TAKEN` → BFF 透傳 409 + code（v0.2）| OK |
| 4 | backend register 400 `VALIDATION_FAILED` → BFF 透傳 message | OK |
| 4b | backend register 429 `AUTH_RATE_LIMITED` → BFF 透傳 429（v0.2 新）| OK |
| 5 | backend register 5xx → BFF 502 | OK |
| 5b | backend register 200 但 GET /auth/me 失敗 → BFF 5xx（session 不建半套，v0.2 新）| 確認 sessionService.create 沒被叫 |
| 6 | 缺 CSRF token → 403 CSRF_INVALID | OK |
| 7 | Cache-Control: no-store, private 在 response header | OK |

### 7.3 e2e（後續可加，本 spec 不強制）

`/ → /register → 填表 → submit → /cms` 串完整 flow。BE 008 已實作 register endpoint，本地用 USE_MOCK=1 仍可以加 mock dispatcher 跑通；後續另起。

---

## 8. 開放問題

- **email 欄位 + 雙 identifier**：BE 008 §4.1 已支援 `{ username?, email? }`（至少一個）；FE v0.2 先只開 username 欄位。未來 UI 加 email 欄位時，可以「username 二選一」或「兩個都填」，需設計 form。BE 沒有 email 驗證信機制（[BE 008 §10.2](../../../backend/docs/specs/008-auth-flow-password.md)），加 email 後不會寄信
- **OAuth (Google)**：BE [spec 007 auth-flow-google-oidc](../../../backend/docs/specs/007-auth-flow-google-oidc.md) 已有，FE 未做。RegisterCard 可加「使用 Google 註冊」按鈕，走 OAuth flow；範圍外
- **密碼強度 UI**：8 字下限 + 不限類別偏寬鬆（NIST SP 800-63B 風格符合現代規範）；可加 zxcvbn 分數提示，但不擋 submit
- **`role` claim 在 FE 的用途**：BE 回 `role: 0|1`（[BE 008 §10 / spec 007 §10.10](../../../backend/docs/specs/007-auth-flow-google-oidc.md)）。register 一律 `role=1=USER`。未來如果要做「真 admin 後台」（`/admin` 路由），FE 應該讀此 claim 做路由 gate
- **i18n**：所有 client error message hardcode 中文；接 next-intl 後抽 string table
- **註冊後立刻可登入 vs 等審核**：BE 預設 auto-login；公益捐款後台或許需審核流，未來再加 `pendingApproval` 狀態
- **自助 PATCH / DELETE / archive**：BE 008 §6.5/6.6/6.7 已有 `PATCH /auth/me` / `DELETE /auth/me` / `POST /auth/me/archive`，未來「個人資料設定頁」用得到，本 spec 不涵蓋
- **password change / set**：[BE 008 §6.1/§6.2](../../../backend/docs/specs/008-auth-flow-password.md) 已有 `POST /auth/password/change` / `set`，未來「修改密碼頁」用得到，本 spec 不涵蓋

---

## 9. 變更紀錄

| 版本 | 日期 | 變更 |
|---|---|---|
| 0.1 | 2026-06-15 | 初版：準生產規格——UI layout、客端 + BFF + backend contract、9 個 client test case、7 個 BFF test case；列出 7 條開放問題；不含 e2e（等 backend register endpoint 實作後補） |
| 0.2 | 2026-06-16 | **對齊 [backend spec 008 v0.6](../../../backend/docs/specs/008-auth-flow-password.md) + 路由改名 `/admin` → `/register`**：(a) BE register endpoint「未實作」→ 已實作；§6 整段 backend contract 收斂為「FE 對 BE 4 個關鍵假設」+ cross-ref；(b) username 上限 20 → **30**、regex 加 `-`、註明 BE 儲存 lowercase；(c) password 上限 72 → **256**（Argon2id，非 bcrypt）；移除「bcrypt cost 12+」描述；(d) Response 201 shape 改為對齊 BE §8.1 flat tokens（accessExpiresIn 秒，非 ms epoch；無 user 物件），BFF 多打 `GET /auth/me` 取 user；§5.2 流程加第二段 fetch、§7.2 加 case 5b（GET /me 失敗時不建半套 session）；(e) error code 全更名：`CONFLICT`→`AUTH_USERNAME_TAKEN`、`VALIDATION_ERROR`→`VALIDATION_FAILED`、刪 422 row、新增 429 `AUTH_RATE_LIMITED` UX + test 7b；(f) §2.4 改寫 password 規則段落；(g) **路徑 `/admin` → `/register`** 解 BE `role=0=ADMIN` 命名衝突：`src/app/admin/` 整目錄移到 `src/app/register/`、LoginCard router.push 目的地改 `/register` + 對應 test、spec 005 v0.4 同步、brief.md §3 同步；`/admin` 留給未來真 admin 後台；(h) §8 OQ 清理（rate-limit 已收斂、bcrypt 假設刪、補 email / OAuth / PATCH-me / role gate / password change 等 BE 已備好的下游 endpoint） |
| 0.2.1 | 2026-06-16 | **修正 BE upstream path**：register / me 兩條 BE call 從 `/v1/auth/register`、`/v1/auth/me` 改回 `/auth/register`、`/auth/me`。BE auth routes 不掛 `/v1` 前綴（[BE spec 008](../../../backend/docs/specs/008-auth-flow-password.md) §3 / `backend/src/routes/auth/*`），與既有 `/auth/refresh` 一致；只有 `/v1/donation/*` 才有版本前綴。原 v0.2 spec / route.ts / route.test.ts 寫成 `/v1/auth/...` 是 drift，造成本機驗證時 BE 404；本版同步修正。 |
| 0.2.2 | 2026-06-16 | **註冊成功跳轉目的地 `/dashboard` → `/cms`**（隨 [spec 005 v0.5](./005-homepage-auth.md)）：後台主要做 charity / project / sale-item 三類資料的 CRUD（對應 BE spec 020 三套 admin route），語意上是 content management 而非 analytics dashboard；改名讓路徑與業務領域對齊。`RegisterCard.tsx` `router.push('/cms')` + 對應 test、register/page.tsx 註解、route.ts 註解、spec 007 §1 / §2 / §4 / §5.2 / §6 / §7.1 / §7.3 同步。 |
