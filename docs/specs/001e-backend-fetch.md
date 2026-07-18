# Spec 001e：BFF 基礎建設 — backendFetch

- **狀態**：Draft
- **建立日期**：2026-06-13
- **影響範圍**：`src/lib/api/backend.ts`、`tests/helpers/backend-mock.ts`
- **依賴**：
  - [001a foundations](./001a-foundations.md)（`env`、errors、constants、log、mock dispatch）
  - [001b session-store](./001b-session-store.md)（`StoredSession` type）
  - [001c session-service](./001c-session-service.md)（`getSessionService().refresh()` / `.destroy()`）
- **下游**：[001f createRoute](./001f-create-route.md)、[001g routes-and-lifecycle](./001g-routes-and-lifecycle.md)
- **總覽**：見 [001 index](./001-bff-infrastructure.md)

---

## 1. 行為規範

`src/lib/api/backend.ts` 提供 `backendFetch<T>(path, options)`：

| 行為 | 規則 |
|---|---|
| Base URL | `env.BACKEND_API_URL`；未設定且 `USE_MOCK !== '1'` → 啟動時拒絕（001a §3） |
| Timeout | 預設 `DEFAULT_BACKEND_TIMEOUT_MS`（5000ms）`AbortSignal.timeout`，可 `options.timeoutMs` 覆寫 |
| Retry | **不**自動 retry |
| 認證標頭 | 取 `options.session.accessToken` 注入 `Authorization: Bearer <token>`；`options.session` 由呼叫端（典型為 createRoute）傳入；**backendFetch 不再呼叫 `SessionService.get()`** |
| 公開 endpoint | 不傳 `session`（或傳 `null`）即跳過認證注入；不需要 `anonymous` 旗標 |
| Access token pre-emptive refresh | `session.accessTokenExpiresAt < now + PRE_REFRESH_MARGIN_MS` → 呼叫 `SessionService.refresh()` |
| Backend 401（有 session） | 試一次 `SessionService.refresh()`；若 refresh 為 no-op（回傳 token 未變，無 refresh token）→ `destroy()` + 401；否則重打一次；重打仍 401 → `destroy()` + 401 |
| Backend 401（無 session） | 直接拋 `UnauthenticatedError`，不 refresh 不 destroy |
| 並發 refresh | **Redis 分散式鎖 + fresh-tokens cache**（跨 Cloud Run instance；於 001c §3 與 ADR 006 §6） |
| Request ID | 沿用呼叫端的 requestId（由 createRoute 產生）；若無則 fallback 自產 |
| 連線失敗 / DNS / JSON parse 失敗 | `BACKEND_UPSTREAM_ERROR (502)` |
| Redis 不可用 | `BACKEND_UPSTREAM_ERROR (502)`；**不**降級為 anonymous（fail-closed，ADR 006 §7） |
| Timeout | `BACKEND_TIMEOUT (504)` |
| 回應解析 | `await res.json()`；不做 Zod parse（呼叫端決定 schema） |
| Cache | 不暴露 Next.js fetch data cache 參數；參見 001a §1.3 |

---

## 2. 簽名

```ts
export async function backendFetch<T = unknown>(
  path: string,
  options?: {
    method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'
    body?: unknown
    query?: Record<string, string | number | undefined>
    timeoutMs?: number
    headers?: Record<string, string>
    /**
     * 由呼叫端注入的 session（典型來源：createRoute args.session）。
     * - `undefined` / `null` → 視為公開呼叫：不注入 Authorization、不對 401 reactive refresh
     * - 有值 → 注入 Bearer + 走 pre-emptive / reactive refresh 流程
     *
     * 這個設計取代了先前的 `anonymous: true` 旗標——「沒 session 就是 anonymous」更直觀。
     */
    session?: StoredSession | null
    /**
     * 沿用呼叫端 requestId 以串連 BFF + backend 日誌；省略則自產。
     */
    requestId?: string
  },
): Promise<{ data: T; requestId: string }>
```

> 簽名移除了 `req: Request` 參數：backendFetch 內部本來就沒用到 `req` 的欄位（除了潛在的 `getSessionService().get()`，現已移除）。少傳一個參數，呼叫端更乾淨。

---

## 3. Mock 模式

`USE_MOCK=1` 時不打網路，改用 001a §8 的 mock dispatch。CSRF 仍由 `createRoute`（001f）照常檢查（保持安全模式一致）。

---

## 4. 完整流程（pseudocode）

```ts
// src/lib/api/backend.ts
import 'server-only'
import { env } from '@/lib/config'
import { log } from '@/lib/log'
import { resolveMock } from '@/lib/mock/dispatch'
import { BackendTimeoutError } from '@/lib/errors/BackendTimeoutError'
import { BackendUpstreamError } from '@/lib/errors/BackendUpstreamError'
import { UnauthenticatedError } from '@/lib/errors/UnauthenticatedError'
import { NotFoundError } from '@/lib/errors/NotFoundError'
import { BffError } from '@/lib/errors/BffError'
import { getSessionService } from '@/lib/session/service'
import type { StoredSession } from '@/lib/session/types'
import { DEFAULT_BACKEND_TIMEOUT_MS, PRE_REFRESH_MARGIN_MS } from './constants'
import { newRequestId } from './request-id'
import { randomBytes } from 'node:crypto'

export type BackendFetchOptions = {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'
  body?: unknown
  query?: Record<string, string | number | undefined>
  timeoutMs?: number
  headers?: Record<string, string>
  session?: StoredSession | null
  requestId?: string
}

export async function backendFetch<T>(
  path: string,
  options: BackendFetchOptions = {},
): Promise<{ data: T; requestId: string }> {
  const requestId = options.requestId ?? newRequestId()
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

    // ── 3. 注入 Authorization（session 存在才注入）──────────
    const inputSession = options.session ?? null
    let activeSession: StoredSession | null = inputSession
    if (inputSession) {
      // Pre-emptive refresh
      if (inputSession.accessTokenExpiresAt < Date.now() + PRE_REFRESH_MARGIN_MS) {
        activeSession = await getSessionService().refresh()   // 內部走 001c §3 分散式鎖
      }
      headers['authorization'] = `Bearer ${activeSession!.accessToken}`
    }

    // ── 4. 發 request ────────────────────────────────────────
    const url = buildUrl(env.BACKEND_API_URL!, path, options.query)
    const body = options.body != null ? JSON.stringify(options.body) : undefined
    const timeoutMs = options.timeoutMs ?? DEFAULT_BACKEND_TIMEOUT_MS

    let response: Response
    try {
      response = await fetch(url, {
        method: options.method ?? 'GET',
        headers,
        body,
        signal: AbortSignal.timeout(timeoutMs),
      })
    } catch (err) {
      throw classifyNetworkError(err)   // → BackendTimeoutError / BackendUpstreamError
    }

    // ── 5. Handle backend 401（spec 012a §4.10）────────────────
    // 後端所有 401 共用扁平碼 "unauthorized"，無 AUTH_TOKEN_EXPIRED 專碼。
    // 策略：有 session → 試一次 refresh + 重打；無 session → 直接 throw。
    let retried = false
    if (response.status === 401) {
      const errBody = await safeReadJson(response)
      const backendCode = readBackendCode(errBody)

      if (activeSession) {
        const refreshed = await getSessionService().refresh()
        // no-op 偵測：admin auth 線無 refresh token，refresh() 回傳同一 session。
        // 重打同一個過期 token 必然再次 401，直接 destroy 省掉一次無效 round-trip。
        if (refreshed.accessToken === activeSession.accessToken) {
          await getSessionService().destroy().catch(() => {})
          throw new UnauthenticatedError('access token expired, no refresh token')
        }
        headers['authorization'] = `Bearer ${refreshed.accessToken}`
        try {
          response = await fetch(url, {
            method: options.method ?? 'GET',
            headers,
            body,
            signal: AbortSignal.timeout(timeoutMs),
          })
        } catch (err) {
          throw classifyNetworkError(err)
        }
        retried = true
      } else {
        // 無 session（公開呼叫 / refresh 自身）→ 不 refresh 不 destroy。
        throw new UnauthenticatedError(backendCode ?? 'UNAUTHORIZED')
      }
    }

    // ── 6. 重打後若仍 401 → refresh 有效但帳號已停用/刪除 ────
    if (retried && response.status === 401) {
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

function errorCodeOf(err: unknown): string {
  return err instanceof BffError ? err.code : 'UNKNOWN'
}

// —— Helpers ————————————————————————————————————————

function buildUrl(base: string, path: string, query?: Record<string, string | number | undefined>): string {
  const url = new URL(path, base.endsWith('/') ? base : base + '/')
  if (query) {
    for (const [k, v] of Object.entries(query)) {
      if (v != null) url.searchParams.set(k, String(v))
    }
  }
  return url.toString()
}

function classifyNetworkError(err: unknown): BffError {
  if (err instanceof Error) {
    if (err.name === 'TimeoutError' || err.name === 'AbortError') return new BackendTimeoutError(err.message)
    // ECONNREFUSED / DNS / ECONNRESET / fetch network errors
    if ((err as { code?: string }).code === 'ECONNREFUSED' || (err as { code?: string }).code === 'ENOTFOUND') {
      return new BackendUpstreamError(err.message)
    }
  }
  return new BackendUpstreamError('Network error')
}

async function safeReadJson(res: Response): Promise<{ error?: { code?: string } } | null> {
  try { return await res.clone().json() } catch { return null }
}
```

---

## 5. 流程關鍵不變式

1. **同一請求最多打 backend 兩次**：原打 + 一次 refresh 後重打；若 refresh 為 no-op 則只打一次
2. **有 session 的任何 401 都觸發 refresh 嘗試**（spec 012a §4.10）：後端無 `AUTH_TOKEN_EXPIRED` 專碼，無法靠碼區分過期 vs 失效
3. **no-op refresh 偵測**：`refresh()` 回傳 accessToken 未變 → session 無 refresh token → 跳過重打，直接 destroy
4. **Refresh 過 1 次後不再 pre-emptive refresh**：避免極端時序下無限循環
5. **`options.session` 缺省 / null 跳過所有 session 邏輯**：不注入 Authorization、不對 401 reactive refresh
6. **Mock 模式跳過 session 邏輯**：但**不**跳過 createRoute 的 CSRF 檢查（001f §2 step 6）

---

## 6. 與 SessionService 的整合（per-request 去重）

- `backendFetch` 不再呼叫 `SessionService.get()`——session 由 createRoute step 4 取得後透過 `args.session` 傳入。整個 request 對 Redis 的 session 讀取**保證恰好 1 次**，由型別系統強制（backendFetch 簽名沒有任何能拿到 store handle 的途徑）
- `SessionService.refresh()` 內部用 Redis 分散式鎖（ADR 006 §6），即使並發呼叫**只打一次 backend `/auth/refresh`**
- Refresh 後 `backendFetch` 內部變數 `activeSession` 已更新；若呼叫端需要看見更新後的 session，可用 `getSessionService().get()` 再讀一次（極少需要）

---

## 7. 測試清單

### 7.1 行為案例

| # | 案例 | 期望 |
|---|---|---|
| 1 | Happy path（200 + JSON） | `{ data, requestId }` 正確；`Authorization: Bearer ...` 被注入 |
| 2 | 無 session（公開呼叫） | 不注入 `Authorization`；200 正常解析 |
| 3 | Timeout（`AbortSignal.timeout` 觸發） | `BackendTimeoutError` (504) |
| 4 | Backend 5xx | `BackendUpstreamError` (502) |
| 5 | Backend 404 | `NotFoundError` (404) |
| 6 | Backend 4xx 非 404 / 401 | `BackendUpstreamError` (502) |
| 7 | 連線失敗 ECONNREFUSED | `BackendUpstreamError` |
| 8 | DNS 失敗 ENOTFOUND | `BackendUpstreamError` |
| 9 | 回應非 JSON | `BackendUpstreamError('not valid JSON')` |
| 10 | Pre-emptive refresh（剩餘 < 30s） | refresh 被呼叫一次；headers 用新 token；backend 也用新 token 收 |
| 11 | Backend 401 + session（refresh 取得新 token） | refresh 一次 → 重打 → 成功回 data |
| 12 | Backend 401 + session（no-op refresh，無 refresh token） | 不重打；`destroy()` 被呼叫；拋 `UnauthenticatedError` |
| 13 | Backend 401 + session（refresh 取得新 token，但重打仍 401） | `destroy()` 被呼叫；拋 `UnauthenticatedError` |
| 14 | Backend 401 無 session（公開呼叫） | 不 refresh 不 destroy；拋 `UnauthenticatedError` |
| 15 | `USE_MOCK=1` + 已註冊 path | 直接回 fixture，**不**打網路 |
| 16 | `USE_MOCK=1` + 未註冊 path | `BackendUpstreamError('No mock registered')` |
| 17 | Redis 不可用（refresh 時 store 拋錯） | `BackendUpstreamError` (502)；**不**降級為 anonymous |
| 18 | requestId 沿用呼叫端傳入值 | 回傳值 `requestId === options.requestId` |
| 19 | 未傳 requestId | 自產 `req_<date>_<8-char-base36>` 格式 |

### 7.2 測試輔助

```ts
// tests/helpers/backend-mock.ts （設定 MSW handler 的薄包裝）
import { http, HttpResponse } from 'msw'
import { server } from '@/test/mocks/server'

export function mockBackend(method: 'get'|'post'|'put'|'patch'|'delete', path: string, handler: (req: Request) => Response | Promise<Response>) {
  server.use(http[method](path, async ({ request }) => handler(request)))
}
```

---

## 8. 驗收條件

當以下都成立時，本子 spec 視為**已實作**：

- [ ] `src/lib/api/backend.ts`：§4 程式碼通過 §7.1 所有案例
- [ ] 簽名為 `(path, options)`、**不再呼叫** `SessionService.get()`、`options.session` 透傳
- [ ] Redis 不可用 → 502 fail-closed（**不**降級為 anonymous）
- [ ] Mock 模式跳過 session 邏輯但不跳過 createRoute CSRF（驗證在 001f 測試）
- [ ] `tests/helpers/backend-mock.ts` 可用
- [ ] **無業務字眼**（grep 不到 `charity|donation|streamsight[^_-]`）
- [ ] `pnpm lint` + `pnpm test` + `pnpm typecheck` 綠
