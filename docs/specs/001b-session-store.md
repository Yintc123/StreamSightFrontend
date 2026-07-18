# Spec 001b：BFF 基礎建設 — Session Store

- **狀態**：Draft
- **建立日期**：2026-06-13
- **影響範圍**：`src/lib/session/cookie.ts`、`src/lib/session/config.ts`、`src/lib/session/types.ts`、`src/lib/session/store/{types,redis,in-memory,index}.ts`、`tests/contracts/session-store.contract.ts`
- **依賴**：
  - [001a foundations](./001a-foundations.md)（`env`、常數、errors、log）
  - 專案根 ADR 005 v2（iron-session 僅封 sessionId）
  - 專案根 ADR 006（Redis-backed BFF session + provider 抽象）
- **下游**：[001c session-service](./001c-session-service.md) 直接依賴本 spec；[001d ~ 001g] 間接依賴
- **總覽**：見 [001 index](./001-bff-infrastructure.md)

---

## 1. 認證邊界圖

BFF 在兩條認證邊界之間轉譯。Session 真相存於 **Redis（server-side）**；cookie 只攜帶不可預測的 sessionId（ADR 005 v2、ADR 006）。

```
[Browser]
   │
   │  httpOnly session cookie（Set-Cookie: <name>=<sealed { sessionId }>; HttpOnly; Secure; SameSite=Lax）
   ▼
[Next.js BFF on Cloud Run]
   │  1. 解 cookie → sessionId（本 spec §2）
   │  2. SessionStore（Redis）GET session:<sessionId> → StoredSession（本 spec §4）
   ▼
[SessionService（001c）]
```

### 1.1 分層職責

| 角色 | 採用 | 原因 |
|---|---|---|
| Browser ↔ BFF（cookie） | iron-session 封裝 `{ sessionId }` | client 不接觸 JWT；ADR 005 v2 |
| BFF（session 真相） | Redis（SessionStore interface） | Cloud Run 多 instance 共享、可立即作廢、跨 instance refresh 協調；ADR 006 |

> 業務模組（handler、`backendFetch`）只看到 `StoredSession`；cookie / Redis 細節由 `SessionService`（001c）隱藏。

### 1.2 資料分布

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
  csrfToken: string                  // 43 字元 base64url（CSRF token 見 001d §2）
  createdAt: number
}

export type TokenPair = {
  accessToken: string
  accessTokenExpiresAt: number
  refreshToken: string
  refreshTokenExpiresAt: number
}
```

> 不存 `lastSeenAt`：Redis TTL 本身就是 sliding 機制，再存欄位等於每次 read 都要 SET，徒增寫放大且無消費者。需要「最後活動時間」時可由 `TTL` 反算（`now - (originalTTL - currentTTL)`）。

---

## 2. Cookie 層（`src/lib/session/cookie.ts`）

### 2.1 iron-session 設定（`src/lib/session/config.ts`）

```ts
// src/lib/session/config.ts
import type { SessionOptions } from 'iron-session'
import { env } from '@/lib/config'

/**
 * iron-session 8+ 支援 password rotation：給 object 形式（key 為數字 ID，值為 secret）。
 * 解封時嘗試所有 secret，**封裝時用最高 ID 的 secret**。
 * 輪換流程：
 *   1. 加 SESSION_SECRET_PREVIOUS = 舊 secret，SESSION_SECRET = 新 secret，部署
 *   2. 等 SESSION_TTL_SECONDS 過完（所有舊 cookie 自然過期或被新 secret 重簽）
 *   3. 移除 SESSION_SECRET_PREVIOUS
 */
export const sessionOptions: SessionOptions = {
  password: env.SESSION_SECRET_PREVIOUS
    ? { 2: env.SESSION_SECRET!, 1: env.SESSION_SECRET_PREVIOUS }
    : env.SESSION_SECRET!,
  cookieName: env.SESSION_COOKIE_NAME,
  cookieOptions: {
    httpOnly: true,
    secure: env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: env.SESSION_TTL_SECONDS,
    path: '/',
  },
  ttl: env.SESSION_TTL_SECONDS,
}
```

### 2.2 cookie.ts 實作

```ts
// src/lib/session/cookie.ts
import 'server-only'
import { cookies } from 'next/headers'
import { getIronSession } from 'iron-session'
import { z } from 'zod'
import { randomBytes } from 'node:crypto'
import { sessionOptions } from './config'
import { SESSION_ID_BYTES } from '@/lib/api/constants'

const CookiePayload = z.object({ sessionId: z.string().min(40).max(50) })
type CookiePayload = z.infer<typeof CookiePayload>

async function getCookieSession() {
  // Next.js 16: cookies() async；iron-session 解 / 寫都透過此 store
  return getIronSession<CookiePayload>(await cookies(), sessionOptions)
}

export async function readSessionId(): Promise<string | null> {
  const s = await getCookieSession()
  const parsed = CookiePayload.safeParse(s)
  return parsed.success ? parsed.data.sessionId : null
}

export async function writeSessionId(sessionId: string): Promise<void> {
  const s = await getCookieSession()
  s.sessionId = sessionId
  await s.save()                    // 重簽 cookie（maxAge 由 sessionOptions 提供）
}

export async function clearSessionCookie(): Promise<void> {
  const s = await getCookieSession()
  s.destroy()                       // iron-session 內建：清 cookie
}

export function newSessionId(): string {
  return randomBytes(SESSION_ID_BYTES).toString('base64url')   // 43 chars
}
```

> **CookiePayload Zod parse 為什麼還要做**：iron-session 簽章已防 *tamper*，但 **secret rotation 期間**舊 secret 可能解出 schema 不同的舊版 payload（e.g. 加過欄位、改過名稱）。Zod parse 是 schema 演進的安全網，cost 趨近於零。

---

## 3. Sliding TTL 與雙層同步（與 001c 共用契約）

| 層 | 機制 | 觸發位置 |
|---|---|---|
| Cookie | iron-session `cookieOptions.maxAge` + `writeSessionId()` 重簽 | `SessionService.touch()`（001c） |
| Redis | Lua atomic `PEXPIRE`（ms-precision；ADR 006 §5.1.2） | `SessionService.touch()`（001c） |

兩層共用 `SESSION_TTL_SECONDS`。

**`get()` 為純讀**：不 slide 任何 TTL，不寫 cookie、不寫 Redis；RSC 與 Route Handler 皆可安全呼叫。

**`touch()` 同步 slide cookie + Redis**：由 `createRoute`（001f）在 response phase 自動呼叫。

### 3.1 為何 `get()` 不做 sliding

兩個獨立理由：

1. **RSC 限制**：Next.js 16 **Server Component** 中 `cookies()` 為唯讀；`cookies().set(...)` 會拋出 `Cookies can only be modified...`。若 `get()` 偷寫 cookie，所有「在 RSC 內取 session 顯示 user 名」的場景都會炸。
2. **避免雙重 slide**：若 `get()` slide Redis、`touch()` 也 slide Redis，則同一 request 內 createRoute step 4（auth check）與 step 10（response phase）會送兩次 `EXPIRE` 給同一 key——純粹浪費。

**邊界後果**：
- 使用者在 RSC 上瀏覽（如 SSR 列表頁）只觸發 `get()`，**兩層 TTL 都不展延**；cookie 與 Redis 條目同步走向過期
- 使用者下一次任何 Route Handler 互動（搜尋、無限滾動、寫入）→ createRoute step 10 自動 `touch()` → 兩層同步展延
- 純看 RSC 不互動 → 最終雙雙過期 = 重新登入（可接受）

---

## 4. SessionStore interface（權威定義）

```ts
// src/lib/session/store/types.ts
import 'server-only'
import type { StoredSession, TokenPair } from '../types'

export interface SessionStore {
  /** 純讀，不 slide TTL。不存在 → null。 */
  get(sessionId: string): Promise<StoredSession | null>

  /** 覆寫 + 重設 TTL（= `SESSION_TTL_SECONDS`）。新舊都用。 */
  set(sessionId: string, session: StoredSession): Promise<void>

  /** Atomic PEXPIRE（Lua, ms-precision）— 不存在回 false（呼叫端可決定清 cookie）。 */
  touch(sessionId: string): Promise<boolean>

  /** 刪除 entry。不存在也視為成功（冪等）。 */
  destroy(sessionId: string): Promise<void>

  /** 分散式鎖 SET NX EX；成功回 random token 字串、失敗回 null（ADR 006 §6.1）。 */
  acquireLock(key: string, ttlMs: number): Promise<string | null>

  /** Lua 比對 token 後 DEL（嚴禁裸 DEL）；錯 token 視為成功（no-op）。 */
  releaseLock(key: string, token: string): Promise<void>

  /** fresh-tokens cache（refresh 並發去重；ADR 006 §6）。 */
  getCachedTokens(userId: string): Promise<TokenPair | null>
  setCachedTokens(userId: string, tokens: TokenPair, ttlMs: number): Promise<void>

  /** Health check ping；連線健康 → true。 */
  ping(): Promise<boolean>

  /** Graceful shutdown（001g §5）— Redis 走 `quit()` + timeout fallback `disconnect()`；InMemory 為 no-op。 */
  close(): Promise<void>
}
```

> 本 interface 為**權威定義**。若 ADR 006 §5 的 interface 與此不一致，以本 spec 為準（ADR 006 同步更新）。

---

## 5. RedisSessionStore 實作摘要

完整 Redis 連線管理、Lua script、key naming 依 ADR 006 §5、§6。本 spec 條列實作必要點：

- 使用 `ioredis`（v5）
- key naming：
  - session：`${REDIS_KEY_PREFIX}:session:<sessionId>`
  - refresh lock：`${REDIS_KEY_PREFIX}:refresh-lock:<userId>`
  - fresh tokens：`${REDIS_KEY_PREFIX}:fresh-tokens:<userId>`
- `set`：`SET key payload EX SESSION_TTL_SECONDS`
- `touch`：Lua —— `if redis.call('EXISTS', KEYS[1]) == 1 then return redis.call('PEXPIRE', KEYS[1], ARGV[1]) else return 0 end`（ARGV[1] 為 ms，與 §3 的 ms TTL 對齊）
- `acquireLock`：`SET key token NX EX (ttlMs/1000)`；token 用 `randomBytes(16).toString('base64url')`
- `releaseLock`：Lua —— `if redis.call('GET', KEYS[1]) == ARGV[1] then return redis.call('DEL', KEYS[1]) else return 0 end`
- `getCachedTokens` / `setCachedTokens`：`GET` / `SETEX`
- `ping`：`await redis.ping() === 'PONG'`
- `close`：先 `redis.quit()`，4s timeout 後 fallback `redis.disconnect()`
- 連線錯誤：**fail-closed**——錯誤直接 throw `BackendUpstreamError`，呼叫端負責轉成 502。**不**降級為 anonymous（ADR 006 §7）

---

## 6. InMemorySessionStore（測試替身）

純記憶體 `Map` 實作，**完全符合**契約。用於：
- 單元測試
- 開發機沒裝 Redis 時
- 契約測試的對照組

實作要點：
- `lock` 用 `Map<key, { token, expiresAt }>`；`acquireLock` 檢查 `expiresAt < now` 視為釋放
- `setCachedTokens` 用 `Map<userId, { tokens, expiresAt }>`
- `close` 為 no-op

---

## 7. DI（`src/lib/session/store/index.ts`）

### 7.1 Store 選擇（`USE_MOCK` 為總開關）

`USE_MOCK` 是「完全自足模式」的單一開關，**與 backend fetch mock 共用**——`=1` 時不需 Redis、不需真後端：

| 條件 | Store | 場景 |
|---|---|---|
| `USE_MOCK=1` **或** `REDIS_HOST` 未設 | `InMemorySessionStore` | 無真後端環境（重啟即失） |
| `USE_MOCK=0` **且** `REDIS_HOST` 已設 | `RedisSessionStore` | **本地開發 / e2e / CI / staging / production**（ADR 006） |

> 為何用 `USE_MOCK` 而非「只看 `REDIS_HOST`」選 store：store 選擇與「後端資料來源」應保持同一個心智模型（`USE_MOCK=1` = 全部自足）。若改看 `REDIS_HOST`，`.env.example` 內建的 `REDIS_HOST=localhost` 會讓 `USE_MOCK=1` 的新人被迫先開 Redis，破壞零依賴保證。

### 7.2 單例掛在 `globalThis`（**dev 必需**）

```ts
// src/lib/session/store/index.ts
import 'server-only'
import { env } from '@/lib/config'
import type { SessionStore } from './types'
import { InMemorySessionStore } from './in-memory'
import { RedisSessionStore } from './redis'

const g = globalThis as unknown as { __sessionStore?: SessionStore }

export function getSessionStore(): SessionStore {
  if (!g.__sessionStore) {
    g.__sessionStore =
      env.USE_MOCK === '1' || !env.REDIS_HOST
        ? new InMemorySessionStore()
        : new RedisSessionStore()
  }
  return g.__sessionStore
}
```

**為何 `globalThis` 而非 module-level `let`**：`next dev`（Turbopack）把 **Route Handler 與 RSC 編成不同 module graph**。module 級單例會讓每個 graph 各持一份**空的** in-memory `Map`——登入路由（Route Handler）寫入的 session，`/cms` 的 RSC gate（`requireAdminSession`）讀不到 → CMS 被導回登入頁（同一 cookie「打 API 正常、進頁面被踢」為徵狀）。Route Handler 與 RSC 共用同一 process（同一 `globalThis`），故把單例掛 `globalThis` 即可跨 graph 共享（2026-07-18 dev 實測 login → `/cms/admins` 回 200，純 in-memory 無 Redis）。副帶好處：HMR reload 不會重複建立 Redis client。

測試用法（廣域替換）：

```ts
// vitest.setup.ts
import { vi } from 'vitest'
import { InMemorySessionStore } from '@/lib/session/store/in-memory'

vi.mock('@/lib/session/store', () => {
  const mockStore = new InMemorySessionStore()
  return { getSessionStore: () => mockStore }
})
```

> 不再使用 `__`-prefix setter 模式：`vi.mock` 已提供乾淨的型別安全替換途徑，避免「test-only export 混入生產 module」的攻擊面。

---

## 8. SessionStore 契約測試（`tests/contracts/session-store.contract.ts`）

ADR 006 §10.1 規範的契約。同一組案例同時跑 `RedisSessionStore`（對 docker-compose Redis）與 `InMemorySessionStore`：

| 案例 | 期望 |
|---|---|
| `set` → `get` round-trip | `get` 回 `set` 寫入的 `StoredSession` |
| 不存在 sessionId → `get` | `null` |
| `destroy` 後 `get` | `null` |
| `destroy` 不存在 sessionId | 不 throw（冪等） |
| `set` 後 TTL 已重設 | TTL ≈ `SESSION_TTL_SECONDS` |
| `touch` 存在 key | `true` + TTL 重設 |
| `touch` 不存在 key | `false`，不會建 key |
| `acquireLock` 第一次成功 | 回字串 token |
| `acquireLock` 第二次同 key（鎖在） | `null` |
| `acquireLock` 同 key 等鎖 TTL 過完 | 再次可 acquire |
| `releaseLock` 用正確 token | 鎖被釋放；第三次 `acquireLock` 成功 |
| `releaseLock` 用錯 token | no-op（鎖不被釋放） |
| `getCachedTokens` 沒寫過 | `null` |
| `setCachedTokens` → `getCachedTokens` round-trip | 回原 `TokenPair` |
| `setCachedTokens` TTL 過後 | `getCachedTokens` 回 `null`（Redis 自然過期；InMemory 用 expiresAt 比對） |
| `ping` 連線健康 | `true` |
| `close` 後再 `get` | 拋 connection-closed 類錯誤（Redis）/ no-op throw（InMemory 可選） |

執行方式：

```ts
// tests/contracts/session-store.contract.ts
export function runSessionStoreContract(name: string, makeStore: () => Promise<SessionStore>) {
  describe(`SessionStore contract: ${name}`, () => { /* ...cases... */ })
}

// src/lib/session/store/in-memory.test.ts
runSessionStoreContract('in-memory', async () => new InMemorySessionStore())

// src/lib/session/store/redis.test.ts (skip if env REDIS_URL 未設)
runSessionStoreContract('redis', async () => new RedisSessionStore())
```

---

## 9. Cookie 層測試（`cookie.test.ts`）

- `writeSessionId('abc...')` → `readSessionId()` 取回相同字串
- 損壞 / 簽章錯的 cookie → `readSessionId` 回 `null`
- `clearSessionCookie()` 後 `readSessionId()` → `null`
- `newSessionId()` 產 43 字元 base64url、每次不同
- Secret rotation：舊 cookie 可被 `readSessionId` 讀；新 `writeSessionId` 用新 secret 重簽（用 iron-session unseal 驗證）

> Cookie 測試需 Next.js `cookies()` 環境；用 `@/test/helpers` 提供的 fake cookie store 包裝（細節留給實作端使用 Next.js 官方 test helpers 或 `next/dist/server/web/spec-extension/cookies`）。

---

## 10. 驗收條件

當以下都成立時，本子 spec 視為**已實作**：

- [ ] `src/lib/session/types.ts`：`StoredSession`、`TokenPair` type 與 §1.2 對齊
- [ ] `src/lib/session/config.ts`：`sessionOptions` 與 §2.1 對齊；支援 secret rotation（雙 secret object 形式）
- [ ] `src/lib/session/cookie.ts`：§2.2 程式碼通過 §9 案例
- [ ] `src/lib/session/store/types.ts`：interface 與 §4 對齊
- [ ] `src/lib/session/store/redis.ts`：完整 Redis 實作（含 Lua scripts）；fail-closed；含 `close()`
- [ ] `src/lib/session/store/in-memory.ts`：純記憶體實作；契約測試與 Redis impl 同套案例都通過
- [ ] `src/lib/session/store/index.ts`：`getSessionStore()` factory；測試可 `vi.mock` 廣域替換
- [ ] `tests/contracts/session-store.contract.ts`：§8 案例全綠（兩個 impl 都跑）
- [ ] **無業務字眼**（grep 不到 `charity|donation|streamsight[^_-]`）
- [ ] `pnpm lint` + `pnpm test` + `pnpm typecheck` 綠
