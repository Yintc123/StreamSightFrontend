# Spec 001f：BFF 基礎建設 — createRoute

- **狀態**：Draft
- **建立日期**：2026-06-13
- **影響範圍**：`src/lib/api/{create-route,parsers,responses,request-id}.ts`、`src/lib/api/index.ts`（barrel）
- **依賴**：
  - [001a foundations](./001a-foundations.md)（errors、constants、log、http-status）
  - [001b session-store](./001b-session-store.md)（`StoredSession`）
  - [001c session-service](./001c-session-service.md)（`getSessionService`）
  - [001d security-csrf](./001d-security-csrf.md)（`verifyCsrf`）
- **下游**：[001g routes-and-lifecycle](./001g-routes-and-lifecycle.md) 及所有業務 endpoint
- **總覽**：見 [001 index](./001-bff-infrastructure.md)

---

## 1. 範圍

集中 try/catch + getSession + verifyCsrf + body/query parse + logging + toErrorResponse，避免每個 handler 重複 boilerplate。

包含：
- `createRoute` 高階 wrapper（§2）
- `okResponse` helper（§3.1）
- `parseBody` / `parseQuery` / `parsePathParams`（§3.2 / §3.3 / §3.4）
- `newRequestId`（§3.5）

> **本 spec 不提供 cache 層**。所有 Response 一律帶 `Cache-Control: no-store`（理由見 001a §1.3）。若未來需要 CDN cache 或 Next.js data cache，由後續 spec 補；屆時 createRoute 才會增加 `cache` 欄位。

---

## 2. createRoute

### 2.1 簽名

```ts
// src/lib/api/create-route.ts
import 'server-only'
import type { ZodType } from 'zod'
import type { StoredSession } from '@/lib/session/types'

type RouteHandlerArgs<TBody, TQuery, TParams, TRequireAuth extends boolean> = {
  req: Request
  requestId: string
  body: TBody
  query: TQuery
  params: TParams
  session: TRequireAuth extends true ? StoredSession : StoredSession | null
}

type RouteOptions<TBody, TQuery, TParams, TAuth extends boolean> = {
  requireAuth?: TAuth
  bodySchema?: ZodType<TBody>
  querySchema?: ZodType<TQuery>
  paramsSchema?: ZodType<TParams>
  /**
   * 豁免 CSRF token 比對（仍檢查 Origin 白名單）。僅用於 chicken-and-egg 端點：
   * `/api/csrf`、`/api/auth/login`、`/api/auth/register`、OAuth callback（由 state 參數防 CSRF）。
   * 預設 false。
   */
  csrfExempt?: boolean
  handler: (args: RouteHandlerArgs<TBody, TQuery, TParams, TAuth>) => Promise<Response> | Response
}

export function createRoute<TBody = undefined, TQuery = undefined, TParams = undefined, TAuth extends boolean = false>(
  opts: RouteOptions<TBody, TQuery, TParams, TAuth>,
): (req: Request, ctx: { params: Promise<Record<string, string>> }) => Promise<Response>
```

### 2.2 型別驗證

| 寫法 | TS 結果 |
|---|---|
| `createRoute({ handler })` 內部 `args.session` | ✅ `StoredSession \| null` |
| `createRoute({ requireAuth: true, handler })` 內部 `args.session` | ✅ `StoredSession`（非 null） |
| `createRoute({ csrfExempt: true, handler })` | ✅ POST 不需 CSRF token，仍檢查 Origin |

### 2.3 wrapper 行為（按順序執行）

任一失敗 → 走 `toErrorResponse`（001a §2.3）：

1. 產 `requestId`、`log.info({ requestId, path, method }, 'bff.request.in')`
2. 動態 params parse（若有 `paramsSchema`）→ 失敗 `VALIDATION_ERROR`
3. Query parse（若有 `querySchema`）→ 失敗 `VALIDATION_ERROR`
4. 讀 session：`const session = await getSessionService().get()`。**此為整個 request 唯一一次 SessionService.get() 呼叫**，後續透過 args.session 傳遞
5. 若 `requireAuth: true` 且無 session → `UnauthenticatedError`
6. unsafe method（POST/PUT/PATCH/DELETE）→ `verifyCsrf(req, session, { exempt: opts.csrfExempt })`
7. Body parse（若有 `bodySchema`）→ 失敗 `VALIDATION_ERROR` / `PAYLOAD_TOO_LARGE`
8. 呼叫 `handler({ ..., session })` 取得 `Response`
9. **強制覆寫 `Cache-Control: no-store, private`**（即使 handler 自己設了別的值，也以 BFF 策略為準）：用 `new Response(res.body, { ..., headers })` 把 body stream 轉接到新 Response，避免 in-memory 緩衝、也避開 Web `Response.headers.set` runtime 差異。`okResponse` / `toErrorResponse` 在源頭已帶 `no-store, private`，此步在那種情況退化為 no-op（short-circuit 判斷 header 已是預期值就直接 return 原 res）
10. **若 step 4 有 session 且 `!getSessionService().wasMutated()`：`await getSessionService().touch()`**（同步 slide cookie maxAge + Redis TTL；001b §3）。`wasMutated()` 涵蓋 handler 內呼叫的 `update / refresh / destroy / rotateCsrfToken`，避免雙 slide
11. `log.info({ requestId, status, durationMs }, 'bff.response.out')`
12. 全程 try/catch → `toErrorResponse(err, requestId)`

> Step 9 用「new Response 重組」而非「response.headers.set」：Web Response 的 Headers 有 guard，某些 runtime（含 Next.js Route Handler）對 `set('cache-control', ...)` 行為不保證一致；建構新 Response 是跨 runtime 安全的做法。`new Response(res.body, ...)` 把 ReadableStream 轉接過去，不 buffer body，未來若有 streaming handler 也不會被卡。`okResponse` / `toErrorResponse` 在源頭就帶 `no-store, private` → step 9 的 short-circuit 直接回原 res；只有「handler 自建 Response 但忘了帶 / 帶錯 Cache-Control」時才走重組分支。

### 2.4 使用範例

```ts
// src/app/api/<resource>/route.ts （通用範本）
import { createRoute, okResponse } from '@/lib/api'
import { backendFetch } from '@/lib/api/backend'
import { FooResponseSchema, FooQuerySchema } from '@/lib/schemas/foo'

export const GET = createRoute({
  querySchema: FooQuerySchema,
  handler: async ({ requestId, query }) => {
    // 公開 endpoint：不傳 session
    const { data } = await backendFetch('/<resource>', { query, requestId })
    return okResponse(FooResponseSchema.parse(data))
  },
})

export const POST = createRoute({
  requireAuth: true,
  bodySchema: CreateFooBodySchema,
  handler: async ({ requestId, body, session }) => {
    // session 由 createRoute 注入；直接透傳給 backendFetch
    const { data } = await backendFetch('/<resource>', {
      method: 'POST', body, session, requestId,
    })
    return okResponse(FooSchema.parse(data))
  },
})
```

---

## 3. 配套 helpers

### 3.1 `responses.ts`

```ts
// src/lib/api/responses.ts
const NO_STORE_HEADERS: HeadersInit = {
  'content-type': 'application/json',
  'cache-control': 'no-store, private',
}

export function okResponse<T>(data: T, meta?: Record<string, unknown>): Response {
  return new Response(
    JSON.stringify(meta ? { data, meta } : { data }),
    { status: 200, headers: NO_STORE_HEADERS },
  )
}
```

> 與 `toErrorResponse`（001a §2.3）同樣用 `new Response(JSON.stringify(...))` 在建構時鎖住 Cache-Control，避開 Web Response Headers guard 的 runtime 不一致。

### 3.2 `parsers.ts`

```ts
// src/lib/api/parsers.ts
import 'server-only'
import type { ZodType } from 'zod'
import { ValidationError } from '@/lib/errors/ValidationError'
import { PayloadTooLargeError } from '@/lib/errors/PayloadTooLargeError'
import { MAX_BODY_BYTES } from './constants'

/** Body 大小雙保險 + 串流 decode + JSON parse + Zod 驗證 */
export async function parseBody<T>(req: Request, schema: ZodType<T>): Promise<T> {
  // Step 1：Content-Length 預檢（攻擊者宣稱大小）
  const len = req.headers.get('content-length')
  if (len && Number(len) > MAX_BODY_BYTES) {
    throw new PayloadTooLargeError(`Body exceeds ${MAX_BODY_BYTES} bytes (content-length)`)
  }
  if (!req.body) {
    const result = schema.safeParse(undefined)
    if (!result.success) throw new ValidationError(formatZod(result.error))
    return result.data
  }
  // Step 2：串流 decode + 邊讀邊計數（防止 chunked transfer 繞過 Content-Length）
  // 用 TextDecoder stream 模式邊累計字串，避免「整個 byte buffer + 再 decode」的雙倍記憶體峰值
  const reader = req.body.getReader()
  const decoder = new TextDecoder('utf-8', { fatal: true })
  let text = ''
  let total = 0
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) {
        text += decoder.decode()   // flush
        break
      }
      total += value.byteLength
      if (total > MAX_BODY_BYTES) {
        await reader.cancel().catch(() => {})
        throw new PayloadTooLargeError(`Body exceeds ${MAX_BODY_BYTES} bytes (streamed)`)
      }
      text += decoder.decode(value, { stream: true })
    }
  } catch (e) {
    if (e instanceof PayloadTooLargeError) throw e
    throw new ValidationError('Body is not valid UTF-8', e)
  }
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

`MAX_BODY_BYTES` 定義在 `src/lib/api/constants.ts`（001a §4）。

### 3.3 `request-id.ts`

```ts
// src/lib/api/request-id.ts
import { randomBytes } from 'node:crypto'

/** 格式：req_<ISO-date>_<8-char-base36-ish>，例：req_2026-06-13_k9x2pqab */
export function newRequestId(): string {
  const date = new Date().toISOString().slice(0, 10)
  const rand = randomBytes(5).toString('base64url').slice(0, 8)
  return `req_${date}_${rand}`
}
```

### 3.4 `index.ts` barrel

```ts
// src/lib/api/index.ts
export { createRoute } from './create-route'
export { okResponse } from './responses'
export { parseBody, parseQuery, parsePathParams } from './parsers'
export { newRequestId } from './request-id'
export { HTTP } from './http-status'
export * from './constants'
```

> 不 re-export `backend` —— 業務 handler 直接從 `@/lib/api/backend` import，避免循環依賴（backend.ts → session service → ... → createRoute）。

---

## 4. 驗證邊界（Zod，沿用 001a 與 001b 規格）

### 4.1 四道驗證

| 邊界 | 對象 | 失敗 → |
|---|---|---|
| 入站：客戶端參數 | `parseBody` / `parseQuery` / `parsePathParams` | `VALIDATION_ERROR (400)` |
| 入站：session 結構 | 解密後的 session（001b cookie.ts 的 Zod parse） | `UNAUTHENTICATED (401)` |
| 入站：CSRF | `X-CSRF-Token` + Origin（001d）| `CSRF_INVALID (403)` |
| 出站：真後端回應 | `await res.json()` 結果（呼叫端 schema.parse） | `CONTRACT_VIOLATION (502)` |

### 4.2 Schema 約定

- 共用：`envelope.ts`、`pagination.ts`（001a §7）
- 個別資源：業務 spec 在 `src/lib/schemas/<resource>.ts` 定義，匯出 `z.infer` 型別
- UI / handler / `backendFetch` 呼叫端共用同一個 schema，禁止平行宣告

---

## 5. 測試清單

### 5.1 順序與成功路徑

| # | 案例 | 期望 |
|---|---|---|
| 1 | Happy path（無 schema、無 auth） | 200 + envelope 結構；Response headers `cache-control: no-store, private` |
| 2 | Step 順序：params → query → auth → csrf → body → handler | 依序失敗回對應錯誤碼 |
| 3 | handler 拋出非 BffError | 回 `INTERNAL_ERROR (500)`；不洩漏 stack 到 envelope |
| 4 | handler 自己設了 `cache-control: max-age=...` | step 9 補上 `no-store`？或保持 handler 設定？→ **強制 no-store**（覆寫） |

### 5.2 驗證階段失敗

| # | 案例 | 期望 |
|---|---|---|
| 5 | `paramsSchema` parse 失敗 | `VALIDATION_ERROR (400)` |
| 6 | `querySchema` parse 失敗 | `VALIDATION_ERROR (400)` |
| 7 | `bodySchema` parse 失敗 | `VALIDATION_ERROR (400)` |
| 8 | Body > 1MB（Content-Length） | `PAYLOAD_TOO_LARGE (413)` |
| 9 | Body > 1MB（chunked stream） | `PAYLOAD_TOO_LARGE (413)` |
| 10 | Body 非 UTF-8 | `VALIDATION_ERROR (400)` |
| 11 | Body 非 JSON | `VALIDATION_ERROR (400)` |
| 12 | Body 缺欄位 | `VALIDATION_ERROR (400)` |

### 5.3 Auth 與 CSRF

| # | 案例 | 期望 |
|---|---|---|
| 13 | `requireAuth: true` + 無 session | `UNAUTHENTICATED (401)` |
| 14 | `requireAuth: false` + 無 session | 通過；`args.session === null` |
| 15 | POST 未帶 X-CSRF-Token | `CSRF_INVALID (403)` |
| 16 | POST Token 錯 | `CSRF_INVALID (403)` |
| 17 | POST Origin 不在白名單 | `CSRF_INVALID (403)` |
| 18 | `csrfExempt: true` POST：不帶 CSRF token | 通過（Origin 仍檢查） |
| 19 | `csrfExempt: true` POST + Origin 不在白名單 | `CSRF_INVALID (403)` |

### 5.4 Cache 與 mutation 旗標

| # | 案例 | 期望 |
|---|---|---|
| 20 | 所有 Response 強制 `Cache-Control: no-store, private` | 即使 handler 自己設了 Cache-Control 也被覆寫 |
| 21 | handler 內未動 session，step 10 呼叫 `touch()` | `store.touch` 被呼叫一次、cookie 重簽 |
| 22 | handler 內呼叫 `update()`，step 10 **不**重複 touch | `touch` 未被呼叫（`wasMutated` 旗標生效） |
| 23 | handler 內呼叫 `refresh()`，step 10 **不**重複 touch | 同上 |
| 24 | handler 內呼叫 `destroy()`，step 10 **不** touch | 同上；cookie 已清，`store.touch` 不該被呼叫 |
| 25 | 無 session（`args.session === null`），step 10 **不** touch | `touch` 未被呼叫 |

### 5.5 Logging

- `bff.request.in` 含 path/method/requestId
- `bff.response.out` 含 status/durationMs/requestId
- 錯誤路徑記 `bff.upstream.error` 或 `bff.internal.error`

---

## 6. 驗收條件

當以下都成立時，本子 spec 視為**已實作**：

- [ ] `src/lib/api/create-route.ts`：§2 程式碼通過 §5.1 ~ §5.5 所有案例
- [ ] `csrfExempt` opt 生效（型別 + runtime）
- [ ] 所有 Response 強制 `Cache-Control: no-store, private`
- [ ] `wasMutated` 旗標避免雙 slide（§5.4 案例 22-24）
- [ ] `src/lib/api/responses.ts`：`okResponse` 主動帶 `Cache-Control: no-store, private`
- [ ] `src/lib/api/parsers.ts`：`parseBody` / `parseQuery` / `parsePathParams` 通過 §5.2 案例（含 streaming 1MB 驗證）
- [ ] `src/lib/api/request-id.ts`：`newRequestId` 產正確格式
- [ ] `src/lib/api/index.ts` barrel re-export 上述四檔（不含 backend）
- [ ] **無業務字眼**（grep 不到 `charity|donation|streamsight[^_-]`）
- [ ] `pnpm lint` + `pnpm test` + `pnpm typecheck` 綠
