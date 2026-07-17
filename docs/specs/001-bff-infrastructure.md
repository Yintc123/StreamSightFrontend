# Spec 001：BFF 基礎建設（Overview / Index）

- **狀態**：Draft
- **建立日期**：2026-06-13
- **拆分日期**：2026-06-13（原 2166 行單檔拆為 1 overview + 7 子 spec）
- **影響範圍**：`frontend/src/app/api/*`、`frontend/src/lib/{api,session,security,schemas,errors,config,mock,log}/*`、`frontend/src/instrumentation.ts`
- **依賴**：
  - 專案根 ADR 002（Backend = Fastify + BFF 分層）
  - 專案根 ADR 004（Auth Token Strategy：access 3h / refresh 30d / Redis-only / rotation + replay detect）
  - 專案根 ADR 005 v2（iron-session 僅封 sessionId）
  - 專案根 ADR 006（Redis-backed BFF session + provider 抽象）
  - `backend/docs/specs/001-environment-config.md` §3.4 JWT 參數
  - `backend/docs/specs/005-error-handling.md`（錯誤碼前綴與 `AUTH_TOKEN_EXPIRED` 信號）

> 本檔為**索引總覽**。完整規格分散在 7 份子 spec（`001a` ~ `001g`）。實作前請依下表逐份閱讀；不要跨 spec 平行實作，**前置依賴未完成不可動下游**。

---

## 1. 目的

定義 Next.js BFF 層的**實作契約**，使任何 Route Handler 實作時不需重新決策橫切議題。

**範圍內（散見子 spec）**
- `src/app/api/*/route.ts` 的**通用模式**與 `createRoute` wrapper
- `src/app/api/csrf/route.ts`、`src/app/api/health/route.ts`、`src/app/api/auth/login/route.ts`（基礎設施端點）
- `src/lib/{api,session,security,schemas,errors,config,mock,log}/*`
- `src/instrumentation.ts` + `src/lib/lifecycle.ts`（graceful shutdown）

**範圍外**
- 任何 resource 的 schema、endpoint、fixture（由業務 spec 定義）
- OAuth 登入 flow、token 簽發（後續 `auth-login.md` / `auth-token-flow.md`）
- UI 元件、客戶端 fetch
- 真後端內部實作
- **任何 cache 層**：所有 Response 一律 `Cache-Control: no-store, private`。要加 cache 須開新 spec（理由見 001a §1.3）

---

## 2. 架構總覽

```
[Browser]
   │
   │  httpOnly session cookie（Set-Cookie: <name>=<sealed { sessionId }>; HttpOnly; Secure; SameSite=Lax）
   │  + X-CSRF-Token header（unsafe method only）
   ▼
[Next.js BFF on Cloud Run]
   │  1. createRoute wrapper：產 requestId、parse query/body、verifyCsrf
   │  2. SessionService.get() → 解 cookie → Redis GET → StoredSession
   │  3. backendFetch({ session, ... })：注入 Authorization、pre-emptive / reactive refresh
   │
   │  Authorization: Bearer <accessToken>
   ▼
[Backend (Fastify)]   ← @fastify/jwt 驗證、stateless
```

### 2.1 認證分層

| 角色 | 採用 | 子 spec |
|---|---|---|
| Browser ↔ BFF（cookie） | iron-session 封裝 `{ sessionId }`（ADR 005 v2） | **001b** |
| BFF（session 真相） | Redis（SessionStore interface）（ADR 006） | **001b** + **001c** |
| BFF ↔ Backend | JWT Bearer（access 3h / refresh 30d） | **001c** + **001e** |
| CSRF | Synchronizer Token + Origin 白名單 | **001d** |

### 2.2 Per-request session 流向（單一 Redis 讀取保證）

```
Browser ──▶ createRoute
              │ step 4: SessionService.get()  ──▶ Redis (1 call)
              │
              ├──▶ args.session ──▶ handler
              │                       │
              │                       └──▶ backendFetch({ session, ... })
              │                                 │ 用傳入 session 取 accessToken；不再 get()
              │                                 ▼
              │                              backend
              │
              └──▶ step 10: touch() ──▶ Redis EXPIRE + cookie write (1 call)
```

**預期：每個 request 最多 2 次 Redis 操作**（get + touch），即使 handler 內呼叫多次 `backendFetch`。

---

## 3. 子 spec 索引

| 子 spec | 模組職責 | 主要交付物 |
|---|---|---|
| [001a foundations](./001a-foundations.md) | env config、錯誤體系、log、常數、HTTP status、共用 schema、mock dispatch | `src/lib/{config,log}.ts`、`src/lib/errors/*`、`src/lib/api/{constants,http-status}.ts`、`src/lib/schemas/{envelope,pagination}.ts`、`src/lib/mock/dispatch.ts` |
| [001b session-store](./001b-session-store.md) | iron-session cookie 封裝、SessionStore interface、Redis / InMemory 兩個 impl、契約測試 | `src/lib/session/cookie.ts`、`src/lib/session/store/{types,redis,in-memory,index}.ts`、`tests/contracts/session-store.contract.ts` |
| [001c session-service](./001c-session-service.md) | SessionService 高階 API、access/refresh token 生命週期、分散式鎖去重 refresh | `src/lib/session/service.ts`、`src/lib/session/types.ts` |
| [001d security-csrf](./001d-security-csrf.md) | CSRF 驗證、Origin 白名單、route-level `csrfExempt` 設計 | `src/lib/security/{verifyCsrf,origin}.ts` |
| [001e backendFetch](./001e-backend-fetch.md) | BFF → backend HTTP wrapper、timeout、401 分流、mock 短路 | `src/lib/api/backend.ts` |
| [001f createRoute](./001f-create-route.md) | Route Handler 高階 wrapper、parsers、okResponse、request-id | `src/lib/api/{create-route,parsers,responses,request-id}.ts` |
| [001g routes-and-lifecycle](./001g-routes-and-lifecycle.md) | `/api/csrf`、`/api/health`、`/api/auth/login`、graceful shutdown | `src/app/api/{csrf,health,health/live,auth/login}/route.ts`、`src/lib/lifecycle.ts`、`src/instrumentation.ts` |

### 3.1 推薦實作順序

```
001a (foundations)
   └── 001b (session-store)
          └── 001d (security-csrf)        ← 與 001c 可並行
          └── 001c (session-service)      ← 與 001d 可並行
                  └── 001e (backendFetch)
                          └── 001f (createRoute)
                                  └── 001g (routes-and-lifecycle)
```

> 不要跳關。001f 假設 001e 已 stable、001e 假設 001c 已 stable、依此類推。

---

## 4. 共通約定（所有子 spec 適用）

### 4.1 `server-only` 邊界

下列目錄與檔案皆 **server-only**，檔頂第一行 `import 'server-only'`：

- `src/lib/api/`
- `src/lib/session/`
- `src/lib/security/`
- `src/lib/config.ts`
- `src/lib/log.ts`
- `src/lib/mock/`
- `src/lib/lifecycle.ts`
- `src/app/api/`

### 4.2 Next.js Request 型別

統一使用 Web 標準 `Request`。需 `cookies()` / `geo` 等 Next.js 特殊欄位時用 `NextRequest`，並在該 handler 註明原因。

### 4.3 命名與測試

- 測試與被測檔案 colocate：`foo.ts` ↔ `foo.test.ts`
- E2E spec 不 colocate，集中 `tests/e2e/<feature>.spec.ts`
- 跨 spec 共用測試助手集中 `tests/helpers/`

### 4.4 共用常數來源

所有時間 / 大小常數**僅在 `src/lib/api/constants.ts` 宣告**（規格於 001a §4）。其他模組 import 使用，**禁止在使用點硬寫**（如 `5000`、`30_000`），避免「§3 寫 30s，但 backend.ts 寫死 25s」這類飄移。

### 4.5 Cache 一律 `no-store`

所有 Response 一律帶 `Cache-Control: no-store, private`。`okResponse`、`toErrorResponse`、`/api/health` 都在源頭主動帶；`createRoute` 在 response phase 補上作為 fallback。理由與未來重啟條件見 **001a §1.3**。

---

## 5. 總體驗收條件

當以下都成立時，Spec 001 視為**已實作**：

### 5.1 子 spec 完成度

- [ ] **001a foundations** 全部驗收條件通過
- [ ] **001b session-store** 全部驗收條件通過（含契約測試兩 impl 同套案例）
- [ ] **001c session-service** 全部驗收條件通過（含並發 refresh 5-request 測試）
- [ ] **001d security-csrf** 全部驗收條件通過
- [ ] **001e backendFetch** 全部驗收條件通過（含 Redis 不可用 → 502 fail-closed）
- [ ] **001f createRoute** 全部驗收條件通過（含 Cache-Control 強制與 `wasMutated` 旗標）
- [ ] **001g routes-and-lifecycle** 全部驗收條件通過（含 readiness 雙模式與 SIGTERM clean shutdown）

### 5.2 基礎設施

- [ ] `frontend/docker-compose.yml` 提供本地 Redis（ADR 006 §9）
- [ ] `.env.example` 同步包含所有變數（含 `REDIS_*`、`SESSION_SECRET_PREVIOUS`）

### 5.3 規格純淨度（無業務字眼自檢）

```bash
grep -rE "charity|donation|streamsight[^_-]" \
  src/lib/{api,session,security,errors,config,mock,log,schemas/{envelope,pagination}} \
  || echo "✓ no business words"
```

`streamsight-` / `streamsight_` 等基建前綴（key prefix、cookie name）允許。

### 5.4 整體 Quality Gates

- [ ] `pnpm lint` 綠
- [ ] `pnpm typecheck` 綠
- [ ] `pnpm test` 綠（含契約測試的 Redis impl 模式，需 docker-compose Redis 起著）
- [ ] 覆蓋率：`src/lib/` ≥ 90% lines、`src/app/api/` ≥ 85% lines

---

## 6. 不在本 spec 解決（後續）

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
| **任何 cache 層**（CDN s-maxage、Next.js Data Cache、revalidateTag） | 評估後**刻意不做**（001a §1.3）；要做時開新 spec 並加 ADR 紀錄決策反轉 |
