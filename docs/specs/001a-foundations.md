# Spec 001a：BFF 基礎建設 — Foundations

- **狀態**：Draft
- **建立日期**：2026-06-13
- **影響範圍**：`src/lib/{config,log}.ts`、`src/lib/errors/*`、`src/lib/api/{constants,http-status}.ts`、`src/lib/schemas/{envelope,pagination}.ts`、`src/lib/mock/dispatch.ts`
- **依賴**：本 spec 為 Spec 001 系列**最底層**，僅依賴 Next.js / Zod / node 內建。下游：[001b](./001b-session-store.md)、[001c](./001c-session-service.md)、[001d](./001d-security-csrf.md)、[001e](./001e-backend-fetch.md)、[001f](./001f-create-route.md)、[001g](./001g-routes-and-lifecycle.md) 全部需要本 spec 已完成。
- **總覽**：見 [001 index](./001-bff-infrastructure.md)

---

## 1. 範圍與設計決策

### 1.1 範圍內

- 環境變數讀取與驗證（`src/lib/config.ts`）
- 結構化 log 與敏感資料遮罩（`src/lib/log.ts`）
- 全域常數（`src/lib/api/constants.ts`）
- HTTP status 對映表（`src/lib/api/http-status.ts`）
- 錯誤類別階層 + envelope 映射（`src/lib/errors/*`）
- 共用 Zod schemas（`src/lib/schemas/envelope.ts`、`src/lib/schemas/pagination.ts`）
- Mock dispatch 機制（`src/lib/mock/dispatch.ts`）

### 1.2 範圍外

- 任何 resource 的 schema 與 mock fixture（業務 spec）
- session、CSRF、HTTP fetch、Route Handler wrapper（後續 001b–001f）

### 1.3 設計決策：**不提供任何 cache 層**

| 理由 | 說明 |
|---|---|
| 多 instance 命中率低 | 預期 Cloud Run 多 instance 部署，per-instance 進程記憶體 cache 命中率隨 scale-out 線性下降；要解需引入 Redis cache handler，成本不划算 |
| `revalidateTag` 跨 instance 不可靠 | 同上，沒 Redis cache handler 時 tag 失效只清本機 cache，其他 instance 仍回舊資料 |
| CDN 才是正確位置 | 真要快取，正確位置是 BFF 前的 CDN（控制台 / Edge Config）或 backend 內部對 DB 的 query cache，不在 Next.js 進程裡 |
| 多一層 = 多一個 stale 故障點 | Browser → CDN → Next.js Data Cache → backend → DB；少一層少一個 debug 路徑 |
| Per-user / 搜尋本來就 no-store | 能 cache 的只剩公開列表/詳細頁，這些 CDN 已涵蓋 |

**強制規則**：所有 Response 一律 `Cache-Control: no-store, private`；`okResponse`（001f）、`toErrorResponse`（本 spec §2.3）、`/api/health`（001g）都在源頭就帶上；`createRoute`（001f）在 response phase 補上作為 fallback。

要加 cache 層時請開新 spec 處理：
- 評估部署是否仍多 instance；若是，先決定 Redis cache handler
- 在 `createRoute` 加 `cache` 欄位（型別層強制 `requireAuth × cache` 互斥）
- 在 `backendFetch` 加 `next?: { revalidate?, tags? }` 透傳到底層 fetch
- 同步更新 createRoute 的 Cache-Control 強制邏輯與相關安全性規則

---

## 2. 錯誤協定

### 2.1 錯誤碼總表

| code | HTTP | 觸發情境 |
|---|---|---|
| `VALIDATION_ERROR` | 400 | 客戶端入參 Zod parse 失敗 |
| `UNAUTHENTICATED` | 401 | session 缺失 / 解密失敗 / refresh 失敗 |
| `CSRF_INVALID` | 403 | CSRF token 缺/錯 / origin 不在白名單 |
| `NOT_FOUND` | 404 | 真後端回 404 |
| `PAYLOAD_TOO_LARGE` | 413 | request body > 1MB（見 001f §3.2） |
| `BACKEND_TIMEOUT` | 504 | 真後端逾時 |
| `BACKEND_UPSTREAM_ERROR` | 502 | 真後端 5xx / 連線失敗 / DNS / JSON parse 失敗 |
| `CONTRACT_VIOLATION` | 502 | 真後端回應 schema parse 失敗 |
| `INTERNAL_ERROR` | 500 | 未預期錯誤（catch-all） |

> 與 backend `005-error-handling.md` 對齊：backend 的 `AUTH_TOKEN_EXPIRED` / `UNAUTHORIZED` 在 BFF 邊界轉譯為 `UNAUTHENTICATED`（client 視角不需區分），但**內部**邏輯依 001c §2.3 嚴格分流。

### 2.2 Error class 階層

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

#### 2.2.1 各派生 class 規範簽名（**統一 `(message, cause?)`**）

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

### 2.3 統一映射（`toErrorResponse`）

```ts
// src/lib/errors/toErrorResponse.ts
const NO_STORE_HEADERS: HeadersInit = {
  'content-type': 'application/json',
  'cache-control': 'no-store, private',
}

export function toErrorResponse(err: unknown, requestId: string): Response {
  if (err instanceof BffError) {
    return new Response(
      JSON.stringify({ error: { code: err.code, message: err.message, requestId } }),
      { status: err.httpStatus, headers: NO_STORE_HEADERS },
    )
  }
  return new Response(
    JSON.stringify({ error: { code: 'INTERNAL_ERROR', message: 'Internal server error', requestId } }),
    { status: 500, headers: NO_STORE_HEADERS },
  )
}
```

> 用 `new Response(JSON.stringify(...))` 而非 `Response.json(...)`：前者讓 `Cache-Control` 在建構時就綁定，避免依賴 runtime 對 `Response.headers.set` 的支援。

handler 不在內部判斷錯誤型別；由 `createRoute` wrapper（001f）統一 catch 後交給 `toErrorResponse`。

### 2.4 Error envelope 形狀

```jsonc
{
  "error": {
    "code": "BACKEND_TIMEOUT",
    "message": "Upstream request timed out after 5000ms",
    "requestId": "req_2026-06-13_abc123"
  }
}
```

`requestId` 格式：`req_<ISO-date>_<8-char-base36>`（產生器於 001f）。

---

## 3. 環境變數（`src/lib/config.ts`）

### 3.1 Zod 驗證與條件式必填

```ts
// src/lib/config.ts
import 'server-only'
import { z } from 'zod'

const RawEnv = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  BACKEND_API_URL: z.string().url().optional(),
  USE_MOCK: z.enum(['0', '1']).default('0'),
  // iron-session 在 cookie 路徑一律會用到 password，即便 USE_MOCK=1 也跑
  // sessionService.get() → 解 cookie。因此 SESSION_SECRET 一律必填，不受 USE_MOCK 控制。
  SESSION_SECRET: z.string().min(32),
  /** 上一代 secret，用於 rotation 期間 verify-only。iron-session 餵 [current, previous]，
   *  既能讀舊 cookie 又會用新 secret 重簽。輪換完拿掉即可。 */
  SESSION_SECRET_PREVIOUS: z.string().min(32).optional(),
  SESSION_COOKIE_NAME: z.string().default('streamsight_session'),
  /** 預設與 refresh token 壽命對齊（ADR 004：30d）。先前預設 7d 會導致「refresh 還有效但
   *  session 過期，使用者體感被莫名踢出」。對齊後使用者只在「30 天沒互動」才需重新登入。 */
  SESSION_TTL_SECONDS: z.coerce.number().int().positive().default(60 * 60 * 24 * 30),
  ALLOWED_ORIGINS: z.string().optional(),

  // —— Redis（BFF session store，ADR 006）——
  REDIS_URL: z.string().url().optional(),
  REDIS_KEY_PREFIX: z.string().default('streamsight-bff'),
  REDIS_TLS_ENABLED: z.enum(['0', '1']).default('0'),
  REDIS_CONNECT_TIMEOUT_MS: z.coerce.number().int().positive().default(2000),
  REDIS_COMMAND_TIMEOUT_MS: z.coerce.number().int().positive().default(1000),

  APP_VERSION: z.string().default('0.0.0'),       // 給 /api/health 用
  APP_COMMIT: z.string().optional(),              // 給 /api/health 用
  NEXT_PUBLIC_APP_NAME: z.string().default('StreamSight'),
}).superRefine((env, ctx) => {
  // USE_MOCK=0 時：BACKEND_API_URL、REDIS_URL 必填
  // (SESSION_SECRET 已在 schema 層 unconditional 要求，不需在這裡再守一道)
  if (env.USE_MOCK === '0') {
    if (!env.BACKEND_API_URL) ctx.addIssue({ code: 'custom', path: ['BACKEND_API_URL'], message: 'required when USE_MOCK=0' })
    if (!env.REDIS_URL)       ctx.addIssue({ code: 'custom', path: ['REDIS_URL'],       message: 'required when USE_MOCK=0' })
  }
  // production 不允許 ALLOWED_ORIGINS 為空或僅含 localhost
  if (env.NODE_ENV === 'production') {
    const list = (env.ALLOWED_ORIGINS ?? '').split(',').map(s => s.trim()).filter(Boolean)
    if (list.length === 0 || list.every(o => o.startsWith('http://localhost'))) {
      ctx.addIssue({ code: 'custom', path: ['ALLOWED_ORIGINS'], message: 'production requires non-localhost origins' })
    }
  }
})

export const env = RawEnv.parse(process.env)
```

驗證失敗 = 啟動拒絕，**不**讓服務帶錯設定上線。

### 3.2 變數清單

| 變數 | 範圍 | 必填條件 | 預設 | 用途 |
|---|---|---|---|---|
| `NODE_ENV` | server | 必（Next.js 自動） | `development` | 環境模式 |
| `BACKEND_API_URL` | server | `USE_MOCK=0` 時必填 | — | BFF → backend base URL |
| `USE_MOCK` | server | — | `'0'` | `'1'` 走 mock fixture |
| `SESSION_SECRET` | server | **必填**（≥ 32 字元，含 USE_MOCK=1 模式） | — | iron-session cookie 加密金鑰；cookie 路徑一律會用到 |
| `SESSION_SECRET_PREVIOUS` | server | — | — | Rotation 期間 verify-only 的舊 secret；輪換完拿掉 |
| `SESSION_COOKIE_NAME` | server | — | `streamsight_session` | session cookie 名稱 |
| `SESSION_TTL_SECONDS` | server | — | `2592000`（30d，與 refresh token 對齊） | session 存活秒數（cookie + Redis 同步） |
| `ALLOWED_ORIGINS` | server | production 必且非僅 localhost | `http://localhost:3000` | CSRF Origin 白名單 |
| `REDIS_URL` | server | `USE_MOCK=0` 時必填 | — | BFF Redis 連線；`redis://` / `rediss://` |
| `REDIS_KEY_PREFIX` | server | — | `streamsight-bff` | Key 命名空間（多環境共用一 Redis 時隔離） |
| `REDIS_TLS_ENABLED` | server | — | `'0'` | 顯式覆寫；通常從 URL scheme 推斷 |
| `REDIS_CONNECT_TIMEOUT_MS` | server | — | `2000` | 連線 timeout |
| `REDIS_COMMAND_TIMEOUT_MS` | server | — | `1000` | 單一 command timeout |
| `APP_VERSION` | server | — | `0.0.0` | `/api/health` 回傳用 |
| `APP_COMMIT` | server | — | — | `/api/health` 回傳用 |
| `NEXT_PUBLIC_APP_NAME` | client + server | — | `StreamSight` | UI 顯示用 |

`.env.example` 同步更新。

---

## 4. 常數（`src/lib/api/constants.ts`）

所有時間 / 大小常數**僅在此宣告**，禁止在使用點硬寫。

```ts
// src/lib/api/constants.ts
export const MAX_BODY_BYTES = 1_000_000              // 001f §3.2 parseBody
export const DEFAULT_BACKEND_TIMEOUT_MS = 5_000      // 001e §1
export const PRE_REFRESH_MARGIN_MS = 30_000          // 001c §2 / 001e
export const REFRESH_LOCK_TTL_MS = 10_000            // 001c §3 / ADR 006 §6
export const REFRESH_POLLER_TIMEOUT_MS = 8_000       // 001c §3
export const REFRESH_POLLER_INTERVAL_MS = 50         // 001c §3
export const FRESH_TOKENS_TTL_MS = 60_000            // 001c §3
export const CSRF_TOKEN_BYTES = 32                   // 001d §2 → 43-char base64url
export const SESSION_ID_BYTES = 32                   // 001b §2 → 43-char base64url

// Cloud Run SIGTERM → 10s 內必須結束；留 2s 給 runtime + log flush，所以 8s deadline
export const SHUTDOWN_DEADLINE_MS = 8_000             // 001g §5
```

> 集中常數的價值：log / test / spec 改數字只動一處；避免「PRE_REFRESH_MARGIN 在規格寫 30s，但 backend.ts 寫死 25s」這類飄移。

---

## 5. HTTP status 對映（`src/lib/api/http-status.ts`）

```ts
// src/lib/api/http-status.ts
export const HTTP = {
  OK: 200,
  BAD_REQUEST: 400, UNAUTHORIZED: 401, FORBIDDEN: 403, NOT_FOUND: 404, PAYLOAD_TOO_LARGE: 413,
  INTERNAL_ERROR: 500, BAD_GATEWAY: 502, SERVICE_UNAVAILABLE: 503, GATEWAY_TIMEOUT: 504,
} as const
```

---

## 6. 結構化 log（`src/lib/log.ts`）

### 6.1 結構化欄位

| 欄位 | 必含 | 說明 |
|---|---|---|
| `level` | ✅ | `info` / `warn` / `error` |
| `requestId` | ✅ | 串連 BFF + backend 日誌 |
| `event` | ✅ | `bff.request.in` / `bff.upstream.ok` / `bff.upstream.error` / `bff.csrf.rejected` / `bff.response.out` |
| `path`, `method` | request/response | |
| `status`, `durationMs` | response | |
| `upstreamPath`, `upstreamStatus`, `upstreamCode` | upstream | |
| `userId` | 有 session 時 | |

### 6.2 遮罩規則（自動套用，由 `log.ts` 集中）

| 內容 | 遮罩方式 |
|---|---|
| `Authorization` header / accessToken / refreshToken | 只記前 8 字元 + `...`（不可全字串） |
| `X-CSRF-Token` | 只記長度與是否存在，不記內容 |
| `sessionId`（cookie 解出後） | 只記前 4 字 + `...`（log 串連用，不洩漏完整 ID） |
| session cookie 加密字串 | 完全不 log |
| Redis key（含 sessionId / userId） | sessionId 部分套上述遮罩 |
| OAuth `state` | 只記長度 |
| 使用者 email、姓名（若未來出現） | 雜湊或 redacted |
| Internal error stack trace | 完整記入 server log；**不**回傳到 client envelope |
| Upstream error message | 摘要記入 server log；不洩漏 backend 內部訊息給 client |

### 6.3 MVP 實作

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

### 6.4 呼叫慣例

```ts
log.info({ requestId, path, method }, 'bff.request.in')
log.warn({ requestId, code: errorCodeOf(err) }, 'bff.upstream.error')
log.error({ requestId, err: err instanceof Error ? err.message : String(err) }, 'bff.internal.error')
```

> 接 backend 後可在不改呼叫端的前提下，把 `emit` 內部換成 `pino`。

---

## 7. 共用 schemas

### 7.1 Success envelope

```jsonc
{ "data": { /* 業務資料 */ } }

// 列表 + 游標分頁
{
  "data": { "items": [...], "nextCursor": "..." | null },
  "meta": { "count": 20 }
}
```

### 7.2 envelope.ts

```ts
// src/lib/schemas/envelope.ts
import { z } from 'zod'
export const ErrorPayload = z.object({ code: z.string(), message: z.string(), requestId: z.string() })
export function SuccessEnvelope<T extends z.ZodTypeAny>(data: T) {
  return z.object({ data, meta: z.record(z.string(), z.unknown()).optional() })
}
export const ErrorEnvelope = z.object({ error: ErrorPayload })
```

### 7.3 pagination.ts

```ts
// src/lib/schemas/pagination.ts
import { z } from 'zod'
export const CursorPage = z.object({
  items: z.array(z.unknown()),
  nextCursor: z.string().nullable(),
})
```

### 7.4 為何 envelope

- client fetch wrapper 統一判斷 `data` vs `error`
- 加 `meta` 不破壞契約
- 與 TanStack Query 的 `select` 解耦乾淨

---

## 8. Mock dispatch（`src/lib/mock/dispatch.ts`）

### 8.1 機制

```ts
// src/lib/mock/dispatch.ts
type MockHandler = (opts: { query?: Record<string, unknown>; body?: unknown }) => unknown
const registry = new Map<string, MockHandler>()
export function registerMock(path: string, handler: MockHandler) { registry.set(path, handler) }
export function resolveMock(path: string): MockHandler | undefined { return registry.get(path) }
```

業務 fixture 檔需在 app start 階段 **eager import**（建議集中於 `src/lib/mock/index.ts` re-export），避免遲到註冊。

### 8.2 啟用條件

`USE_MOCK=1` 時，`backendFetch`（001e）經 `resolveMock(path)` 對應到 fixture。Route Handler 不感知。

---

## 9. 測試清單

### 9.1 `config`

- 必填變數缺漏 → `parse` throw
- `USE_MOCK=1` 時 `BACKEND_API_URL` / `REDIS_URL` 可缺，但 `SESSION_SECRET` **仍必填**
- `USE_MOCK=0` 時 `BACKEND_API_URL` / `REDIS_URL` 必填，否則 throw
- `SESSION_SECRET` 缺漏 → 不論 `USE_MOCK` 值都 throw
- `production` 的 `ALLOWED_ORIGINS` 守門：空 / 僅 localhost → throw

### 9.2 `errors/toErrorResponse`

- 所有錯誤碼 → 對應 status + envelope 形狀
- 未知錯誤（非 BffError）→ fallback `INTERNAL_ERROR` (500)
- Response header `cache-control: no-store, private` 一定存在

### 9.3 `log`

- JSON 一行格式
- `maskBearer`：`Bearer abcdefghijklmnop` → `Bearer abcdefgh...`
- `maskBearer`：缺 prefix → `<malformed>`
- `maskBearer`：null/undefined → `''`
- `maskToken`：32+ 字元 → 前 8 + `...`
- `maskSessionId`：前 4 + `...`
- `maskCsrfToken`：`{ present, length }`，不含原文

### 9.4 `schemas/envelope` + `schemas/pagination`

- `SuccessEnvelope(z.string()).parse({ data: 'x' })` 通過
- `SuccessEnvelope(z.string()).parse({ data: 'x', meta: { count: 1 } })` 通過
- `ErrorEnvelope.parse({ error: { code, message, requestId } })` 通過
- 缺欄位 → throw
- `CursorPage.parse({ items: [], nextCursor: null })` 通過

### 9.5 `mock/dispatch`

- `registerMock('/foo', h)` 後 `resolveMock('/foo') === h`
- 未註冊 path → `undefined`
- 同 path 重註冊 → 後者覆寫前者

### 9.6 `constants` / `http-status`

- 不需個別測試（純常數）；驗證手段為下游模組 import 時不能拋；spec 內各章節指 `xxx` 常數時也僅引用此檔案

---

## 10. 驗收條件

當以下都成立時，本子 spec 視為**已實作**：

- [ ] `src/lib/config.ts`：env Zod 驗證、conditional required（USE_MOCK / production / Redis）；含 `SESSION_SECRET_PREVIOUS` 可選欄位；§9.1 測試全綠
- [ ] `src/lib/errors/BffError.ts` + 所有派生 class（含 `CsrfError`、`PayloadTooLargeError`）+ `toErrorResponse`；§9.2 測試全綠
- [ ] `src/lib/log.ts`：JSON 格式 + 敏感欄位遮罩 helpers；§9.3 測試全綠
- [ ] `src/lib/api/constants.ts`、`src/lib/api/http-status.ts` 內容對齊 §4 / §5
- [ ] `src/lib/schemas/envelope.ts` + `pagination.ts` 通過 §9.4 case
- [ ] `src/lib/mock/dispatch.ts` 通過 §9.5 case
- [ ] `.env.example` 同步 §3.2 變數清單
- [ ] **無業務字眼**（grep 不到 `charity|donation|streamsight[^_-]`）
- [ ] `pnpm lint` + `pnpm test` + `pnpm typecheck` 綠
