# Spec 001c：BFF 基礎建設 — Session Service

- **狀態**：Draft
- **建立日期**：2026-06-13
- **影響範圍**：`src/lib/session/service.ts`、`tests/helpers/session.ts`
- **依賴**：
  - [001a foundations](./001a-foundations.md)（errors、constants、log）
  - [001b session-store](./001b-session-store.md)（cookie 層、SessionStore interface、TokenPair）
  - 專案根 ADR 004（Auth Token Strategy）
  - 專案根 ADR 006（refresh 分散式鎖；§6 演算法）
- **下游**：[001e backendFetch](./001e-backend-fetch.md)、[001f createRoute](./001f-create-route.md)
- **總覽**：見 [001 index](./001-bff-infrastructure.md)

---

## 1. 範圍

組合 cookie 層（001b §2）+ `SessionStore`（001b §4），提供業務語意 API。**所有業務模組（handler、backendFetch）只看到 SessionService，看不到 cookie / Redis 細節**。

包含：
- `SessionService` interface（§2）
- Token 生命週期（§2.4 / §3）
- 並發 refresh 去重（Redis 分散式鎖 + fresh-tokens cache；§3）
- per-request singleton factory（§4）

---

## 2. SessionService 完整 interface

```ts
// src/lib/session/service.ts
import 'server-only'

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
   * 解 cookie → 查 store。**純讀**：不 slide 任何 TTL、不寫 cookie、不寫 Redis。
   * RSC 與 Route Handler 皆可安全呼叫；天然冪等。
   *
   * **不**做模組級 per-request cache。Per-request 去重由呼叫端負責——典型：
   * `createRoute` step 4 取得一次後透過 `args.session` 傳遞，handler 內呼叫
   * `backendFetch({ session })` 透傳，全程一次 Redis round-trip。
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
   * - 同步 slide 兩層 TTL（等同 `touch()` 副作用）
   * @throws UnauthenticatedError - 無 session 可更新
   * @throws BackendUpstreamError - Redis 寫入失敗
   */
  update(patch: SessionUpdatePatch): Promise<void>

  /**
   * 立即作廢：**先清 cookie 再清 store**。冪等（呼叫時無 session 也 no-op）。
   * 順序理由：cookie 清除是 user-facing「已登出」狀態；若先清 store 失敗，會留下
   * 仍指向有效 store 條目的 cookie，意外延長使用者 session 命。
   */
  destroy(): Promise<void>

  /**
   * **同步** slide cookie maxAge + Redis TTL。Cookie 寫入需 Route Handler / Server Action
   * context。由 `createRoute` 在 response phase 自動呼叫（001f §2 step 10）。
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
   * 觸發 backend refresh 流程（§3 完整邏輯）。
   * 內部走分散式鎖 + fresh-tokens cache；多並發呼叫只打 backend 一次。
   * 成功 → 更新 session + 回傳新 StoredSession
   * @throws UnauthenticatedError - refresh 失敗（backend 401 / replay detected）
   * @throws BackendUpstreamError - backend 5xx / timeout / Redis 故障
   */
  refresh(): Promise<StoredSession>

  /**
   * 本 request 是否觸過任何 mutation（create / update / destroy / touch / rotateCsrfToken / refresh）。
   * 由 `createRoute` step 10 讀取——若為 true 則跳過 touch（mutation 路徑已 slide 過 TTL）。
   *
   * 這個旗標**僅在同一 SessionService instance 內維護**，因此 SessionService 必須 per-request
   * singleton——見 §4 `getSessionService()` 的 react.cache 包裝。
   */
  wasMutated(): boolean
}
```

### 2.1 為何 `get()` 不被 react.cache 包

`react.cache` 無 invalidate API。若 `get()` 被 react.cache 包裝，mutation 後同一 request 內再次 `get()` 會回舊值，是高機率 footgun。

正確做法：
- **`get()` 純讀無副作用，不被 cache** —— 同 request 多次呼叫副作用一致
- **`getSessionService()` factory 被 react.cache 包** —— cache 的是同一 instance，instance 內的 `wasMutated` flag 即時反映 mutation

### 2.2 Token 生命週期摘要（ADR 004）

| 項目 | 值 |
|---|---|
| Access token 壽命 | 3 小時 |
| Refresh token 壽命 | 30 天 |
| Refresh rotation | 每次 refresh 都換新 access + refresh；舊 refresh 立即失效 |
| Replay detection | 偵測到舊 refresh 二次使用 → backend 撤銷該 user 全部 refresh，BFF 收到後 `destroy()` |
| Access 緊急撤銷 | backend 用 Redis blacklist（BFF 無需感知，由 backend 401 回應觸發） |

### 2.3 Backend 回 401 的解讀（spec 012a §4.10）

後端**所有 401 共用同一扁平碼 `"unauthorized"`**（token 過期 / 無效 / 停用皆同），無 `AUTH_TOKEN_EXPIRED` 專碼。BFF 無法靠錯誤碼區分「應 refresh 還是應 destroy」，改以「有 session 就試一次 refresh」策略：

| 情形 | BFF 行為 |
|---|---|
| 有 session，refresh 取得**新** access token | refresh + **重打一次**原請求；重打仍 401 → `destroy()` + `UNAUTHENTICATED` |
| 有 session，refresh 為 **no-op**（session 無 refresh token） | **跳過重打**，直接 `destroy()` + `UNAUTHENTICATED` |
| 無 session（公開呼叫 / refresh 自身） | 直接拋 `UnauthenticatedError`，無 refresh 無 destroy |

**no-op 偵測**：`refresh()` 回傳的 `accessToken` 與呼叫前相同 → 代表 session 沒有 refresh token（admin auth 線現況，§OQ-Q7），此時跳過重打省掉一次無效 round-trip。

### 2.4 BFF Refresh 不輪換 CSRF token

CSRF token 綁 session 生命週期，不綁 access token。Refresh 不重產 CSRF token，避免客戶端頻繁 refetch。CSRF token 僅在以下事件下輪換：

| 階段 | 行為 |
|---|---|
| Session 建立（首次登入） | `create()` 自動產生 |
| Refresh access token | **不**輪換 |
| 登入狀態轉換（login / logout / 切換帳號）| **強制輪換**（呼叫 `rotateCsrfToken()`） |
| Session 銷毀 | 隨之失效 |

---

## 3. 並發 Refresh 去重（Cloud Run 跨 instance）

並發請求 A、B、C 同時遇 `AUTH_TOKEN_EXPIRED`，若各自打 `/auth/refresh`，因 rotation 機制只有第一個會成功；其餘被 backend 視為 replay → 全部 session 被撤銷（ADR 004）。

Cloud Run **跨 instance** 下，in-process Promise 去重**無效**（每個 instance 有自己的記憶體）。

**解法：Redis 分散式鎖 + fresh-tokens 短期 cache**（詳細流程與 Lua 釋鎖見 ADR 006 §6）。

```
SessionService.refresh():
  1. store.getCachedTokens(userId)
     └─ HIT → 用 cached pair 更新 session，回傳
  2. lockToken = store.acquireLock('refresh-lock:'+userId, REFRESH_LOCK_TTL_MS)
     ├─ 取得鎖：
     │   - 再次 getCachedTokens（double-check）
     │   - 打 backend /auth/refresh
     │   - 成功 → setCachedTokens(FRESH_TOKENS_TTL_MS) + 更新 session + releaseLock + 回傳
     │   - 401 UNAUTHORIZED → destroy() + 401 + releaseLock
     │   - 5xx / timeout → 不 destroy，回 `BackendUpstreamError (502)` / `BackendTimeoutError (504)` + releaseLock
     └─ 未取得鎖：
         - polling getCachedTokens 每 REFRESH_POLLER_INTERVAL_MS，最長 REFRESH_POLLER_TIMEOUT_MS
         - 命中 → 用該 pair 更新 session、回傳
         - 超時 → `BackendUpstreamError (502)`（001a §2.1 沒有 503，refresh poll 超時統一歸 upstream error）
```

### 3.1 常數對映

| 名 | 預設 | 來源 |
|---|---|---|
| `REFRESH_LOCK_TTL_MS` | 10s | 「backend refresh p99 (~2s) × 5」safety margin |
| `REFRESH_POLLER_TIMEOUT_MS` | 8s | = 鎖 TTL × 0.8；先前 2s 落入 p99 tail 會錯失正常 refresh |
| `REFRESH_POLLER_INTERVAL_MS` | 50ms | 取捨 Redis 負擔 vs 反應時間 |
| `FRESH_TOKENS_TTL_MS` | 60s | 足夠覆蓋等鎖請求 + cold start instance |

所有常數定義在 `src/lib/api/constants.ts`（001a §4）。

### 3.2 安全不變式

- 鎖釋放**必須用 Lua 比對 token 後 DEL**，禁止裸 DEL（會誤殺別人的鎖）
- `refresh()` 禁止被 `create()` / `update()` 內部呼叫（避免遞迴）；只從 `backendFetch` 的過期判斷或 `AUTH_TOKEN_EXPIRED` 401 路徑進入
- `refresh()` 內部呼叫 `backendFetch('/auth/refresh', ...)` 時**不傳 session**（refresh 本身不該帶舊 access token；用 body 裡的 refreshToken 認證）

---

## 4. `getSessionService` factory（per-request singleton）

```ts
// src/lib/session/service.ts (續)
import { cache } from 'react'
import { readSessionId, writeSessionId, clearSessionCookie, newSessionId } from './cookie'
import { getSessionStore } from './store'
import { backendFetch } from '@/lib/api/backend'   // 僅供 refresh 內部使用
import { UnauthenticatedError } from '@/lib/errors/UnauthenticatedError'
import { BackendUpstreamError } from '@/lib/errors/BackendUpstreamError'
import {
  REFRESH_LOCK_TTL_MS, REFRESH_POLLER_TIMEOUT_MS,
  REFRESH_POLLER_INTERVAL_MS, FRESH_TOKENS_TTL_MS,
  CSRF_TOKEN_BYTES,
} from '@/lib/api/constants'
import { randomBytes } from 'node:crypto'

/**
 * Per-request singleton。同一 request 多次呼叫回傳同一 instance（react.cache 保證）。
 * 跨 request **不**共用——因 cookie / Next.js request context 各 request 不同。
 */
export const getSessionService = cache((): SessionService => {
  const store = getSessionStore()
  let mutated = false

  return {
    async get() {
      const sid = await readSessionId()
      if (!sid) return null
      return store.get(sid)            // 純讀，不 slide
    },

    async create(input) {
      const sid = newSessionId()       // 32 bytes → 43-char base64url
      const csrfToken = newCsrfToken() // 32 bytes → 43-char base64url
      const session: StoredSession = {
        userId: input.user.id,
        accessToken: input.tokens.accessToken,
        accessTokenExpiresAt: input.tokens.accessTokenExpiresAt,
        refreshToken: input.tokens.refreshToken,
        refreshTokenExpiresAt: input.tokens.refreshTokenExpiresAt,
        user: input.user,
        csrfToken,
        createdAt: Date.now(),
      }
      // 先 store 再 cookie
      await store.set(sid, session)
      await writeSessionId(sid)
      mutated = true
      return { sessionId: sid, csrfToken }
    },

    async update(patch) {
      const sid = await readSessionId()
      if (!sid) throw new UnauthenticatedError('no session to update')
      const current = await store.get(sid)
      if (!current) throw new UnauthenticatedError('store has no entry')
      // store.set 同步 slide TTL（覆寫即重設 EXPIRE）
      await store.set(sid, { ...current, ...patch })
      mutated = true
    },

    async destroy() {
      const sid = await readSessionId()
      // 先清 cookie 再清 store
      await clearSessionCookie()
      if (sid) await store.destroy(sid).catch(() => {})
      mutated = true
    },

    async touch() {
      const sid = await readSessionId()
      if (!sid) return                  // 無 session → no-op
      const exists = await store.touch(sid)   // atomic EXPIRE (Lua)；不存在 → false
      if (!exists) {
        await clearSessionCookie()      // 殘留 cookie 指向已過期 store → 清掉
        return
      }
      await writeSessionId(sid)         // 重簽 cookie（更新 maxAge）
      mutated = true
    },

    async rotateCsrfToken() {
      const sid = await readSessionId()
      if (!sid) throw new UnauthenticatedError('no session')
      const current = await store.get(sid)
      if (!current) throw new UnauthenticatedError('store has no entry')
      const newToken = newCsrfToken()
      await store.set(sid, { ...current, csrfToken: newToken })
      mutated = true
      return newToken
    },

    async refresh() {
      const sid = await readSessionId()
      if (!sid) throw new UnauthenticatedError('no session to refresh')
      const current = await store.get(sid)
      if (!current) throw new UnauthenticatedError('store has no entry')

      // ── 0. no-op guard（admin auth 線，§OQ-Q7）─────────────────
      // Admin 登入目前不核發 refresh token；直接回傳現有 session 讓
      // backendFetch 偵測 no-op（比對 accessToken 是否相同）並決策。
      if (!current.refreshToken) return current

      // ── 1. fresh-tokens cache（命中即用） ──────────────────────
      const cached = await store.getCachedTokens(current.userId)
      if (cached) {
        const updated = { ...current, ...cached }
        await store.set(sid, updated)
        mutated = true
        return updated
      }

      // ── 2. 嘗試取鎖（ADR 006 §6 完整邏輯） ────────────────────
      const lockKey = `refresh-lock:${current.userId}`
      const lockToken = await store.acquireLock(lockKey, REFRESH_LOCK_TTL_MS)

      if (lockToken) {
        try {
          // 取得鎖後 double-check（避免上一輪 holder 剛寫完 fresh-tokens）
          const recheck = await store.getCachedTokens(current.userId)
          if (recheck) {
            const updated = { ...current, ...recheck }
            await store.set(sid, updated)
            mutated = true
            return updated
          }
          // 打 backend /auth/refresh
          const { data } = await backendFetch<TokenPair>('/auth/refresh', {
            method: 'POST',
            body: { refreshToken: current.refreshToken },
            // anonymous 呼叫：refresh 本身不該帶舊 access token
          })
          await store.setCachedTokens(current.userId, data, FRESH_TOKENS_TTL_MS)
          const updated = { ...current, ...data }
          await store.set(sid, updated)
          mutated = true
          return updated
        } finally {
          // Lua 比對 token 後 DEL（ADR 006 §6.1）
          await store.releaseLock(lockKey, lockToken).catch(() => {})
        }
      }

      // ── 3. 未取得鎖：poll fresh-tokens ───────────────────────
      const deadline = Date.now() + REFRESH_POLLER_TIMEOUT_MS
      while (Date.now() < deadline) {
        await sleep(REFRESH_POLLER_INTERVAL_MS)
        const polled = await store.getCachedTokens(current.userId)
        if (polled) {
          const updated = { ...current, ...polled }
          await store.set(sid, updated)
          mutated = true
          return updated
        }
      }
      throw new BackendUpstreamError('refresh timeout waiting for lock')
    },

    wasMutated() { return mutated },
  }
})

// —— Helpers ——————————————————————————————————————————
function newCsrfToken(): string {
  return randomBytes(CSRF_TOKEN_BYTES).toString('base64url')
}
function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms))
}
```

### 4.1 替身注入

測試時 `vi.mock('@/lib/session/store', ...)` 整模組替換 `getSessionStore()` 回傳 `InMemorySessionStore`，`getSessionService` 自然走替身。**不需** `__setSessionServiceForTest`。

### 4.2 實作不變式

- **`get()` 不被 react.cache 包**；factory 才被 react.cache 包
- **`create` / `destroy` 跨層順序**寫死在偽碼，不靠約定
- **`wasMutated` 是 instance state**，不是 module state — 跨 request 不汙染
- **`touch` 用 `store.touch()` 而非 `store.set()`**：前者 atomic Lua EXPIRE，後者要先 get 再 set 三 round-trip
- **`refresh` 禁止遞迴**：不從 `create` / `update` 內部呼叫
- **`refresh` 內部 `backendFetch` 不傳 session**

---

## 5. 測試清單

### 5.1 整合測試（用 InMemorySessionStore）

#### 5.1.1 `create()`
- 產 sessionId（43-char base64url）+ 寫 store + 寫 cookie + 自動 csrfToken
- 回傳 `{ sessionId, csrfToken }`；後續 `get()` 取回完整 `StoredSession`
- `wasMutated()` 變 true

#### 5.1.2 `get()`
- 無 cookie → null
- 解 cookie 失敗 → null
- store 沒有對應 entry → null
- 完整成功路徑 → 回傳 `StoredSession`
- **不**動 cookie maxAge、**不**動 Redis TTL（純讀驗證）

#### 5.1.3 `update()`
- 無 session → throw `UnauthenticatedError`
- 寫入 patch 後 `get()` 反映新值
- `csrfToken` / `createdAt` / `userId` 未在 patch 中 → 保持不變
- `wasMutated()` 變 true

#### 5.1.4 `destroy()`
- 順序：cookie 清除 → store 清除
- 即使 store 清除失敗，cookie 已清
- 冪等：無 session 時 no-op，不 throw
- `wasMutated()` 變 true

#### 5.1.5 `touch()`
- 無 session → no-op，`wasMutated()` 保持 false
- store entry 過期 → 自動清 cookie
- store 存在 → cookie 重簽 + Redis EXPIRE；`wasMutated()` 變 true

#### 5.1.6 `rotateCsrfToken()`
- 無 session → throw `UnauthenticatedError`
- 回傳新 token；後續 `get()` 反映新 csrfToken；其他欄位不變

#### 5.1.7 `refresh()` — happy path
- **no refresh token**（`session.refreshToken === null`）→ 立即回傳現有 session（no-op）；不打 backend、不改 store（backendFetch 偵測 accessToken 不變 → 決策 destroy）
- cached tokens HIT → 不打 backend、直接用 cached pair 更新 session
- 取得鎖 → 打 backend → 成功 → setCachedTokens + 更新 session + releaseLock
- 取鎖失敗 → poll fresh-tokens 命中 → 更新 session

#### 5.1.8 `refresh()` — failure
- 取鎖失敗 + poll 超時 → throw `BackendUpstreamError`
- backend 401 UNAUTHORIZED → 後續 `get()` → null（destroy 已執行）
- backend 5xx → throw，不 destroy

### 5.2 並發 refresh 測試（**critical**, ADR 006 §10.3）

5 個並發 `refresh()` 呼叫：
- 只有 1 個打 backend `/auth/refresh`（用 mock counter 驗證）
- 其餘 4 個從 `getCachedTokens` 取結果
- 5 個全部成功，回傳同一組 token pair

### 5.3 雙重 slide 防禦

- handler 內呼叫 `update()` 後，`wasMutated()` 回 true
- handler 內呼叫 `refresh()` 後，`wasMutated()` 回 true
- handler 內呼叫 `destroy()` 後，`wasMutated()` 回 true
- 模擬 createRoute 流程：mutation 後 step 10 跳過 `touch()`

---

## 6. 測試輔助

```ts
// tests/helpers/session.ts （整合：cookie + InMemoryStore；單元測試主要用）
export async function withSession(
  req: Request,
  data: Partial<StoredSession>,
): Promise<{ req: Request; sessionId: string; store: InMemorySessionStore }>

// tests/helpers/session-cookie.ts （cookie 層；ADR 005 v2）
export async function withSessionCookie(req: Request, sessionId: string): Promise<Request>
```

`SessionService` 單元測試與 Route Handler 測試**預設用 `InMemorySessionStore`**（不打網路）。`RedisSessionStore` 只在契約測試（001b §8）與 CI 整合測試跑。

---

## 7. 驗收條件

當以下都成立時，本子 spec 視為**已實作**：

- [ ] `src/lib/session/service.ts`：§2 interface 完整實作；§4 偽碼可運作
- [ ] §5.1 所有整合測試通過
- [ ] §5.2 並發 refresh 5-request 測試通過（**critical**）
- [ ] §5.3 雙重 slide 防禦測試通過
- [ ] `get()` 為純讀無副作用（不寫 cookie、不動 Redis TTL）
- [ ] `wasMutated()` 旗標跨所有 mutation 路徑都生效
- [ ] `refresh()` 內部不會遞迴呼叫 `create` / `update`
- [ ] **無業務字眼**（grep 不到 `charity|donation|streamsight[^_-]`）
- [ ] `pnpm lint` + `pnpm test` + `pnpm typecheck` 綠
