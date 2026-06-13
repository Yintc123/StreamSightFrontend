# Spec 001：BFF 基礎建設

- **狀態**：Draft
- **建立日期**：2026-06-13
- **影響範圍**：`frontend/src/app/api/*`、`frontend/src/lib/{api,session,security,schemas,errors,config,mock,log}/*`
- **依賴**：
  - 專案根 ADR 002（Backend = Fastify + BFF 分層）
  - 專案根 ADR 004（Auth Token Strategy：access 3h / refresh 30d / Redis-only / rotation + replay detect）
  - `backend/docs/specs/001-environment-config.md` §3.4 JWT 參數
  - `backend/docs/specs/005-error-handling.md`（錯誤碼前綴與 `AUTH_TOKEN_EXPIRED` 信號）

> 本 spec **僅定義基礎建設模組**（橫切關注點）。**不**含任何業務邏輯。業務 endpoint 規格另寫於後續 spec。

---

## 1. 目的與範圍

定義 Next.js BFF 層的**實作契約**，使任何 Route Handler 實作時不需重新決策橫切議題。

**範圍內**
- `src/app/api/*/route.ts` 的**通用模式**與 `createRoute` wrapper
- `src/app/api/csrf/route.ts`、`src/app/api/health/route.ts`（基礎設施端點）
- `src/lib/api/*`（`backendFetch`、`createRoute`、`okResponse`、`parseBody`、`parseQuery`、常數、request-id、http-status）
- `src/lib/session/*`（Browser ↔ BFF 的 session cookie 處理；含 access + refresh token 與 csrfToken）
- `src/lib/security/*`（CSRF 驗證、origin 白名單）
- `src/lib/schemas/`（共用 schema：envelope、pagination；個別資源 schema 在業務 spec）
- `src/lib/errors/*`（錯誤類別、HTTP 對映）
- `src/lib/config.ts`（環境變數讀取 + Zod 驗證）
- `src/lib/log.ts`（結構化日誌 + 敏感資料遮罩）
- `src/lib/mock/*`（dispatch 機制，不含具體 fixture）

**範圍外**
- 任何 resource 的 schema、endpoint、fixture
- OAuth 登入 flow、token 簽發
- UI 元件、客戶端 fetch
- 真後端內部實作

---

## 2. 認證邊界（cookie ↔ session store ↔ JWT）

BFF 在兩條認證邊界之間轉譯。Session 真相存於 **Redis（server-side）**；cookie 只攜帶不可預測的 sessionId（依 ADR 005 v2、ADR 006）。

```
[Browser]
   │
   │  httpOnly session cookie（Set-Cookie: <name>=<sealed { sessionId }>; HttpOnly; Secure; SameSite=Lax）
   │  + X-CSRF-Token header（unsafe method only，見 §4）
   ▼
[Next.js BFF on Cloud Run]
   │  1. 解 cookie → sessionId
   │  2. SessionStore（Redis）GET session:<sessionId> → StoredSession
   │  3. 取 accessToken；驗證 CSRF
   │
   │  Authorization: Bearer <accessToken>
   ▼
[Backend (Fastify)]   ← @fastify/jwt 驗證、stateless
```

### 2.1 為何採此分層

| 角色 | 採用 | 原因 |
|---|---|---|
| Browser ↔ BFF（cookie） | iron-session 封裝 `{ sessionId }` | client 不接觸 JWT，token 不落 localStorage；ADR 005 v2 |
| BFF（session 真相） | Redis（SessionStore interface） | Cloud Run 多 instance 共享、可立即作廢、跨 instance refresh 協調；ADR 006 |
| BFF ↔ Backend | JWT Bearer | Backend stateless、可重用於 mobile / 第三方 client；ADR 002 |

### 2.2 資料分布

**Cookie 內容**（加密簽章，由 iron-session 處理）：
```ts
// src/lib/session/cookie.ts 內部使用
type CookiePayload = { sessionId: string }   // sessionId: 32 bytes → base64url, 43 字元
```

**Redis 內容**（key: `<REDIS_KEY_PREFIX>:session:<sessionId>`）：
```ts
// src/lib/session/types.ts
export type StoredSession = {
  userId: string                     // 對應 user.id，存頂層便於 SCAN by user
  accessToken: string                // backend 發的 JWT，3h
  accessTokenExpiresAt: number       // epoch ms
  refreshToken: string               // 30d
  refreshTokenExpiresAt: number
  user: { id: string; name: string } // 顯示用快取
  csrfToken: string                  // 43 字元 base64url（見 §4）
  createdAt: number
  lastSeenAt: number                 // 每次 SessionService.get() 觸發 touch 時更新
}
```

> 業務模組（handler、`backendFetch`）僅看到 `StoredSession`；cookie / Redis 細節由 `SessionService` 隱藏。

### 2.3 Sliding TTL（cookie + Redis 雙層）

| 層 | 機制 | 觸發 |
|---|---|---|
| Redis | `SessionStore.get()` 內用 Lua atomic `GET + EXPIRE`（ADR 006 §5.1.2） | 每次 `SessionService.get()` |
| Cookie | iron-session `cookieOptions.maxAge` + `writeSessionId()` 重簽 | 每次 `SessionService.touch()`，由 `createRoute` 在 response phase 觸發 |

兩層 TTL 共用同一 `SESSION_TTL_SECONDS`。

#### 2.3.1 為何 cookie sliding 不在 `get()` 內做（RSC 限制）

Next.js 16 **Server Component** 中 `cookies()` 為唯讀；`cookies().set(...)` 會拋出 `Cookies can only be modified...`。如果 `SessionService.get()` 內偷偷寫 cookie，所有「在 RSC 內取 session 顯示 user 名」的場景都會炸。

**解法（採用）**：將 cookie sliding 與 store sliding **拆兩個 method**：

- `get()` **只** slide Redis TTL，不碰 cookie → RSC 安全可呼叫
- `touch()` slide cookie + Redis TTL → 僅 Route Handler / Server Action context 安全；由 `createRoute` 在 response phase 自動呼叫（§9.2 第 11 步）

**邊界後果**：
- 使用者在 RSC 上瀏覽（如 SSR 列表頁）只 slide Redis；cookie maxAge 不變
- 使用者下一次任何 Route Handler 互動（搜尋、無限滾動、寫入）即 slide cookie
- 純看 RSC 不互動 → 最終 cookie 過期 = 重新登入（可接受）；Redis 條目仍 TTL 內所以後端依然有 session
- Cookie 過期但 Redis 條目仍存活的 ghost session 由 Redis TTL 自然清理（最長 `SESSION_TTL_SECONDS` 後）

### 2.4 各模組責任

| 模組 | 責任 |
|---|---|
| `src/lib/session/cookie.ts` | iron-session 封裝；`readSessionId()` / `writeSessionId(id)` / `clearSessionCookie()` / `newSessionId()`（ADR 005 v2） |
| `src/lib/session/store/*` | `SessionStore` interface + `RedisSessionStore` impl + `InMemorySessionStore`（測試替身）。詳見 ADR 006 §5 |
| `src/lib/session/service.ts` | `SessionService`：組合 cookie + store，提供業務語意 API（`get()` / `create(data)` / `update(data)` / `destroy()` / `touch()` / `rotateCsrfToken()` / `refresh()`） |
| `src/lib/api/backend.ts` | 透過 `SessionService` 取 `accessToken` 注入 `Authorization`；過期觸發 refresh（見 §3） |
| `src/lib/security/verifyCsrf.ts` | unsafe method 驗證 `X-CSRF-Token` + Origin |
| Route Handler | 不直接讀 cookie / Redis；皆透過 `SessionService` |

---

## 3. Token 生命週期（access + refresh）

依 **專案根 ADR 004** 採用 access + refresh 雙 token：

| 項目 | 值 |
|---|---|
| Access token 壽命 | 3 小時 |
| Refresh token 壽命 | 30 天 |
| Refresh rotation | 每次 refresh 都換新 access + refresh；舊 refresh 立即失效 |
| Replay detection | 偵測到舊 refresh 二次使用 → backend 撤銷該 user 全部 refresh，BFF 收到後 `destroySession` |
| Access 緊急撤銷 | backend 用 Redis blacklist（BFF 無需感知，由 backend 401 回應觸發） |

### 3.1 BFF 端 refresh 流程

**`backendFetch` 內部** 在打 backend 前先判斷：

```
if (accessTokenExpiresAt < now + 30s)        // 30s safety margin
    → 走 refresh 流程
else
    → 直接帶現有 accessToken 打
```

### 3.2 Refresh 流程細節

```
1. BFF 對 backend 打 POST /auth/refresh
   body: { refreshToken }
2. Backend 回應分支：
   2a. 200 OK
       body: { accessToken, accessTokenExpiresAt, refreshToken, refreshTokenExpiresAt }
       → BFF SessionService.update(newTokens)（cookie sessionId 不變，Redis session 內容更新）
       → 用新 accessToken 重打原請求
   2b. 401 UNAUTHORIZED        ← refresh 失效（過期、撤銷、replay 偵測）
       → BFF SessionService.destroy()
       → 對 client 回 401 UNAUTHENTICATED
   2c. 5xx / timeout
       → 暫時性問題：對 client 回 503 BACKEND_UPSTREAM_ERROR
       → 不 destroy（讓使用者下次重試）
```

### 3.3 Backend 回 401 的兩種解釋

依 backend spec 005，backend 區分：

| Backend 錯誤碼 | HTTP | BFF 解讀 |
|---|---|---|
| `AUTH_TOKEN_EXPIRED` | 401 | access token 過期。**觸發 refresh**，成功後重打原請求；失敗回 401 UNAUTHENTICATED |
| `UNAUTHORIZED` | 401 | token 無效（簽章錯 / 被 blacklist / 缺漏）。**不**觸發 refresh，直接 `destroySession` 回 401 |

**重要：絕不對通用 401 觸發 refresh** —— 必須明確判斷 `error.code === 'AUTH_TOKEN_EXPIRED'`。否則會浪費 refresh token 且掩蓋 token 被撤銷的訊號。

### 3.4 並發 Refresh 去重（Cloud Run 跨 instance）— 依 ADR 006

並發請求 A、B、C 同時遇 `AUTH_TOKEN_EXPIRED`，若各自打 `/auth/refresh`，因 rotation 機制只有第一個會成功；其餘被 backend 視為 replay → 全部 session 被撤銷（ADR 004）。

Cloud Run **跨 instance**下，in-process Promise 去重**無效**（每個 instance 有自己的記憶體）。

**解法：Redis 分散式鎖 + fresh-tokens 短期 cache**（詳細流程與 Lua 釋鎖見 ADR 006 §6）。

```
SessionService.refresh(req):
  1. store.getCachedTokens(userId)
     └─ HIT → 用 cached pair 更新 session，回到 backend 重打
  2. lockToken = store.acquireLock('refresh-lock:'+userId, 10s)
     ├─ 取得鎖：
     │   - 再次 getCachedTokens（double-check）
     │   - 打 backend /auth/refresh
     │   - 成功 → setCachedTokens(60s) + 更新 session + releaseLock + 重打
     │   - 401 UNAUTHORIZED → destroySession + 401 + releaseLock
     │   - 5xx / timeout → 不 destroy，回 503 + releaseLock
     └─ 未取得鎖：
         - polling getCachedTokens 每 50ms，最長 2s
         - 命中 → 用該 pair 更新 session、重打
         - 超時 → 503 BACKEND_UPSTREAM_ERROR + Retry-After
```

| Redis key | TTL | 用途 |
|---|---|---|
| `refresh-lock:<userId>` | 10s | SET NX EX；防同 user 並發 refresh |
| `fresh-tokens:<userId>` | 60s | 剛 refresh 完的新 pair；讓等鎖請求免重打 backend |

> 鎖 TTL = 10s 是「backend refresh p99 (~2s) × 5」safety margin；fresh-tokens 60s 是「足夠覆蓋等鎖請求 + cold start instance」。理由詳見 ADR 006 §6.2 / §6.3。

> 鎖釋放**必須用 Lua 比對 token 後 DEL**，禁止裸 DEL（會誤殺別人的鎖）。Lua 腳本見 ADR 006 §6.1。

### 3.5 BFF Refresh 不輪換 CSRF token

CSRF token 綁 session 生命週期，不綁 access token。Refresh 不重產 CSRF token，避免客戶端頻繁 refetch。CSRF token 僅在 §4.3 列的事件下輪換。

---

## 4. CSRF 防護

採 **Synchronizer Token Pattern**（token 綁 session）+ **Origin / Referer 檢查**（defense in depth）+ **SameSite=Lax cookie**。

### 4.1 方案選擇

| 方案 | 採用？ | 理由 |
|---|---|---|
| **Synchronizer Token（session 內）** | ✅ | 已有加密 session 容器；無需第二顆 cookie；server 端比對最不易失誤 |
| Double-Submit Cookie | ❌ | 需第二顆 non-httpOnly cookie，XSS 攻擊面較大 |
| 純 Origin/Referer | ❌（單獨）| 偶有瀏覽器不送 header；僅作第二道 |
| 僅 SameSite=Lax | ❌（單獨）| Lax 仍允許 top-level GET；部分瀏覽器版本行為不一 |

### 4.2 Token 規格

| 屬性 | 值 |
|---|---|
| 長度 | 32 random bytes → base64url（43 字元） |
| 來源 | `crypto.randomBytes(32)` |
| 儲存 | session 內 `csrfToken` 欄位 |
| 客戶端取得 | `GET /api/csrf` 或 server-rendered HTML 嵌入 |
| 客戶端儲存 | **僅記憶體**（禁 localStorage / sessionStorage） |
| 客戶端傳送 | `X-CSRF-Token` HTTP header（禁 URL / body） |

### 4.3 生命週期

| 階段 | 行為 |
|---|---|
| Session 建立（首次登入） | `SessionService.create()` 自動產生 |
| Refresh access token | **不**輪換（見 §3.5） |
| 登入狀態轉換（login / logout / 切換帳號）| **強制輪換** |
| Session 銷毀 | 隨之失效 |

### 4.4 客戶端取得 token

`GET /api/csrf`：

```jsonc
// 200 OK
{ "data": { "csrfToken": "<base64url-43chars>" } }
// 401 UNAUTHENTICATED （無 session）
{ "error": { "code": "UNAUTHENTICATED", ... } }
```

- 不需 CSRF 檢查（chicken-and-egg）
- 需 session（無 session 不可能有 token）
- 客戶端在 hydration / mount 呼叫，並在收到 `403 CSRF_INVALID` 時 refetch

**最佳化**：Server Component 在初次 SSR 嵌入：

```tsx
const session = await SessionService.get()   // 內部解 cookie → 查 Redis
return <meta name="csrf-token" content={session?.csrfToken ?? ''} />
```

### 4.5 客戶端傳送 token

unsafe method（POST / PUT / PATCH / DELETE）**必須**帶 `X-CSRF-Token`。

**約定**：GET handler **必須** idempotent；任何寫入動作必須用 POST/PUT/PATCH/DELETE。違反此約定等於繞過 CSRF 防護。

### 4.6 Server 端驗證

```ts
// src/lib/security/verifyCsrf.ts
import 'server-only'
import { timingSafeEqual } from 'node:crypto'
import { CsrfError } from '@/lib/errors/CsrfError'
import { allowedOrigins } from '@/lib/config'
import type { Session } from '@/lib/session/types'

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS'])
const CSRF_EXEMPT_PATHS: ReadonlySet<string> = new Set([
  '/api/csrf',
  '/api/health',
  '/api/dev/login',                       // §10.4，僅 dev；token chicken-and-egg
  // OAuth callback 由 state 參數防 CSRF；具體 path 由 auth spec 加入
])

export function verifyCsrf(req: Request, session: Session): void {
  if (SAFE_METHODS.has(req.method)) return
  const path = new URL(req.url).pathname
  if (CSRF_EXEMPT_PATHS.has(path)) return

  const origin = req.headers.get('origin') ?? extractOriginFromReferer(req)
  if (!origin || !allowedOrigins.has(origin)) {
    throw new CsrfError('Invalid origin')
  }
  const provided = req.headers.get('x-csrf-token') ?? ''
  if (!constantTimeEqual(provided, session.csrfToken)) {
    throw new CsrfError('CSRF token mismatch')
  }
}

function constantTimeEqual(a: string, b: string): boolean {
  // 長度先檢避免 timingSafeEqual 拋錯；長度差異本身為公開資訊（token 長度固定）
  if (a.length !== b.length) return false
  return timingSafeEqual(Buffer.from(a), Buffer.from(b))
}
```

---

## 5. 模組結構

```
src/
├── app/
│   └── api/
│       ├── csrf/
│       │   ├── route.ts            # GET /api/csrf
│       │   └── route.test.ts
│       ├── health/
│       │   ├── route.ts            # GET /api/health
│       │   └── route.test.ts
│       ├── dev/
│       │   └── login/
│       │       ├── route.ts        # POST /api/dev/login（§10.4，僅 dev）
│       │       └── route.test.ts
│       └── <resource>/             # 個別 endpoint 由業務 spec 定義
│           ├── route.ts
│           └── route.test.ts
├── lib/
│   ├── api/
│   │   ├── backend.ts              # backendFetch wrapper（注入 JWT、refresh 流程）
│   │   ├── backend.test.ts
│   │   ├── create-route.ts         # createRoute() 高階 wrapper
│   │   ├── create-route.test.ts
│   │   ├── responses.ts            # okResponse(data, meta?) 等
│   │   ├── parsers.ts              # parseBody / parseQuery / parsePathParam
│   │   ├── parsers.test.ts
│   │   ├── request-id.ts
│   │   ├── http-status.ts
│   │   └── constants.ts            # timeout、cache TTL、token length 等
│   ├── session/
│   │   ├── cookie.ts               # iron-session 封裝：readSessionId / writeSessionId / clearSessionCookie / newSessionId（ADR 005 v2）
│   │   ├── cookie.test.ts
│   │   ├── service.ts              # SessionService：組合 cookie + store，業務語意 API（get/create/update/destroy/touch/rotateCsrfToken/refresh）
│   │   ├── service.test.ts
│   │   ├── config.ts               # iron-session sessionOptions
│   │   ├── types.ts                # StoredSession / TokenPair（ADR 006 §4.1）
│   │   └── store/
│   │       ├── types.ts            # SessionStore interface（ADR 006 §5）
│   │       ├── redis.ts            # RedisSessionStore（ioredis）
│   │       ├── in-memory.ts        # InMemorySessionStore（測試替身）
│   │       └── index.ts            # getSessionStore()：依 env 決定具體 impl（DI 入口）
│   ├── security/
│   │   ├── verifyCsrf.ts
│   │   ├── verifyCsrf.test.ts
│   │   └── origin.ts               # allowedOrigins、extractOriginFromReferer
│   ├── schemas/
│   │   ├── envelope.ts             # SuccessEnvelope / ErrorEnvelope
│   │   ├── pagination.ts           # CursorPage
│   │   └── <resource>.ts           # 個別資源 schema 由業務 spec 定義
│   ├── errors/
│   │   ├── BffError.ts             # base class + 錯誤碼 type
│   │   ├── BackendUpstreamError.ts
│   │   ├── BackendTimeoutError.ts
│   │   ├── ContractViolationError.ts
│   │   ├── UnauthenticatedError.ts
│   │   ├── ValidationError.ts
│   │   ├── CsrfError.ts
│   │   ├── NotFoundError.ts
│   │   └── toErrorResponse.ts
│   ├── config.ts                   # 環境變數 Zod 驗證（含 conditional required）
│   ├── log.ts                      # 結構化日誌 + 遮罩
│   └── mock/
│       ├── dispatch.ts             # registerMock / resolveMock
│       └── <resource>.ts           # 個別 fixture 由業務 spec 定義
└── tests/
    ├── contracts/
    │   └── session-store.contract.ts   # SessionStore 介面契約（套用 redis + in-memory 兩個 impl）
    └── helpers/
        ├── session.ts              # withSession(req, data) → 偽造 cookie + InMemoryStore 寫入
        ├── session-cookie.ts       # withSessionCookie(req, sessionId) → 只偽造 cookie 層
        ├── csrf.ts                 # csrfHeader(token)
        └── backend-mock.ts         # 設定 MSW handler 的薄包裝
```

> 約定：`src/lib/api/`、`src/lib/session/`、`src/lib/security/`、`src/lib/config.ts`、`src/lib/log.ts`、`src/lib/mock/`、`src/app/api/` 皆 **server-only**。檔頂第一行 `import 'server-only'`。

### 5.1 Next.js Request 型別約定

統一使用 Web 標準 `Request`。需 `cookies()` / `geo` 等 Next.js 特殊欄位時用 `NextRequest`，並在該 handler 註明原因。

### 5.2 `SessionService` 完整 interface

組合 `cookie.ts`（ADR 005 v2）+ `SessionStore`（ADR 006 §5），提供業務語意 API。

```ts
// src/lib/session/service.ts
import 'server-only'
import { cache } from 'react'

export interface CreateSessionInput {
  user: { id: string; name: string }
  tokens: TokenPair
}

export type SessionUpdatePatch = Partial<
  Pick<StoredSession,
    | 'accessToken' | 'accessTokenExpiresAt'
    | 'refreshToken' | 'refreshTokenExpiresAt'
    | 'user'
  >
>

export interface SessionService {
  /**
   * 解 cookie → 查 store；命中時觸發 **Redis sliding TTL**（**不**寫 cookie，RSC 安全）。
   * **Per-request 去重**：用 `react.cache()` wrap，同一請求多次呼叫共用結果。
   * Cookie sliding 由 `touch()` 負責，於 Route Handler / Server Action context 呼叫。
   */
  get(): Promise<StoredSession | null>

  /**
   * 建立新 session（首次登入或切換帳號時呼叫）：
   * 1. 產 sessionId（cookie 層）
   * 2. 產 csrfToken（43-char base64url）
   * 3. 寫 Redis store
   * 4. 寫 cookie
   * @throws BackendUpstreamError - Redis 寫入失敗
   */
  create(input: CreateSessionInput): Promise<{ sessionId: string; csrfToken: string }>

  /**
   * 更新 session 部分欄位（典型用於 refresh 後寫入新 token pair）：
   * - 不重產 sessionId、不重產 csrfToken
   * - 不重設 createdAt
   * - 重設 lastSeenAt、觸發 sliding TTL
   * @throws UnauthenticatedError - 無 session 可更新
   * @throws BackendUpstreamError - Redis 寫入失敗
   */
  update(patch: SessionUpdatePatch): Promise<void>

  /** 立即作廢：清 store + 清 cookie。冪等（呼叫時無 session 也 no-op）。 */
  destroy(): Promise<void>

  /**
   * Slide **cookie maxAge + Redis TTL**。Cookie 寫入需 Route Handler / Server Action context。
   * 由 `createRoute` 在 response phase 自動呼叫（§9.2 第 11 步）。
   * 無 session → no-op。
   * @throws Error - 在 RSC context 呼叫時，cookie 寫入會由 Next.js 拋出（呼叫端責任）
   */
  touch(): Promise<void>

  /**
   * 產新 csrfToken 寫回 store（登入狀態轉換時呼叫）。
   * @returns 新 token
   * @throws UnauthenticatedError - 無 session
   */
  rotateCsrfToken(): Promise<string>

  /**
   * 觸發 backend refresh 流程（ADR 006 §6 完整邏輯）。
   * 內部走分散式鎖 + fresh-tokens cache；多並發呼叫只打 backend 一次。
   * 成功 → 更新 session + 回傳新 StoredSession
   * @throws UnauthenticatedError - refresh 失敗（backend 401 / replay detected）
   * @throws BackendUpstreamError - backend 5xx / timeout / Redis 故障
   */
  refresh(): Promise<StoredSession>
}

/**
 * 取得 SessionService 實例。Store 透過 `getSessionStore()` 取得（依 env 決定 impl）。
 * 不要在模組 top-level 呼叫；它需要 Request scope（cookie / store handle）。
 */
export function getSessionService(): SessionService
```

#### `getSessionStore` DI pattern

```ts
// src/lib/session/store/index.ts
import 'server-only'
import type { SessionStore } from './types'
import { RedisSessionStore } from './redis'

let instance: SessionStore | undefined

/** Production / dev 預設用 Redis；testing 可透過 __setSessionStoreForTest 替換 */
export function getSessionStore(): SessionStore {
  if (!instance) instance = new RedisSessionStore()
  return instance
}

/** Test-only：手動注入替身（typically InMemorySessionStore） */
export function __setSessionStoreForTest(store: SessionStore | undefined): void {
  instance = store
}
```

測試用法：

```ts
// vitest.setup.ts 或個別 test
import { InMemorySessionStore } from '@/lib/session/store/in-memory'
import { __setSessionStoreForTest } from '@/lib/session/store'

beforeEach(() => __setSessionStoreForTest(new InMemorySessionStore()))
afterEach(() => __setSessionStoreForTest(undefined))    // 還原 → 下次 getSessionStore() 重建 Redis 連線
```

或用 `vi.mock` 整模組替換（適合廣域）：

```ts
vi.mock('@/lib/session/store', () => ({
  getSessionStore: () => mockStore,
}))
```

> 約定：**`__` 前綴函式僅測試可用**，正式程式碼 lint rule 禁用。

#### 實作要點

- `get()` 必須用 `react.cache()` 包裝，避免同一請求路徑（auth check + handler + backendFetch）多次 Redis round-trip
- `create()` 寫入順序：**先寫 store 再寫 cookie**——萬一 cookie 寫入失敗（極罕見），store 留下的條目會被 TTL 自然清理；反之則會留下無對應 store 的孤兒 cookie
- `destroy()` 順序：**先清 cookie 再清 store**——若 store 清除失敗使用者已登出 view（cookie 無效），store 條目由 TTL 收尾
- `refresh()` 不應該被 `create()` / `update()` 內部呼叫（避免遞迴）；它**只**從 `backendFetch` 的過期判斷或 `AUTH_TOKEN_EXPIRED` 401 路徑進入

#### Cache 行為摘要

| Method | per-request 去重 |
|---|---|
| `get()` | ✅（react.cache） |
| `create()` / `update()` / `destroy()` / `touch()` / `rotateCsrfToken()` / `refresh()` | ❌（mutation 不該去重） |

> Mutation 後同一請求內若再 `get()`，會回**舊值**（因 cache）。實作上：所有 mutation 方法執行完應 invalidate cache（react.cache 沒提供 invalidate；解法：mutation 回傳新值，呼叫端不要再 `get()`）。

---

## 6. 請求 / 回應契約

### 6.1 成功 envelope

```jsonc
{ "data": { /* 業務資料 */ } }

// 列表 + 游標分頁
{
  "data": { "items": [...], "nextCursor": "..." | null },
  "meta": { "count": 20 }
}
```

### 6.2 錯誤 envelope

```jsonc
{
  "error": {
    "code": "BACKEND_TIMEOUT",
    "message": "Upstream request timed out after 5000ms",
    "requestId": "req_2026-06-13_abc123"
  }
}
```

### 6.3 為何 envelope

- client fetch wrapper 統一判斷 `data` vs `error`
- 加 `meta` 不破壞契約
- 與 TanStack Query 的 `select` 解耦乾淨

### 6.4 共用 schema

```ts
// src/lib/schemas/envelope.ts
import { z } from 'zod'
export const ErrorPayload = z.object({ code: z.string(), message: z.string(), requestId: z.string() })
export function SuccessEnvelope<T extends z.ZodTypeAny>(data: T) {
  return z.object({ data, meta: z.record(z.string(), z.unknown()).optional() })
}
export const ErrorEnvelope = z.object({ error: ErrorPayload })

// src/lib/schemas/pagination.ts
export const CursorPage = z.object({
  items: z.array(z.unknown()),
  nextCursor: z.string().nullable(),
})
```

---

## 7. 錯誤協定

### 7.1 錯誤碼

| code | HTTP | 觸發情境 |
|---|---|---|
| `VALIDATION_ERROR` | 400 | 客戶端入參 Zod parse 失敗 |
| `UNAUTHENTICATED` | 401 | session 缺失 / 解密失敗 / refresh 失敗 |
| `CSRF_INVALID` | 403 | CSRF token 缺/錯 / origin 不在白名單 |
| `NOT_FOUND` | 404 | 真後端回 404 |
| `PAYLOAD_TOO_LARGE` | 413 | request body > 1MB（見 §10.2） |
| `BACKEND_TIMEOUT` | 504 | 真後端逾時 |
| `BACKEND_UPSTREAM_ERROR` | 502 | 真後端 5xx / 連線失敗 / DNS / JSON parse 失敗 |
| `CONTRACT_VIOLATION` | 502 | 真後端回應 schema parse 失敗 |
| `INTERNAL_ERROR` | 500 | 未預期錯誤（catch-all） |

> 與 backend `005-error-handling.md` 對齊：backend 的 `AUTH_TOKEN_EXPIRED` / `UNAUTHORIZED` 在 BFF 邊界轉譯為 `UNAUTHENTICATED`（client 視角不需區分），但**內部**邏輯依 §3.3 嚴格分流。

### 7.2 Error class 階層

```ts
// src/lib/errors/BffError.ts
export type BffErrorCode =
  | 'VALIDATION_ERROR' | 'UNAUTHENTICATED' | 'CSRF_INVALID' | 'NOT_FOUND'
  | 'PAYLOAD_TOO_LARGE' | 'BACKEND_TIMEOUT' | 'BACKEND_UPSTREAM_ERROR'
  | 'CONTRACT_VIOLATION' | 'INTERNAL_ERROR'

export class BffError extends Error {
  constructor(
    public readonly code: BffErrorCode,
    public readonly httpStatus: number,
    message: string,
    public readonly cause?: unknown,
  ) {
    super(message)
    this.name = this.constructor.name
  }
}
```

#### 7.2.1 各派生 class 規範簽名（**統一 `(message, cause?)`**）

每個檔案一個 class，pattern 相同：

```ts
// src/lib/errors/BackendTimeoutError.ts
import { BffError } from './BffError'
export class BackendTimeoutError extends BffError {
  constructor(message: string, cause?: unknown) { super('BACKEND_TIMEOUT', 504, message, cause) }
}

// 其餘比照（每檔一個）：
export class BackendUpstreamError extends BffError {
  constructor(message: string, cause?: unknown) { super('BACKEND_UPSTREAM_ERROR', 502, message, cause) }
}
export class ContractViolationError extends BffError {
  constructor(message: string, cause?: unknown) { super('CONTRACT_VIOLATION', 502, message, cause) }
}
export class ValidationError extends BffError {
  constructor(message: string, cause?: unknown) { super('VALIDATION_ERROR', 400, message, cause) }
}
export class UnauthenticatedError extends BffError {
  constructor(message: string, cause?: unknown) { super('UNAUTHENTICATED', 401, message, cause) }
}
export class CsrfError extends BffError {
  constructor(message: string, cause?: unknown) { super('CSRF_INVALID', 403, message, cause) }
}
export class NotFoundError extends BffError {
  constructor(message: string, cause?: unknown) { super('NOT_FOUND', 404, message, cause) }
}
export class PayloadTooLargeError extends BffError {
  constructor(message: string, cause?: unknown) { super('PAYLOAD_TOO_LARGE', 413, message, cause) }
}
```

> 統一 `(message, cause?)` 簽名讓呼叫端可機械化地寫 `throw new XError('...', err)`，避免不同 class 不同參數位置造成 bug。

### 7.3 統一映射

```ts
// src/lib/errors/toErrorResponse.ts
export function toErrorResponse(err: unknown, requestId: string): Response {
  if (err instanceof BffError) {
    return Response.json(
      { error: { code: err.code, message: err.message, requestId } },
      { status: err.httpStatus },
    )
  }
  return Response.json(
    { error: { code: 'INTERNAL_ERROR', message: 'Internal server error', requestId } },
    { status: 500 },
  )
}
```

handler 不在內部判斷錯誤型別；由 `createRoute` wrapper（§9）統一 catch 後交給 `toErrorResponse`。

---

## 8. backendFetch

### 8.1 行為規範

`src/lib/api/backend.ts` 提供 `backendFetch<T>(req, path, options)`：

| 行為 | 規則 |
|---|---|
| Base URL | `env.BACKEND_API_URL`；未設定且 `USE_MOCK !== '1'` → 啟動時拒絕（§13） |
| Timeout | 預設 5000ms (`AbortSignal.timeout`)，可 `options.timeoutMs` 覆寫 |
| Retry | **不**自動 retry |
| 認證標頭 | 透過 `SessionService.get()` 取 `accessToken` 注入 `Authorization: Bearer <token>` |
| Access token pre-emptive refresh | `accessTokenExpiresAt < now + 30s` → 呼叫 `SessionService.refresh()` |
| Backend 401 `AUTH_TOKEN_EXPIRED` | `SessionService.refresh()` 後重打一次原請求；refresh 失敗則 401 UNAUTHENTICATED |
| Backend 401 `UNAUTHORIZED` | **不** refresh，`SessionService.destroy()` + 401 |
| 並發 refresh | **Redis 分散式鎖 + fresh-tokens cache**（跨 Cloud Run instance；§3.4 與 ADR 006 §6） |
| Request ID | 產 `req_<date>_<rand>`，注入 `x-request-id` |
| 連線失敗 / DNS / JSON parse 失敗 | `BACKEND_UPSTREAM_ERROR (502)` |
| Redis 不可用 | `BACKEND_UPSTREAM_ERROR (502)`；**不**降級為 anonymous（fail-closed，ADR 006 §7） |
| Timeout | `BACKEND_TIMEOUT (504)` |
| 回應解析 | `await res.json()`；不做 Zod parse（呼叫端決定 schema） |

### 8.2 簽名

```ts
export async function backendFetch<T = unknown>(
  req: Request,
  path: string,
  options?: {
    method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'
    body?: unknown
    query?: Record<string, string | number | undefined>
    timeoutMs?: number
    headers?: Record<string, string>
    /** 設 true 時不讀 session、不附 Authorization（公開 endpoint） */
    anonymous?: boolean
  },
): Promise<{ data: T; requestId: string }>
```

### 8.3 Mock 模式

`USE_MOCK=1` 時不打網路，改用 §10 的 mock dispatch。CSRF 仍照常檢查（保持安全模式一致）。

### 8.4 完整流程（pseudocode）

```ts
// src/lib/api/backend.ts
import 'server-only'

const PRE_REFRESH_MARGIN_MS = 30_000   // §3.1 safety margin

export async function backendFetch<T>(
  req: Request,
  path: string,
  options: BackendFetchOptions = {},
): Promise<{ data: T; requestId: string }> {
  const requestId = newRequestId()
  const start = Date.now()
  log.info({ requestId, path, method: options.method ?? 'GET' }, 'bff.upstream.start')

  try {
    // ── 1. USE_MOCK 短路 ────────────────────────────────────────
    if (env.USE_MOCK === '1') {
      const handler = resolveMock(path)
      if (!handler) throw new BackendUpstreamError(`No mock registered for ${path}`)
      const data = handler({ query: options.query, body: options.body }) as T
      log.info({ requestId, durationMs: Date.now() - start }, 'bff.upstream.mock.ok')
      return { data, requestId }
    }

    // ── 2. 準備 headers ──────────────────────────────────────
    const headers: Record<string, string> = {
      'x-request-id': requestId,
      'content-type': 'application/json',
      ...options.headers,
    }

    // ── 3. 注入 Authorization（非 anonymous）─────────────────
    let accessToken: string | null = null
    if (!options.anonymous) {
      const session = await getSessionService().get()
      if (!session) throw new UnauthenticatedError('No session')

      // Pre-emptive refresh（§3.1）
      if (session.accessTokenExpiresAt < Date.now() + PRE_REFRESH_MARGIN_MS) {
        const refreshed = await getSessionService().refresh()   // 內部走 §3.4 分散式鎖
        accessToken = refreshed.accessToken
      } else {
        accessToken = session.accessToken
      }
      headers['authorization'] = `Bearer ${accessToken}`
    }

    // ── 4. 發 request ────────────────────────────────────────
    const url = buildUrl(env.BACKEND_API_URL!, path, options.query)
    const body = options.body != null ? JSON.stringify(options.body) : undefined
    const signal = AbortSignal.timeout(options.timeoutMs ?? 5000)

    let response: Response
    try {
      response = await fetch(url, { method: options.method ?? 'GET', headers, body, signal })
    } catch (err) {
      throw classifyNetworkError(err)   // → BackendTimeoutError / BackendUpstreamError
    }

    // ── 5. Handle backend 401 ───────────────────────────────
    if (response.status === 401 && !options.anonymous) {
      const errBody = await safeReadJson(response)
      const backendCode = errBody?.error?.code

      if (backendCode === 'AUTH_TOKEN_EXPIRED') {
        // §3.3 EXPIRED → refresh 並重打一次（只重打一次，避免無限循環）
        const refreshed = await getSessionService().refresh()
        headers['authorization'] = `Bearer ${refreshed.accessToken}`
        try {
          response = await fetch(url, { method: options.method ?? 'GET', headers, body, signal: AbortSignal.timeout(options.timeoutMs ?? 5000) })
        } catch (err) {
          throw classifyNetworkError(err)
        }
      } else {
        // §3.3 UNAUTHORIZED / 其他 401 code → 直接 destroy（不 refresh）
        await getSessionService().destroy().catch(() => {})
        throw new UnauthenticatedError(backendCode ?? 'UNAUTHORIZED')
      }
    }

    // ── 6. 重打後若仍 401 → 視為 refresh 失效 ────────────────
    if (response.status === 401 && !options.anonymous) {
      await getSessionService().destroy().catch(() => {})
      throw new UnauthenticatedError('refresh succeeded but retry still 401')
    }

    // ── 7. 其他 non-2xx 映射 ─────────────────────────────────
    if (!response.ok) {
      if (response.status === 404) throw new NotFoundError(`Backend 404 on ${path}`)
      if (response.status >= 500) throw new BackendUpstreamError(`Backend ${response.status}`)
      // 4xx 其他（含 backend 自己的 VALIDATION_ERROR）：當作 upstream 異常
      throw new BackendUpstreamError(`Unexpected backend status ${response.status}`)
    }

    // ── 8. 解析 JSON ────────────────────────────────────────
    let data: T
    try {
      data = await response.json() as T
    } catch {
      throw new BackendUpstreamError('Backend response not valid JSON')
    }

    log.info({ requestId, durationMs: Date.now() - start, status: response.status }, 'bff.upstream.ok')
    return { data, requestId }

  } catch (err) {
    log.warn({ requestId, durationMs: Date.now() - start, code: errorCodeOf(err) }, 'bff.upstream.error')
    throw err
  }
}

// —— Helpers ————————————————————————————————————————

function classifyNetworkError(err: unknown): BffError {
  if (err instanceof Error) {
    if (err.name === 'TimeoutError' || err.name === 'AbortError') return new BackendTimeoutError(err.message)
    // ECONNREFUSED / DNS / ECONNRESET / fetch network errors
    if ((err as any).code === 'ECONNREFUSED' || (err as any).code === 'ENOTFOUND') return new BackendUpstreamError(err.message)
  }
  return new BackendUpstreamError('Network error')
}

async function safeReadJson(res: Response): Promise<any> {
  try { return await res.clone().json() } catch { return null }
}
```

### 8.5 流程關鍵不變式

1. **同一請求最多打 backend 兩次**：原打 + 一次 refresh 後重打。第二次仍 401 即放棄
2. **`AUTH_TOKEN_EXPIRED` 是唯一觸發 refresh 的訊號**：通用 401 / 缺 Authorization / blacklist 命中都不 refresh（§3.3 安全要求）
3. **Refresh 過 1 次後不再 pre-emptive refresh**：避免極端時序下無限循環
4. **`anonymous: true` 跳過所有 session 邏輯**：不讀 session、不注入 Authorization、不對 401 reactive refresh
5. **Mock 模式跳過 session 邏輯**：但**不**跳過 createRoute 的 CSRF 檢查（§9.2 第 6 步）

### 8.6 與 SessionService 的整合（per-request 去重）

- `SessionService.get()` 用 `react.cache()` 包裝（§5.2），即使 `backendFetch` 在 `createRoute` 已 resolve session 後再次呼叫，**也只打一次 Redis**
- `SessionService.refresh()` 內部用 Redis 分散式鎖（ADR 006 §6），即使並發呼叫**只打一次 backend `/auth/refresh`**

---

## 9. Route Handler wrapper（`createRoute`）

集中 try/catch + getSession + verifyCsrf + body/query parse + logging + toErrorResponse，避免每個 handler 重複 boilerplate。

### 9.1 簽名（型別層 `requireAuth` × `revalidate` 互斥）

```ts
// src/lib/api/create-route.ts
import type { ZodType } from 'zod'

type CacheOption =
  | 'no-store'
  | { revalidate: number; tags?: readonly string[] }

type RouteHandlerArgs<TBody, TQuery, TParams, TRequireAuth extends boolean> = {
  req: Request
  requestId: string
  body: TBody
  query: TQuery
  params: TParams
  session: TRequireAuth extends true ? StoredSession : StoredSession | null
}

type Common<TBody, TQuery, TParams, TAuth extends boolean> = {
  bodySchema?: ZodType<TBody>
  querySchema?: ZodType<TQuery>
  paramsSchema?: ZodType<TParams>
  handler: (args: RouteHandlerArgs<TBody, TQuery, TParams, TAuth>) => Promise<Response> | Response
}

/**
 * 型別層互斥：requireAuth: true 時 cache 只能是 'no-store'（per-user 資料禁 revalidate）。
 * 由 discriminated union 強制：TS 型別檢查階段直接擋下違規組合。
 */
type RouteOptions<TBody, TQuery, TParams, TAuth extends boolean> =
  TAuth extends true
    ? Common<TBody, TQuery, TParams, true> & {
        requireAuth: true
        cache?: 'no-store'                                       // ← 只允許 no-store
      }
    : Common<TBody, TQuery, TParams, false> & {
        requireAuth?: false
        cache?: CacheOption                                      // ← 全部允許
      }

export function createRoute<TBody = undefined, TQuery = undefined, TParams = undefined, TAuth extends boolean = false>(
  opts: RouteOptions<TBody, TQuery, TParams, TAuth>,
): (req: Request, ctx: { params: Promise<Record<string, string>> }) => Promise<Response>
```

#### 9.1.1 使用驗證

| 寫法 | TS 結果 |
|---|---|
| `createRoute({ requireAuth: true, cache: 'no-store', handler })` | ✅ 通過 |
| `createRoute({ requireAuth: true, cache: { revalidate: 60 }, handler })` | ❌ `Type '{ revalidate: number; }' is not assignable to type '"no-store" \| undefined'` |
| `createRoute({ cache: { revalidate: 60 }, handler })` | ✅ 通過（公開 endpoint） |
| `createRoute({ requireAuth: true, handler })` 內部 `args.session` | ✅ `StoredSession`（非 null） |
| `createRoute({ handler })` 內部 `args.session` | ✅ `StoredSession \| null` |

> **Runtime 防線**：即使型別被 `as any` 繞過，wrapper 在 step 9（cache 套用）若偵測 `requireAuth: true && cache !== 'no-store'` 應 `throw new Error('createRoute: requireAuth=true requires cache=no-store')`。型別 + runtime 雙重防護。

### 9.2 wrapper 行為

按順序執行（任一失敗 → 走 `toErrorResponse`）：

1. 產 `requestId`、`log.info({ requestId, path, method }, 'bff.request.in')`
2. 動態 params parse（若有 `paramsSchema`）→ 失敗 `VALIDATION_ERROR`
3. Query parse（若有 `querySchema`）→ 失敗 `VALIDATION_ERROR`
4. 讀 session（`SessionService.get()`）
5. 若 `requireAuth: true` 且無 session → `UnauthenticatedError`
6. unsafe method（POST/PUT/PATCH/DELETE）→ `verifyCsrf(req, session)`
7. Body parse（若有 `bodySchema`）→ 失敗 `VALIDATION_ERROR` / `PAYLOAD_TOO_LARGE`
8. 呼叫 `handler(args)` 取得 `Response`
9. 套用 `cache` 設定到回應
10. **若 step 4 有 session：呼叫 `SessionService.touch()`**（slide cookie maxAge + Redis TTL；§2.3.1）
11. `log.info({ requestId, status, durationMs }, 'bff.response.out')`
12. 全程 try/catch → `toErrorResponse(err, requestId)`

> Step 10 在 step 9 之後執行——cache 設定先綁回應，touch 寫 cookie；兩者順序無依賴但放最後便於失敗回滾思考。

### 9.3 使用範例

```ts
// src/app/api/<resource>/route.ts （通用範本）
import { createRoute, okResponse } from '@/lib/api'
import { backendFetch } from '@/lib/api/backend'
import { FooResponseSchema, FooQuerySchema } from '@/lib/schemas/foo'

export const GET = createRoute({
  querySchema: FooQuerySchema,
  cache: { revalidate: 60, tags: ['foo:list'] },
  handler: async ({ req, query }) => {
    const { data } = await backendFetch(req, '/<resource>', { query, anonymous: true })
    return okResponse(FooResponseSchema.parse(data))
  },
})

export const POST = createRoute({
  requireAuth: true,
  bodySchema: CreateFooBodySchema,
  cache: 'no-store',
  handler: async ({ req, body }) => {
    const { data } = await backendFetch(req, '/<resource>', { method: 'POST', body })
    // 寫入後 invalidate 列表
    revalidateTag('foo:list')
    return okResponse(FooSchema.parse(data))
  },
})
```

### 9.4 配套 helpers

```ts
// src/lib/api/responses.ts
export function okResponse<T>(data: T, meta?: Record<string, unknown>): Response {
  return Response.json(meta ? { data, meta } : { data }, { status: 200 })
}
```

```ts
// src/lib/api/parsers.ts
import 'server-only'
import type { ZodType } from 'zod'
import { ValidationError } from '@/lib/errors/ValidationError'
import { PayloadTooLargeError } from '@/lib/errors/PayloadTooLargeError'
import { MAX_BODY_BYTES } from './constants'

/** Body 大小雙保險 + JSON parse + Zod 驗證 */
export async function parseBody<T>(req: Request, schema: ZodType<T>): Promise<T> {
  // Step 1：Content-Length 預檢（攻擊者宣稱大小）
  const len = req.headers.get('content-length')
  if (len && Number(len) > MAX_BODY_BYTES) {
    throw new PayloadTooLargeError(`Body exceeds ${MAX_BODY_BYTES} bytes (content-length)`)
  }
  // Step 2：實際讀取時逐 chunk 計數（防止 chunked transfer 繞過 Content-Length）
  if (!req.body) {
    const result = schema.safeParse(undefined)
    if (!result.success) throw new ValidationError(formatZod(result.error))
    return result.data
  }
  const reader = req.body.getReader()
  const chunks: Uint8Array[] = []
  let total = 0
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    total += value.byteLength
    if (total > MAX_BODY_BYTES) {
      await reader.cancel().catch(() => {})
      throw new PayloadTooLargeError(`Body exceeds ${MAX_BODY_BYTES} bytes (streamed)`)
    }
    chunks.push(value)
  }
  const buf = new Uint8Array(total)
  let off = 0
  for (const c of chunks) { buf.set(c, off); off += c.byteLength }
  const text = new TextDecoder().decode(buf)
  let raw: unknown
  try { raw = text.length ? JSON.parse(text) : undefined }
  catch (e) { throw new ValidationError('Body is not valid JSON', e) }
  const result = schema.safeParse(raw)
  if (!result.success) throw new ValidationError(formatZod(result.error))
  return result.data
}

export function parseQuery<T>(req: Request, schema: ZodType<T>): T {
  const raw = Object.fromEntries(new URL(req.url).searchParams)
  const result = schema.safeParse(raw)
  if (!result.success) throw new ValidationError(formatZod(result.error))
  return result.data
}

export function parsePathParams<T>(raw: Record<string, string>, schema: ZodType<T>): T {
  const result = schema.safeParse(raw)
  if (!result.success) throw new ValidationError(formatZod(result.error))
  return result.data
}

function formatZod(err: import('zod').ZodError): string {
  return err.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ')
}
```

`MAX_BODY_BYTES` 由 `src/lib/api/constants.ts` 匯出（預設 `1_000_000`，可由 spec 補微調）。

### 9.5 cache 安全性（critical）

| 規則 | 強制 |
|---|---|
| `requireAuth: true` 與 `cache: { revalidate: ... }` **互斥** | ✅ TypeScript 型別層阻擋 + runtime assertion |
| 任何讀 session 的 handler | 必須 `cache: 'no-store'` |
| 含搜尋 / per-user query 的 handler | 必須 `cache: 'no-store'` |

> 違反此規則 = 可能將 user A 的回應快取後回給 user B。型別與 runtime assert 雙重防護。

---

## 10. Mock 模式

### 10.1 啟用

`USE_MOCK=1` 時，`backendFetch` 經 `src/lib/mock/dispatch.ts` 對應到 fixture。Route Handler 不感知。

### 10.2 Dispatch 機制

```ts
// src/lib/mock/dispatch.ts
type MockHandler = (opts: { query?: Record<string, unknown>; body?: unknown }) => unknown
const registry = new Map<string, MockHandler>()
export function registerMock(path: string, handler: MockHandler) { registry.set(path, handler) }
export function resolveMock(path: string): MockHandler | undefined { return registry.get(path) }
```

業務 fixture 檔需在 app start 階段 **eager import**（建議集中於 `src/lib/mock/index.ts` re-export），避免遲到註冊。

### 10.3 Body 上限

`parseBody` 透過 `Content-Length` 與串流計數雙保險，超過 `MAX_BODY_BYTES`（1MB）拋 `PayloadTooLargeError`。

### 10.4 Dev mock session bootstrap

需登入的 endpoint 在 dev 期間沒有 OAuth 流程可走，本節定義「dev 啟動後 5 秒內就能測 auth 路徑」的最小方案。

#### 10.4.1 端點

```
POST /api/dev/login
  body 可選：{ user?: { id, name }, ttlHours?: number }
  回應：{ data: { sessionId, csrfToken, user, expiresAt } }
```

僅當以下**全部**成立時可用：

| 條件 | 防線 |
|---|---|
| `env.NODE_ENV !== 'production'` | 啟動時 route 直接 throw NotFoundError，回 404 |
| `env.ENABLE_DEV_LOGIN === '1'` | 額外白名單；prod 容器設定 `'0'` 防誤啟 |

兩道防線**並用**，避免「測試環境 NODE_ENV 設成 production」之類誤設定。

#### 10.4.2 行為

```ts
// src/app/api/dev/login/route.ts
import 'server-only'
import { env } from '@/lib/config'
import { getSessionService } from '@/lib/session/service'
import { NotFoundError } from '@/lib/errors/NotFoundError'
import { okResponse, createRoute } from '@/lib/api'

const DEV_USER = { id: 'dev-user-1', name: 'Dev User' }

export const POST = createRoute({
  cache: 'no-store',
  handler: async () => {
    if (env.NODE_ENV === 'production' || env.ENABLE_DEV_LOGIN !== '1') {
      throw new NotFoundError('dev login disabled')
    }
    const now = Date.now()
    const accessTtlMs = 3 * 60 * 60 * 1000      // 3h，對齊 ADR 004
    const refreshTtlMs = 30 * 24 * 60 * 60 * 1000 // 30d

    const result = await getSessionService().create({
      user: DEV_USER,
      tokens: {
        accessToken: 'dev-fake-access-token',
        accessTokenExpiresAt: now + accessTtlMs,
        refreshToken: 'dev-fake-refresh-token',
        refreshTokenExpiresAt: now + refreshTtlMs,
      },
    })
    return okResponse({ ...result, user: DEV_USER, expiresAt: now + accessTtlMs })
  },
})
```

#### 10.4.3 與 USE_MOCK 的搭配

| 組合 | 結果 | 用途 |
|---|---|---|
| `USE_MOCK=1` + dev login | 完全本機跑；backend 不必啟動，fake token 不會被驗證 | **dev 預設模式** |
| `USE_MOCK=0` + dev login | session 已建但 fake token 打真 backend 會 401 | 不建議；應走真實 OAuth flow |
| `USE_MOCK=0` + 真實登入 flow | 正式流程；本 spec 範圍外（auth-login.md）| 整合測試 / production |

#### 10.4.4 CSRF 與 Origin

`/api/dev/login` 為 POST，理論上需 CSRF；但：
- 第一次呼叫時 client 還沒 session、沒 csrfToken（chicken-and-egg）
- 將此 path 加入 §4.6 `CSRF_EXEMPT_PATHS`（與 `/api/csrf` 同處理）
- Origin 檢查**仍照常**（屬白名單，dev 必含 `http://localhost:3000`）

#### 10.4.5 環境變數

加入 §13 變數清單：

| 變數 | 範圍 | 必填 | 預設 | 用途 |
|---|---|---|---|---|
| `ENABLE_DEV_LOGIN` | server | — | `'0'` | `'1'` 啟用 `/api/dev/login`；production 自動鎖死 |

`src/lib/config.ts` superRefine 加：

```ts
if (env.NODE_ENV === 'production' && env.ENABLE_DEV_LOGIN === '1') {
  ctx.addIssue({ code: 'custom', path: ['ENABLE_DEV_LOGIN'], message: 'must not be enabled in production' })
}
```

#### 10.4.6 測試

- `NODE_ENV=production` + `ENABLE_DEV_LOGIN=1` → env 驗證失敗（啟動拒絕）
- `NODE_ENV=production` + `ENABLE_DEV_LOGIN=0` → 路由回 404
- `NODE_ENV=development` + `ENABLE_DEV_LOGIN=1` → 200，session 建立成功
- 後續對需 auth 的 endpoint 請求帶 cookie → 通過 auth 檢查

---

## 11. 驗證邊界（Zod）

### 11.1 四道驗證

| 邊界 | 對象 | 失敗 → |
|---|---|---|
| 入站：客戶端參數 | `parseBody` / `parseQuery` / `parsePathParams` | `VALIDATION_ERROR (400)` |
| 入站：session 結構 | 解密後的 session | `UNAUTHENTICATED (401)` |
| 入站：CSRF | `X-CSRF-Token` + Origin | `CSRF_INVALID (403)` |
| 出站：真後端回應 | `await res.json()` 結果 | `CONTRACT_VIOLATION (502)` |

### 11.2 Schema 約定

- 共用：`envelope.ts`、`pagination.ts`
- 個別資源：業務 spec 在 `src/lib/schemas/<resource>.ts` 定義，匯出 `z.infer` 型別
- UI / handler / `backendFetch` 呼叫端共用同一個 schema，禁止平行宣告

---

## 12. 快取策略

### 12.1 預設

Next.js 16 的 fetch 預設**不** cache。透過 `createRoute` 的 `cache` 欄位明確指定。

### 12.2 約定

| Endpoint 類型 | 策略 |
|---|---|
| 公開列表（不依 session） | `{ revalidate: 60, tags: ['<resource>:list'] }` |
| 公開詳細頁 | `{ revalidate: 300, tags: ['<resource>:{id}'] }` |
| 含搜尋參數（`q`） | `'no-store'` |
| 任何讀 session 的 endpoint | `'no-store'` |
| 寫入操作 | `'no-store'`，handler 內 `revalidateTag(...)` |

### 12.3 Tag 命名與失效

```
<resource>:list
<resource>:{id}
```

寫入後在 handler 內：

```ts
import { revalidateTag } from 'next/cache'
revalidateTag('foo:list')
```

---

## 13. 環境變數

### 13.1 Zod 驗證與條件式必填

```ts
// src/lib/config.ts
import 'server-only'
import { z } from 'zod'

const RawEnv = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  BACKEND_API_URL: z.string().url().optional(),
  USE_MOCK: z.enum(['0', '1']).default('0'),
  SESSION_SECRET: z.string().min(32).optional(),
  SESSION_COOKIE_NAME: z.string().default('jko_session'),
  SESSION_TTL_SECONDS: z.coerce.number().int().positive().default(60 * 60 * 24 * 7),
  ALLOWED_ORIGINS: z.string().optional(),

  // —— Redis（BFF session store，ADR 006）——
  REDIS_URL: z.string().url().optional(),
  REDIS_KEY_PREFIX: z.string().default('jko-bff'),
  REDIS_TLS_ENABLED: z.enum(['0', '1']).default('0'),
  REDIS_CONNECT_TIMEOUT_MS: z.coerce.number().int().positive().default(2000),
  REDIS_COMMAND_TIMEOUT_MS: z.coerce.number().int().positive().default(1000),

  APP_VERSION: z.string().default('0.0.0'),       // 給 /api/health 用
  APP_COMMIT: z.string().optional(),              // 給 /api/health 用
  ENABLE_DEV_LOGIN: z.enum(['0', '1']).default('0'),  // 給 /api/dev/login 用，§10.4
  NEXT_PUBLIC_APP_NAME: z.string().default('JKODonation'),
}).superRefine((env, ctx) => {
  // USE_MOCK=0 時：BACKEND_API_URL、SESSION_SECRET、REDIS_URL 必填
  if (env.USE_MOCK === '0') {
    if (!env.BACKEND_API_URL) ctx.addIssue({ code: 'custom', path: ['BACKEND_API_URL'], message: 'required when USE_MOCK=0' })
    if (!env.SESSION_SECRET)  ctx.addIssue({ code: 'custom', path: ['SESSION_SECRET'],  message: 'required when USE_MOCK=0' })
    if (!env.REDIS_URL)       ctx.addIssue({ code: 'custom', path: ['REDIS_URL'],       message: 'required when USE_MOCK=0' })
  }
  // production 不允許 ALLOWED_ORIGINS 為空或僅含 localhost
  if (env.NODE_ENV === 'production') {
    const list = (env.ALLOWED_ORIGINS ?? '').split(',').map(s => s.trim()).filter(Boolean)
    if (list.length === 0 || list.every(o => o.startsWith('http://localhost'))) {
      ctx.addIssue({ code: 'custom', path: ['ALLOWED_ORIGINS'], message: 'production requires non-localhost origins' })
    }
  }
  // production 不允許 dev login（§10.4 第二道防線）
  if (env.NODE_ENV === 'production' && env.ENABLE_DEV_LOGIN === '1') {
    ctx.addIssue({ code: 'custom', path: ['ENABLE_DEV_LOGIN'], message: 'must not be enabled in production' })
  }
})

export const env = RawEnv.parse(process.env)
export const allowedOrigins = new Set(
  (env.ALLOWED_ORIGINS ?? 'http://localhost:3000').split(',').map(s => s.trim()).filter(Boolean),
)
```

驗證失敗 = 啟動拒絕，**不**讓服務帶錯設定上線。

### 13.2 變數清單

| 變數 | 範圍 | 必填條件 | 預設 | 用途 |
|---|---|---|---|---|
| `NODE_ENV` | server | 必（Next.js 自動）| `development` | 環境模式 |
| `BACKEND_API_URL` | server | `USE_MOCK=0` 時必填 | — | BFF → backend base URL |
| `USE_MOCK` | server | — | `'0'` | `'1'` 走 mock fixture |
| `SESSION_SECRET` | server | `USE_MOCK=0` 時必填 | — | iron-session cookie 加密金鑰（≥ 32 字元） |
| `SESSION_COOKIE_NAME` | server | — | `jko_session` | session cookie 名稱 |
| `SESSION_TTL_SECONDS` | server | — | `604800`（7d）| session 存活秒數（cookie + Redis 同步） |
| `ALLOWED_ORIGINS` | server | production 必且非僅 localhost | `http://localhost:3000` | CSRF Origin 白名單 |
| `REDIS_URL` | server | `USE_MOCK=0` 時必填 | — | BFF Redis 連線；`redis://` / `rediss://` |
| `REDIS_KEY_PREFIX` | server | — | `jko-bff` | Key 命名空間（多環境共用一 Redis 時隔離） |
| `REDIS_TLS_ENABLED` | server | — | `'0'` | 顯式覆寫；通常從 URL scheme 推斷 |
| `REDIS_CONNECT_TIMEOUT_MS` | server | — | `2000` | 連線 timeout |
| `REDIS_COMMAND_TIMEOUT_MS` | server | — | `1000` | 單一 command timeout |
| `APP_VERSION` | server | — | `0.0.0` | `/api/health` 回傳用 |
| `APP_COMMIT` | server | — | — | `/api/health` 回傳用 |
| `ENABLE_DEV_LOGIN` | server | — | `'0'` | `'1'` 啟用 `/api/dev/login`；production 啟動拒絕 |
| `NEXT_PUBLIC_APP_NAME` | client + server | — | `JKODonation` | UI 顯示用 |

`.env.example` 同步更新。

---

## 14. 日誌 / Observability

### 14.1 結構化欄位

| 欄位 | 必含 | 說明 |
|---|---|---|
| `level` | ✅ | `info` / `warn` / `error` |
| `requestId` | ✅ | 串連 BFF + backend 日誌 |
| `event` | ✅ | `bff.request.in` / `bff.upstream.ok` / `bff.upstream.error` / `bff.csrf.rejected` / `bff.response.out` |
| `path`, `method` | request/response | |
| `status`, `durationMs` | response | |
| `upstreamPath`, `upstreamStatus`, `upstreamCode` | upstream | |
| `userId` | 有 session 時 | |

### 14.2 遮罩規則（自動套用，由 `log.ts` 集中）

| 內容 | 遮罩方式 |
|---|---|
| `Authorization` header / accessToken / refreshToken | 只記前 8 字元 + `...`（不可全字串） |
| `X-CSRF-Token` | 只記長度與是否存在，不記內容 |
| `sessionId`（cookie 解出後）| 只記前 4 字 + `...`（log 串連用，不洩漏完整 ID） |
| session cookie 加密字串 | 完全不 log |
| Redis key（含 sessionId / userId） | sessionId 部分套上述遮罩 |
| OAuth `state` | 只記長度 |
| 使用者 email、姓名（若未來出現） | 雜湊或 redacted |
| Internal error stack trace | 完整記入 server log；**不**回傳到 client envelope |
| Upstream error message | 摘要記入 server log；不洩漏 backend 內部訊息給 client |

### 14.3 MVP 實作（具體 API）

```ts
// src/lib/log.ts
import 'server-only'

type LogObj = Record<string, unknown>
type Level = 'info' | 'warn' | 'error'

function emit(level: Level, obj: LogObj, event: string): void {
  const line = JSON.stringify({ level, event, time: new Date().toISOString(), ...obj })
  if (level === 'error') console.error(line)
  else if (level === 'warn') console.warn(line)
  else console.log(line)
}

export const log = {
  info:  (obj: LogObj, event: string) => emit('info',  obj, event),
  warn:  (obj: LogObj, event: string) => emit('warn',  obj, event),
  error: (obj: LogObj, event: string) => emit('error', obj, event),
}

// —— Masking helpers ——
export function maskBearer(authHeader: string | null | undefined): string {
  if (!authHeader) return ''
  const m = /^Bearer\s+(\S+)$/i.exec(authHeader)
  return m ? `Bearer ${m[1].slice(0, 8)}...` : '<malformed>'
}
export function maskToken(token: string | null | undefined): string {
  return token ? `${token.slice(0, 8)}...` : ''
}
export function maskSessionId(id: string | null | undefined): string {
  return id ? `${id.slice(0, 4)}...` : ''
}
export function maskCsrfToken(token: string | null | undefined): { present: boolean; length: number } {
  return { present: Boolean(token), length: token?.length ?? 0 }
}
```

呼叫方式（spec 全篇統一）：

```ts
log.info({ requestId, path, method }, 'bff.request.in')
log.warn({ requestId, code: errorCodeOf(err) }, 'bff.upstream.error')
log.error({ requestId, err: err instanceof Error ? err.message : String(err) }, 'bff.internal.error')
```

> 接 backend 後可在不改呼叫端的前提下，把 `emit` 內部換成 `pino`。

---

## 15. 測試模式

> 本節定義**模式**；個別 endpoint 案例由業務 spec 列出。

### 15.1 Route Handler 通用測試清單

每個 handler 至少：

| # | 案例 | 斷言 |
|---|---|---|
| 1 | Happy path | envelope 結構、HTTP 200 |
| 2 | Backend 5xx | `BACKEND_UPSTREAM_ERROR` + 502 |
| 3 | Backend timeout | `BACKEND_TIMEOUT` + 504 |
| 4 | Backend 回非預期格式 | `CONTRACT_VIOLATION` + 502 |
| 5 | 連線失敗 / DNS 錯 | `BACKEND_UPSTREAM_ERROR` + 502 |
| 6（需 auth）| 未帶 session | `UNAUTHENTICATED` + 401 |
| 7（需 auth）| AUTH_TOKEN_EXPIRED → refresh 成功 → 重打 | 200 |
| 8（需 auth）| AUTH_TOKEN_EXPIRED → refresh 失敗 | `UNAUTHENTICATED` + 401 + cookie 清除 |
| 9（需 auth）| Backend 回 UNAUTHORIZED（非 EXPIRED）| `UNAUTHENTICATED` + 401 + cookie 清除（**不**觸發 refresh） |
| 10（unsafe method）| 未帶 X-CSRF-Token | `CSRF_INVALID` + 403 |
| 11（unsafe method）| Token 錯 | `CSRF_INVALID` + 403 |
| 12（unsafe method）| Origin 不在白名單 | `CSRF_INVALID` + 403 |
| 13 | Body > 1MB | `PAYLOAD_TOO_LARGE` + 413 |

### 15.2 `backendFetch` 測試

- timeout、non-2xx、連線失敗、DNS 失敗、JSON parse 失敗 → 對應錯誤型別
- mock 模式經 dispatch 取得 fixture；未註冊 path → `BackendUpstreamError`
- `anonymous: true` 時不讀 session
- session 存在時注入 `Authorization`
- access pre-emptive refresh（剩餘 < 30s）
- `AUTH_TOKEN_EXPIRED` → refresh 流程
- `UNAUTHORIZED` → 不 refresh，直接拋
- **Redis 不可用 → `BACKEND_UPSTREAM_ERROR` (502)**（fail-closed，不降級為 anonymous）

### 15.3 `session` 測試

#### 15.3.1 Cookie 層（`cookie.ts`，ADR 005 v2）
- `writeSessionId` → `readSessionId` round-trip
- 損壞 / 簽章錯的 cookie → `readSessionId` 回 `null`
- `clearSessionCookie` 清除 cookie
- `newSessionId` 產 43-char base64url

#### 15.3.2 SessionStore 契約測試（`tests/contracts/session-store.contract.ts`，套用所有 impl）

ADR 006 §10.1 規範的契約。同一組案例同時跑 `RedisSessionStore`（對 docker-compose Redis）與 `InMemorySessionStore`：

- `set` → `get` round-trip
- `get` 命中後 sliding TTL（TTL 重設）
- `destroy` 後 `get` 回 null
- `touch` 更新 TTL
- `acquireLock` 第一次成功、第二次失敗（同一 key）
- `releaseLock` 用正確 token 成功、用錯 token 失敗（Lua 原子比對）
- 鎖 TTL 到期後自動可被其他 caller 取得
- `getCachedTokens` / `setCachedTokens` round-trip
- `ping` 在連線健康時回 true

#### 15.3.3 SessionService 整合測試
- `create()`：產 sessionId + 寫 store + 寫 cookie + 自動 csrfToken
- `get()`：解 cookie → 查 store；任一環節失敗 → null
- `refresh()` 並發測試（critical，ADR 006 §10.3）：
  - 5 個並發呼叫，只有 1 個打 backend `/auth/refresh`
  - 其餘 4 個從 `getCachedTokens` 取結果
  - 5 個全成功
- `destroy()`：清 store + 清 cookie 兩者同時發生

### 15.4 `verifyCsrf` 測試

| 案例 | 期望 |
|---|---|
| Safe method | 通過 |
| 豁免路徑 | 通過 |
| 無 Origin 且無 Referer | `CsrfError` |
| Origin 不在白名單 | `CsrfError` |
| 無 X-CSRF-Token | `CsrfError` |
| Token 長度錯 | `CsrfError`（不可拋 native 例外）|
| Token 內容錯 | `CsrfError` |
| Origin + token 正確 | 通過 |

### 15.5 `createRoute` 測試

- 順序：params → query → auth → csrf → body → handler
- 任一階段失敗的錯誤碼正確
- `requireAuth: true` + `cache: { revalidate }` → 型別錯 / runtime assert 失敗
- handler 拋出非 BffError → 回 `INTERNAL_ERROR`

### 15.6 `errors` / `config` / `/api/csrf` / `/api/health` 測試

- `toErrorResponse`：所有錯誤碼的 status + envelope 正確；未知錯誤 fallback `INTERNAL_ERROR`
- `config`：必填變數缺漏 → throw；production 的 `ALLOWED_ORIGINS` 守門；`USE_MOCK=0` 條件式必填
- `/api/csrf`：無 session → 401；有 session → 回 `csrfToken`
- `/api/health`：回 `{ status: 'ok', uptime, version, commit }`，**不**洩漏內部資訊

### 15.7 測試輔助（`tests/helpers/`）

```ts
// tests/helpers/session-cookie.ts （cookie 層；ADR 005 v2）
export async function withSessionCookie(req: Request, sessionId: string): Promise<Request>

// tests/helpers/session.ts （整合：cookie + InMemoryStore；單元測試主要用）
export async function withSession(
  req: Request,
  data: Partial<StoredSession>,
): Promise<{ req: Request; sessionId: string; store: InMemorySessionStore }>

// tests/helpers/csrf.ts
export function csrfHeader(token: string): HeadersInit { return { 'x-csrf-token': token, 'origin': 'http://localhost:3000' } }

// tests/helpers/backend-mock.ts
export function mockBackend(handler: (req: Request) => Promise<Response>): void { /* 設 MSW handler */ }
```

`SessionService` 單元測試與 Route Handler 測試**預設用 `InMemorySessionStore`**（不打網路）。`RedisSessionStore` 只在契約測試（§15.3.2）與 CI 整合測試跑。

### 15.8 覆蓋率目標

| 範圍 | 目標 |
|---|---|
| `src/lib/` | ≥ 90% lines |
| `src/app/api/` | ≥ 85% lines |

CI 不設硬性 fail 門檻（短工期），但 PR 報告覆蓋率變化。

---

## 16. 不在本 spec 解決（後續）

| 議題 | 後續 spec / ADR |
|---|---|
| Cookie 封裝選型 | **已決定 ADR 005 v2（iron-session）** |
| Server-side session 存儲（Redis）+ provider 抽象 | **已決定 ADR 006** |
| OAuth 登入流程（Google）、`/auth/google/callback` 對接 | spec：`auth-login.md` |
| Refresh / Logout endpoint 對 backend 的明確契約 | spec：`auth-token-flow.md`（與 backend 同步） |
| 個別 resource 的 schema、endpoint、mock fixture、tag | 個別業務 spec |
| Rate limit（BFF 端） | 基礎建設後補（介面已在 ADR 006 預留） |
| Idempotency-Key for writes（轉發 backend） | 寫入操作 spec |
| Streaming / WebSocket / SSE | 無此需求 |
| Cache Components / `use cache` 在 RSC 細部使用 | UI spec |

---

## 17. 驗收條件

當以下都成立時，本 spec 視為**已實作**：

- [ ] `src/lib/config.ts`：env Zod 驗證、conditional required（USE_MOCK / production / Redis）、`allowedOrigins` 解析
- [ ] `src/lib/session/cookie.ts`：§15.3.1 所有案例通過（ADR 005 v2）
- [ ] `src/lib/session/store/redis.ts` 與 `in-memory.ts`：§15.3.2 SessionStore 契約測試**兩個 impl 同套案例都通過**（ADR 006 §10.1）
- [ ] `src/lib/session/service.ts`：§15.3.3 整合測試通過，**含並發 refresh 5-request 測試只打 backend 一次**（critical，ADR 006 §10.3）
- [ ] `src/lib/security/verifyCsrf.ts`：§15.4 所有案例通過
- [ ] `src/lib/api/backend.ts`：§15.2 所有案例通過（含 Redis 不可用 → 502 fail-closed）
- [ ] `src/lib/api/create-route.ts`：§15.5 所有案例通過；type-level `requireAuth` × `revalidate` 互斥已驗證
- [ ] `src/lib/api/{responses,parsers,request-id,http-status,constants}.ts` 全數存在 + 測試
- [ ] `src/lib/errors/*`（含 `CsrfError`、`PayloadTooLargeError`）+ `toErrorResponse` 通過所有錯誤碼測試
- [ ] `src/lib/schemas/envelope.ts`、`pagination.ts` 通過 happy + edge case
- [ ] `src/lib/mock/dispatch.ts`：register / resolve / 未註冊三類測試
- [ ] `src/lib/log.ts`：JSON 格式 + 敏感欄位遮罩（含 `Authorization` 前 8 字元、`X-CSRF-Token` 只記長度、`sessionId` 前 4 字）測試
- [ ] `src/app/api/csrf/route.ts`、`src/app/api/health/route.ts` 通過 §15.6 案例（health 含 Redis ping）
- [ ] `src/app/api/dev/login/route.ts` 通過 §10.4.6 案例（production 啟動拒絕 / 404 / dev 200）
- [ ] `frontend/docker-compose.yml` 提供本地 Redis（ADR 006 §9）
- [ ] `.env.example` 同步包含本 spec §13.2 所有變數（含 `REDIS_*`）
- [ ] **無業務字眼自檢**：`grep -rE "charity|donation|jko[^_-]" src/lib/{api,session,security,errors,config,mock,log,schemas/{envelope,pagination}}` 應無命中（`jko-` / `jko_` 等基建前綴允許）
- [ ] 文件回填：本 spec §16 在實作時若有變動需 PR 同步更新

---

最後更新：2026-06-13
