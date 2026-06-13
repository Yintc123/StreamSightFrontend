# Spec 001g：BFF 基礎建設 — Routes & Lifecycle

- **狀態**：Draft
- **建立日期**：2026-06-13
- **影響範圍**：`src/app/api/{csrf,health,health/live,dev/login}/route.ts`、`src/lib/lifecycle.ts`、`src/instrumentation.ts`
- **依賴**：
  - [001a foundations](./001a-foundations.md)（`env`、errors、log）
  - [001b session-store](./001b-session-store.md)（`getSessionStore` 用於 health ping & shutdown）
  - [001c session-service](./001c-session-service.md)（`getSessionService` 用於 csrf / dev-login）
  - [001d security-csrf](./001d-security-csrf.md)（CSRF 防護由 createRoute 透傳）
  - [001f createRoute](./001f-create-route.md)（`createRoute` / `okResponse`）
- **下游**：無（本 spec 為 Spec 001 系列最末端）
- **總覽**：見 [001 index](./001-bff-infrastructure.md)

---

## 1. 範圍

- `GET /api/csrf`：客戶端取 CSRF token（§2）
- `GET /api/health`：readiness（含 Redis ping）（§3.1）
- `GET /api/health/live`：liveness（不檢查依賴）（§3.2）
- `POST /api/dev/login`：dev mock session bootstrap（§4）
- `src/lib/lifecycle.ts` + `src/instrumentation.ts`：SIGTERM/SIGINT graceful shutdown（§5）

---

## 2. CSRF token endpoint（`/api/csrf`）

### 2.1 行為

```
GET /api/csrf
```

```jsonc
// 200 OK
{ "data": { "csrfToken": "<base64url-43chars>" } }
// 401 UNAUTHENTICATED （無 session）
{ "error": { "code": "UNAUTHENTICATED", ... } }
```

- 不需 CSRF 檢查（chicken-and-egg；safe method GET 本身就跳過）
- 需 session（無 session 不可能有 token）
- 客戶端在 hydration / mount 呼叫，並在收到 `403 CSRF_INVALID` 時 refetch

**最佳化**：Server Component 在初次 SSR 嵌入：

```tsx
const session = await getSessionService().get()
return <meta name="csrf-token" content={session?.csrfToken ?? ''} />
```

### 2.2 實作

```ts
// src/app/api/csrf/route.ts
import { createRoute, okResponse } from '@/lib/api'
import { UnauthenticatedError } from '@/lib/errors/UnauthenticatedError'

export const GET = createRoute({
  // GET 為 safe method，verifyCsrf 直接通過；不需 csrfExempt
  handler: async ({ session }) => {
    if (!session) throw new UnauthenticatedError('no session')
    return okResponse({ csrfToken: session.csrfToken })
  },
})
```

---

## 3. Health endpoints

### 3.1 Readiness（`GET /api/health`）

含 Redis ping。Load balancer 用此判斷是否導流量到本 instance。

```ts
// src/app/api/health/route.ts
import { createRoute } from '@/lib/api'
import { env } from '@/lib/config'
import { getSessionStore } from '@/lib/session/store'

export const GET = createRoute({
  handler: async () => {
    const redisOk = await getSessionStore().ping().catch(() => false)
    const status = redisOk ? 'ok' : 'degraded'
    const body = {
      data: {
        status,
        uptime: process.uptime(),
        version: env.APP_VERSION,
        commit: env.APP_COMMIT,
        deps: { redis: redisOk ? 'ok' : 'down' },
      },
    }
    // 直接 new Response（不用 okResponse 因為 status code 要動）
    return new Response(JSON.stringify(body), {
      status: redisOk ? 200 : 503,
      headers: { 'content-type': 'application/json', 'cache-control': 'no-store, private' },
    })
  },
})
```

| 情境 | 回應 |
|---|---|
| Redis 正常 | `200 { status: 'ok', uptime, version, commit, deps: { redis: 'ok' } }` |
| Redis 不可用 | **`503 { status: 'degraded', deps: { redis: 'down' } }`**（讓 load balancer 暫時移出流量；Redis 恢復後自動歸隊） |

**不**洩漏 backend URL、secret、stack trace 等內部資訊。

### 3.2 Liveness（`GET /api/health/live`）

不檢查依賴；platform 用此判斷 process 還活著。Redis 暫斷時不可讓容器被殺。

```ts
// src/app/api/health/live/route.ts
import { createRoute, okResponse } from '@/lib/api'

export const GET = createRoute({
  handler: async () => okResponse({ status: 'ok' }),
})
```

---

## 4. Dev mock session bootstrap（`POST /api/dev/login`）

需登入的 endpoint 在 dev 期間沒有 OAuth 流程可走，本節定義「dev 啟動後 5 秒內就能測 auth 路徑」的最小方案。

### 4.1 端點

```
POST /api/dev/login
  body 可選：{ user?: { id, name }, ttlHours?: number }
  回應：{ data: { sessionId, csrfToken, user, expiresAt } }
```

僅當以下**全部**成立時可用：

| 條件 | 防線 |
|---|---|
| `env.NODE_ENV !== 'production'` | 啟動時 route 直接 throw `NotFoundError`，回 404 |
| `env.ENABLE_DEV_LOGIN === '1'` | 額外白名單；prod 容器設定 `'0'` 防誤啟 |

兩道防線**並用**，避免「測試環境 NODE_ENV 設成 production」之類誤設定。

### 4.2 實作

```ts
// src/app/api/dev/login/route.ts
import 'server-only'
import { env } from '@/lib/config'
import { getSessionService } from '@/lib/session/service'
import { NotFoundError } from '@/lib/errors/NotFoundError'
import { okResponse, createRoute } from '@/lib/api'

const DEV_USER = { id: 'dev-user-1', name: 'Dev User' }

export const POST = createRoute({
  csrfExempt: true,                    // chicken-and-egg：首次 login 前 client 沒 csrfToken
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

### 4.3 與 USE_MOCK 的搭配

| 組合 | 結果 | 用途 |
|---|---|---|
| `USE_MOCK=1` + dev login | 完全本機跑；backend 不必啟動，fake token 不會被驗證 | **dev 預設模式** |
| `USE_MOCK=0` + dev login | session 已建但 fake token 打真 backend 會 401 | 不建議；應走真實 OAuth flow |
| `USE_MOCK=0` + 真實登入 flow | 正式流程；本 spec 範圍外（`auth-login.md`）| 整合測試 / production |

### 4.4 CSRF 與 Origin

`/api/dev/login` 為 POST，理論上需 CSRF；但：
- 第一次呼叫時 client 還沒 session、沒 csrfToken（chicken-and-egg）
- Route 定義加 `csrfExempt: true`（見 001d §5、001f §2）即可（與 `/api/csrf` 同處理）
- Origin 檢查**仍照常**（屬白名單，dev 必含 `http://localhost:3000`）

---

## 5. Graceful shutdown

Cloud Run / Docker 停容器時送 `SIGTERM` → 10 秒寬限 → `SIGKILL`。期間 BFF 應該：
1. 停止接收新 request（Next.js 內建處理）
2. 等 in-flight request 完成
3. 主動關 Redis 連線（`ioredis` 的 `redis.quit()`）；超時 fallback `redis.disconnect()`

不做這件事的代價：使用者偶爾看到 connection reset、Redis 端 log 噴 unclean close、Cloud Run cold deploy 期間錯誤率突起。

### 5.1 `src/lib/lifecycle.ts`

Next.js 16 沒有官方 lifecycle hook。利用 Node.js process signal：

```ts
// src/lib/lifecycle.ts
import 'server-only'
import { getSessionStore } from '@/lib/session/store'
import { log } from '@/lib/log'

let shuttingDown = false

function handleSignal(signal: NodeJS.Signals) {
  if (shuttingDown) return
  shuttingDown = true
  log.info({ signal }, 'bff.shutdown.begin')

  // 8s 內優雅關閉，留 2s 給 Cloud Run SIGKILL 餘裕
  const deadline = setTimeout(() => {
    log.warn({}, 'bff.shutdown.force')
    process.exit(0)
  }, 8000).unref()

  ;(async () => {
    try {
      const store = getSessionStore()
      if ('close' in store && typeof store.close === 'function') {
        await store.close()
      }
      log.info({}, 'bff.shutdown.clean')
    } catch (err) {
      log.error({ err: String(err) }, 'bff.shutdown.error')
    } finally {
      clearTimeout(deadline)
      process.exit(0)
    }
  })()
}

let registered = false
export function registerLifecycle(): void {
  if (registered) return
  registered = true
  process.on('SIGTERM', handleSignal)
  process.on('SIGINT', handleSignal)
}
```

### 5.2 `src/instrumentation.ts`

呼叫時機：Next.js 16 instrumentation hook。

```ts
// src/instrumentation.ts
export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const { registerLifecycle } = await import('./lib/lifecycle')
    registerLifecycle()
  }
}
```

### 5.3 SessionStore `close()` method

依 001b §4，`SessionStore` 介面已有 `close()`：

```ts
export interface SessionStore {
  // ...既有
  /** Graceful shutdown：等待 in-flight commands、quit 連線。InMemoryStore 為 no-op。 */
  close(): Promise<void>
}
```

`RedisSessionStore.close()` 內部呼叫 `redis.quit()`；4s timeout 後 fallback `redis.disconnect()`。

---

## 6. 測試清單

### 6.1 `/api/csrf`（GET）

- 無 session → 401 UNAUTHENTICATED
- 有 session → 200 `{ data: { csrfToken: <43-char> } }`
- Response `Cache-Control: no-store, private`

### 6.2 `/api/health`（GET, readiness）

- Redis ping 成功 → 200 `{ data: { status: 'ok', uptime, version, commit, deps: { redis: 'ok' } } }`
- Redis ping 失敗（throw 或 false） → **503** `{ data: { status: 'degraded', deps: { redis: 'down' } } }`
- 不洩漏 backend URL、secret、stack trace
- Response `Cache-Control: no-store, private`

### 6.3 `/api/health/live`（GET, liveness）

- 一律 200 `{ data: { status: 'ok' } }`
- **不**呼叫 `store.ping()`（驗證：mock store ping 拋錯，本 endpoint 仍 200）

### 6.4 `/api/dev/login`（POST）

- `NODE_ENV=production` + `ENABLE_DEV_LOGIN=1` → env 驗證失敗（啟動拒絕，整支 process 起不來；於 001a §9.1 已涵蓋）
- `NODE_ENV=production` + `ENABLE_DEV_LOGIN=0` → 路由回 404
- `NODE_ENV=development` + `ENABLE_DEV_LOGIN=0` → 路由回 404
- `NODE_ENV=development` + `ENABLE_DEV_LOGIN=1` → 200，session 建立成功；回 `{ sessionId, csrfToken, user, expiresAt }`
- 後續對需 auth 的 endpoint 請求帶 cookie → 通過 auth 檢查（整合測試）
- `csrfExempt: true` 生效：POST 不帶 X-CSRF-Token 仍通過
- Origin 不在白名單 → 仍 403（驗證 csrfExempt 不影響 origin 檢查）

### 6.5 Graceful shutdown

- 單測：`store.close()` 後再呼叫 `get()` 應拋 connection-closed 類錯誤
- 單測：`registerLifecycle()` 重複呼叫只註冊一次
- 整合（手動驗證）：本機跑 `pnpm dev` → `kill -TERM <pid>` → 觀察 `bff.shutdown.clean` 出現 + 無 unclean Redis close 警告

---

## 7. 驗收條件

當以下都成立時，本子 spec 視為**已實作**：

- [ ] `src/app/api/csrf/route.ts`：§2.2 程式碼通過 §6.1 案例
- [ ] `src/app/api/health/route.ts`：§3.1 程式碼通過 §6.2 案例（Redis ping、503 degraded）
- [ ] `src/app/api/health/live/route.ts`：§3.2 程式碼通過 §6.3 案例（liveness 不檢查依賴）
- [ ] `src/app/api/dev/login/route.ts`：§4.2 程式碼通過 §6.4 案例；含 `csrfExempt: true`
- [ ] `src/lib/lifecycle.ts`：§5.1 程式碼通過 §6.5 案例
- [ ] `src/instrumentation.ts`：§5.2 程式碼存在；本機跑 `pnpm dev` 啟動時看到 `bff.shutdown.begin` log（kill 後）
- [ ] **無業務字眼**（grep 不到 `charity|donation|jko[^_-]`；前綴 `jko-` / `jko_` 允許）
- [ ] `pnpm lint` + `pnpm test` + `pnpm typecheck` 綠
