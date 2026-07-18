# Spec 015：Streamlit Auth Bridge

- **狀態**：Draft（v0.3 — 2026-07-18）
- **影響範圍**：
  - `src/app/api/auth/session/route.ts`（新增）
  - `src/app/api/auth/logout/route.ts`（新增）
  - `src/lib/session/config.ts`（補 `domain` 欄位）
  - `src/lib/api/constants.ts`（補 `STREAMLIT_PRE_REFRESH_THRESHOLD_MS`）
  - `.env.example`、`src/lib/config.ts`（補 `SESSION_COOKIE_DOMAIN`）
- **依賴**：
  - [001b session-store](./001b-session-store.md)（`StoredSession`、`SessionStore`）
  - [001c session-service](./001c-session-service.md)（`SessionService.get/refresh/destroy`）
  - [001d security-csrf](./001d-security-csrf.md)（`verifyCsrf`、`ALLOWED_ORIGINS`）
  - [001f createRoute](./001f-create-route.md)（`createRoute`、`okResponse`）
  - Streamlit 端規格：`StreamSightStreamlit/docs/specs/auth-flow.md`（需求來源）
- **下游（Streamlit）**：`lib/auth.py`（`introspect_session`）、`lib/api_client.py`（logout）

---

## 0. 背景與目的

StreamSight 有兩個前端：
- **主前端（Next.js）**：登入、CMS 後台
- **Streamlit 儀表板**：資料管理、即時監控、分析

設計目標是讓使用者在主前端登入後，進 Streamlit **免再次登入**（SSO）。兩個 app 共用同一顆 BFF session cookie（iron-session sealed `{ sessionId }`，Domain=`.<父網域>`）。

**Streamlit 的問題**：它是 Python server，對 BFF 的請求是 server-to-server（不經瀏覽器）。它拿不到 `SESSION_SECRET`，無法自行解封 cookie；後端 FastAPI 的 `/auth/me` 吃 Bearer JWT，Streamlit 也無法直接取得。

**解法（Design B，已定案於 StreamSightStreamlit ADR 0003）**：BFF 新增一個 **introspection 端點**，讓 Streamlit 把瀏覽器送來的加密 cookie **原樣轉發**，BFF 解封、查 Redis、回傳身分 + 短命 access token。Streamlit 拿到 token 後帶 Bearer 直連 FastAPI。

> ✅ **設計取捨（已定案 2026-07-18）**：`GET /api/auth/session` 是 BFF **首次**把 `accessToken`（FastAPI Bearer JWT）交給外部 client，打破原有「JWT 不出 BFF、只在 Redis + BFF↔FastAPI 之間」的不變式。
>
> **不變式的核心**已重新定義為：**JWT 不進瀏覽器**（而非「JWT 不出 BFF」）。
>
> token 只交給 **Streamlit server 端記憶體**（`st.session_state`，per-session，不落檔、不 log、不渲染到前端），瀏覽器全程看不到。爆炸半徑：單一使用者、短命（access TTL ≤ 3h）、可撤銷。詳細取捨分析見 Streamlit ADR 0003。
>
> **實作紀律**（強制）：
> - `accessToken` 只存 `session_state["access_token"]`，**禁止** `st.write`、URL 參數、元件 prop 渲染到 HTML
> - `api_client.py` 送出 Bearer 的請求由 **Streamlit server 端發出**，不經瀏覽器 fetch/XHR
> - log 只記 `requestId/method/path/status`，**絕不記** `accessToken` 或 `csrfToken`

---

## 1. 硬性前提（實作前必須確認）

### 1.1 Cookie Domain

主前端 iron-session cookie 目前 **無 `Domain` 屬性**（host-only）；瀏覽器只把它送到 `Next.js` 的 host。Streamlit 要收到此 cookie，必須讓瀏覽器也把它送到 Streamlit 的 host：

| 情境 | 需要什麼 |
|---|---|
| 本機開發（`localhost:3000` ↔ `localhost:8501`） | **不需 Domain**（同 host，port 不影響 cookie 共享） |
| Staging / Production（不同子網域） | `SESSION_COOKIE_DOMAIN=.example.com`（dot 開頭） |

**本 spec 新增 env**：
```
SESSION_COOKIE_DOMAIN=          # 空值 = 不設 domain（本機預設）
                                # .example.com = 子網域共享
```

**`src/lib/config.ts`（env schema 所在檔）新增欄位**：
```ts
SESSION_COOKIE_DOMAIN: z.string().optional(),
// dot 開頭驗證交由 staging/prod config review
```

> `src/lib/config.ts` 的 `cleanedEnv` 已把空字串轉換為 `undefined`（`v === '' ? undefined : v`），所以 `SESSION_COOKIE_DOMAIN=`（空值）會自然被 `.optional()` 解析為 `undefined`，不需額外處理。

**`src/lib/session/config.ts` 的 `cookieOptions` 補**：
```ts
...(env.SESSION_COOKIE_DOMAIN ? { domain: env.SESSION_COOKIE_DOMAIN } : {}),
```

### 1.2 ALLOWED_ORIGINS

Streamlit 呼叫 `POST /api/auth/logout` 時必須帶 `Origin` header（httpx 預設不帶；Streamlit api_client 必須主動設定），且 origin 必須在 `ALLOWED_ORIGINS` 白名單中。

**BFF 無需新增 env var**：直接把 Streamlit URL 加入已有的 `ALLOWED_ORIGINS` 字串（逗號分隔）：
```
# .env.local（開發）
ALLOWED_ORIGINS=http://localhost:3000,http://localhost:8501

# staging/prod
ALLOWED_ORIGINS=https://app.example.com,https://dash.example.com
```

> `STREAMLIT_BASE_URL` 不是 BFF 的 env var，BFF code 不消費它。Streamlit 端（`lib/config.py`）自行設定。

### 1.3 `STREAMLIT_PRE_REFRESH_THRESHOLD_MS`

新增至 `src/lib/api/constants.ts`：

```ts
// 015 §2.2 — proactively refresh before returning to Streamlit if token
// expires within this window. 60s gives enough runway for Streamlit's
// next request even under worst-case latency. Different from
// PRE_REFRESH_MARGIN_MS (30s), which is used on the backendFetch path.
export const STREAMLIT_PRE_REFRESH_THRESHOLD_MS = 60_000
```

---

## 2. `GET /api/auth/session`（Session Introspection）

### 2.1 概覽

| 項目 | 內容 |
|---|---|
| 路徑 | `GET /api/auth/session` |
| 檔案 | `src/app/api/auth/session/route.ts` |
| CSRF | 豁免（safe method；GET 直接通過 `verifyCsrf`） |
| 認證 | **需要有效 session**（無 session → 401） |
| Cache-Control | `no-store, private`（token 嚴禁快取） |
| 呼叫者 | Streamlit `lib/auth.py`（forwarding browser cookie） |

### 2.2 行為

```
1. createRoute(requireAuth: true) 內部取 session
   ├─ null → 401 UNAUTHENTICATED（createRoute 自動）
   └─ StoredSession（透過 args.session 傳入 handler）：
       2. accessTokenExpiresAt - now < STREAMLIT_PRE_REFRESH_THRESHOLD_MS?
          ├─ YES → sessionService.refresh()（分散式鎖；取最新 tokens）
          │         UnauthenticatedError → 401（session 已失效）
          │         BackendUpstreamError → 502（後端暫時不可用）
          └─ NO  → 用現有 tokens（args.session 即為最新）
       3. 回 200 { data: { user, role, adminRole?, accessToken, expiresAt, csrfToken } }
```

> `createRoute` 在步驟 1 已呼叫 `getSessionService().get()`，handler 透過 `args.session` 直接取用——不在 handler 內重複呼叫 `svc.get()`，避免兩次 Redis lookup。

**關鍵原則**：
- Streamlit **不解析 cookie**，只把瀏覽器送來的 `Cookie` header 原樣帶進請求。Next.js 的 `cookies()` 從 request headers 讀取，流程透明。
- 判斷「已登入」以 **session.get() 非 null** 為準，不靠 cookie 是否存在（cookie 值可被偽造）。
- `accessToken` 只回給 Streamlit server，**不進瀏覽器**（Streamlit 存於 `session_state`）。

### 2.3 回應契約

**200 OK**：
```json
{
  "data": {
    "user":        { "id": "u_123", "name": "alice" },
    "role":        1,
    "adminRole":   "super_admin",
    "accessToken": "<FastAPI Bearer JWT>",
    "expiresAt":   1699999999000,
    "csrfToken":   "<43-char base64url>"
  }
}
```

> `adminRole` 僅在 admin session（`role === 1`）時出現；user session 回應中不含此欄位。

| 欄位 | 來源 | 說明 |
|---|---|---|
| `user.id` | `StoredSession.user.id` | principal_id（JWT `sub`） |
| `user.name` | `StoredSession.user.name` | 顯示名稱 |
| `role` | `StoredSession.role` | `0=USER / 1=ADMIN`（Streamlit 映射為 `"user"/"admin"`） |
| `adminRole` | `StoredSession.adminRole`（optional） | `"super_admin"/"editor"/"viewer"`；僅 admin session 有效；Streamlit 用於 SUPER_ADMIN gate |
| `accessToken` | `StoredSession.accessToken`（refresh 後為新值） | FastAPI Bearer JWT |
| `expiresAt` | `StoredSession.accessTokenExpiresAt` | epoch ms |
| `csrfToken` | `StoredSession.csrfToken` | 供 Streamlit 發 logout 時帶 `X-CSRF-Token` |

**401 UNAUTHENTICATED**：
```json
{ "error": { "code": "UNAUTHENTICATED", "message": "..." } }
```
觸發條件：無 cookie、cookie 解封失敗、Redis 無 session、refresh 失敗。

> `csrfToken` 列入回應的原因：解決 Streamlit logout 的「雞與蛋」問題——Streamlit 不需額外再呼叫 `GET /api/csrf`（兩 cookie 轉發呼叫→一次）。`csrfToken` 不輪換於 refresh（[001c §2.4](./001c-session-service.md)），introspection 多次呼叫回傳同一 csrfToken 直到 session 銷毀。

### 2.4 實作骨架

```ts
// src/app/api/auth/session/route.ts
import 'server-only'
import { createRoute, okResponse } from '@/lib/api'
import { STREAMLIT_PRE_REFRESH_THRESHOLD_MS } from '@/lib/api/constants'
import { getSessionService } from '@/lib/session/service'
import type { StoredSession } from '@/lib/session/types'

export const GET = createRoute({
  requireAuth: true,  // null session → 401 UNAUTHENTICATED (handled by createRoute)
  // GET = safe method; verifyCsrf passes through without any CSRF check.
  // okResponse sets Cache-Control: no-store, private; createRoute's applyNoStore
  // is a secondary safety net (short-circuits when header is already set).
  handler: async ({ session }) => {
    // session is StoredSession (non-null; requireAuth: true guarantees this via
    // TypeScript conditional type TAuth extends true ? StoredSession : StoredSession | null)
    const svc = getSessionService()
    let resolved: StoredSession = session

    // Proactive refresh: ensure Streamlit gets a token with sufficient TTL.
    // Let errors propagate — createRoute's catch maps them to HTTP responses:
    //   UnauthenticatedError  → 401 UNAUTHENTICATED
    //   BackendUpstreamError  → 502 BACKEND_UPSTREAM_ERROR
    // refresh() sets wasMutated()=true, so createRoute's step-10 touch() is skipped.
    if (session.accessTokenExpiresAt - Date.now() < STREAMLIT_PRE_REFRESH_THRESHOLD_MS) {
      resolved = await svc.refresh()
    }

    return okResponse({
      user:        resolved.user,
      role:        resolved.role,
      ...(resolved.adminRole ? { adminRole: resolved.adminRole } : {}),
      accessToken: resolved.accessToken,
      expiresAt:   resolved.accessTokenExpiresAt,
      csrfToken:   resolved.csrfToken,
    })
  },
})
```

---

## 3. `POST /api/auth/logout`

### 3.1 概覽

| 項目 | 內容 |
|---|---|
| 路徑 | `POST /api/auth/logout` |
| 檔案 | `src/app/api/auth/logout/route.ts` |
| CSRF | **必須驗證**（unsafe method）：Origin ∈ ALLOWED_ORIGINS + `X-CSRF-Token` |
| 認證 | **需要有效 session**（無 session → verifyCsrf 因無 csrfToken 可比對而 403） |
| 成功回應 | `204 No Content` |
| 呼叫者 | Streamlit `lib/auth.py`（logout 時呼叫；需帶 `Origin` + `X-CSRF-Token`） |

### 3.2 行為

```
1. createRoute 執行 verifyCsrf：
   - Origin 檢查（必須 ∈ ALLOWED_ORIGINS）→ 403 CSRF_INVALID
   - 取 session（null → 403 CSRF_INVALID，因無 csrfToken 可比對）
   - 比對 X-CSRF-Token vs session.csrfToken（不符 → 403 CSRF_INVALID）
2. sessionService.destroy()
   - 先清 cookie Set-Cookie（BFF response header）
   - 再清 Redis entry（destroy 冪等，失敗 catch 靜默）
3. 回 204 No Content
```

### 3.3 關於 Cookie 清除的限制

`sessionService.destroy()` 送回 `Set-Cookie: <name>=; Max-Age=0` 在 BFF 的 HTTP response 中。由於請求鏈為：

```
瀏覽器 → Streamlit server → BFF
```

BFF 的 `Set-Cookie` 回傳給 **Streamlit 的 api_client**（Python httpx），**不直接到瀏覽器**。因此：

- **Redis session 已失效**（核心效果）：後續任何 cookie 帶到 BFF 的請求，Redis lookup 為 null → 401 → 兩個 app 都無法使用現有 session
- **瀏覽器 cookie 本身未被清除**：Streamlit 需另行將瀏覽器導向主前端登入頁或專用 logout 路由，讓瀏覽器端 cookie 自然過期（TTL 內）或由主前端清除

> **Streamlit 的配合**（本 spec 記錄，不在此實作）：
> 1. 呼叫 `POST /api/auth/logout` → 收 204
> 2. 清除 `st.session_state`（token、user、csrfToken、introspection 快取）
> 3. 以 JS 導向（`st.components.v1.html`）把瀏覽器整頁導到主前端登入頁，讓主前端有機會清 cookie（可選，不影響安全性，因 Redis 已失效）

### 3.4 Streamlit 呼叫者必須

- `Origin: http://localhost:8501`（或 Streamlit 部署 URL），且此 origin ∈ `ALLOWED_ORIGINS`
- `X-CSRF-Token: <csrfToken>`（從 `GET /api/auth/session` 取得，存 `session_state`）
- `Cookie: <forwarded browser session cookie>`

### 3.5 實作骨架

```ts
// src/app/api/auth/logout/route.ts
import 'server-only'
import { createRoute } from '@/lib/api'
import { getSessionService } from '@/lib/session/service'

export const POST = createRoute({
  // requireAuth not needed: verifyCsrf already ensures session exists
  // (null session → CsrfError "No session for CSRF verification")
  handler: async () => {
    await getSessionService().destroy()
    return new Response(null, { status: 204 })
  },
})
```

---

## 4. 安全分析

| 威脅 | 對策 |
|---|---|
| CSRF（跨站偽造 logout） | `X-CSRF-Token` 比對 + Origin 白名單 |
| 偽造 cookie（竄改 sessionId） | iron-session 加密簽章由 BFF 驗證，Streamlit 不解析 |
| `accessToken` 暴露在傳輸 | HTTPS（staging/prod 強制）；本機 localhost 為可接受例外 |
| `accessToken` 被快取 | `Cache-Control: no-store, private` |
| `accessToken` 被記錄 | `log.info` 只記 `{ requestId, path, method, status }`；**絕不記 `accessToken` / `csrfToken`** |
| `accessToken` 暴露到瀏覽器（**底線，不可妥協**） | Streamlit 存 `session_state`（server 端記憶體）；api_client 由 server 端發出；Bearer 不經瀏覽器 cookie jar；**禁止**以 `st.write`/URL/元件渲染；log 遮蔽（見 §0） |
| session cookie 被非 Streamlit client 呼叫 introspection | 無法防止（只要有 cookie 就能換 token）；可加 referer/user-agent 軟性檢查但非強制；接受此為 Design B 的取捨 |

---

## 5. TDD 測試計畫

> 依 CLAUDE.md 嚴格 TDD：每個行為先寫失敗測試，再補最小實作。

**測試工具**：Vitest。session service 以 `vi.mock('@/lib/session/service', ...)` 直接控制（與現有 login `route.test.ts` 模式一致）；無需 InMemorySessionStore helper。

**Mock 骨架**（兩支 route.test.ts 共用）：
```ts
vi.mock('@/lib/config', () => ({
  env: {
    NODE_ENV: 'test',
    USE_MOCK: '0',
    BACKEND_API_URL: 'http://backend.test',
    SESSION_SECRET: 'test-session-secret-must-be-32-chars-long',
    SESSION_COOKIE_NAME: 'streamsight_session',
    SESSION_TTL_SECONDS: 2_592_000,
    // §5.2 logout 測試需含 Streamlit origin（Origin 白名單）
    ALLOWED_ORIGINS: 'http://localhost:3000,http://localhost:8501',
    REDIS_KEY_PREFIX: 'streamsight-bff-test',
    APP_VERSION: '0.0.0-test',
    NEXT_PUBLIC_APP_NAME: 'StreamSight',
  },
}))

const getMock    = vi.fn()
const refreshMock = vi.fn()
const destroyMock = vi.fn()

vi.mock('@/lib/session/service', () => ({
  getSessionService: () => ({
    get:        getMock,
    refresh:    refreshMock,
    destroy:    destroyMock,
    touch:      vi.fn().mockResolvedValue(undefined),
    wasMutated: vi.fn().mockReturnValue(false),
  }),
}))
```

### 5.1 `GET /api/auth/session`（`route.test.ts`）

```
1. 無 session（getMock → null）
   → 401 { error: { code: 'UNAUTHENTICATED' } }

2. 有效 session + token 未近期過期（expiresAt = now + 120_000）
   → 200 { data: { user, role, accessToken, expiresAt, csrfToken } }
   → 欄位值與 storedSession 對應正確（含 adminRole 若存在）
   → refreshMock 未被呼叫

3. token 近期過期（expiresAt = now + 30_000 < 60_000）
   → refreshMock 被呼叫一次
   → 200 回傳 refreshMock 的新 accessToken + expiresAt
   → csrfToken 不變（refresh 不輪換）

4a. token 近期過期但 refreshMock 拋 UnauthenticatedError
    → 401 { error: { code: 'UNAUTHENTICATED' } }

4b. token 近期過期但 refreshMock 拋 BackendUpstreamError
    → 502 { error: { code: 'BACKEND_UPSTREAM_ERROR' } }

5. 回應 headers 含 Cache-Control: no-store, private

6. accessToken 不出現在任何 log 輸出（vi.spyOn(log, 'info')）
```

> 注意：`BackendUpstreamError` 的 code 為 `'BACKEND_UPSTREAM_ERROR'`（`src/lib/errors/BackendUpstreamError.ts:4`），不是 `BACKEND_UPSTREAM`。

### 5.2 `POST /api/auth/logout`（`route.test.ts`）

> **前提**：mock config 中 `ALLOWED_ORIGINS` 必須含 `http://localhost:8501`（§5 mock 骨架已包含）。

```
7. 有效 session + Origin: http://localhost:8501 + 正確 X-CSRF-Token
   → destroyMock 被呼叫一次
   → 204 No Content

8. 缺 Origin header（或 Origin 不在 ALLOWED_ORIGINS，如 http://evil.com）
   → 403 { error: { code: 'CSRF_INVALID' } }

9. Origin 正確但 X-CSRF-Token 不符（或缺失）
   → 403 { error: { code: 'CSRF_INVALID' } }

10. 無 session（getMock → null）
    → verifyCsrf 因 session=null 而 403 { error: { code: 'CSRF_INVALID' } }

11. destroyMock 成功後，再呼叫 getMock → null
    → （驗證 session 確實銷毀；可用 vi.fn().mockResolvedValueOnce 模擬）
```

### 5.3 Config 層測試

```
12. SESSION_COOKIE_DOMAIN 未設 → cookieOptions 無 domain 欄位
13. SESSION_COOKIE_DOMAIN='.example.com' → cookieOptions.domain === '.example.com'
```

---

## 6. 實作順序（TDD 里程碑）

> 遵守 CLAUDE.md：先寫失敗測試，再寫最小實作，跑測試確認綠燈後繼續。

1. **constants.ts**：加 `STREAMLIT_PRE_REFRESH_THRESHOLD_MS = 60_000`（§1.3）
2. **`src/lib/config.ts`**：新增 `SESSION_COOKIE_DOMAIN: z.string().optional()`（§1.1）
3. **session/config.ts**：`cookieOptions` 補 domain 展開（§1.1）
4. **`.env.example`**：補 `SESSION_COOKIE_DOMAIN=`（空值說明）；更新 `ALLOWED_ORIGINS` 說明含 Streamlit URL（§1.2）
5. **`GET /api/auth/session`**：先寫 §5.1 測試 1–6（紅），再補 route 實作（綠）
6. **`POST /api/auth/logout`**：先寫 §5.2 測試 7–11（紅），再補 route 實作（綠）
7. **Config 層測試**：§5.3 測試 12–13
8. 提交前檢查（`pnpm lint && pnpm test`）全綠

---

## 7. 與 Streamlit 端規格的對應

| Streamlit 端需求（auth-flow.md） | 本規格對應 |
|---|---|
| §3.1 `GET /api/auth/session` 契約 | §2 完整定義 |
| §3.2 `POST /api/auth/logout` 契約 | §3 完整定義 |
| §7.3 logout 的 CSRF token 取得方式 | §2.3 於 introspection 回應中一併回傳 `csrfToken` |
| §9 待確認：csrfToken 取得方式 | **已定案**：introspection 一併回傳（不需額外打 `/api/csrf`） |
| §2.2 前端 cookie 需設定 Domain | §1.1 `SESSION_COOKIE_DOMAIN` env var |

### 7.1 Streamlit 下游變更（本 spec 定案後需跟進）

本 spec 的定案決策與 Streamlit 現有程式碼有三處未對齊，需由 Streamlit 端跟進更新。**BFF 不需改動。**

#### A. csrfToken 改由 introspection 取得（現狀：Streamlit 仍呼叫 `GET /api/csrf`）

Streamlit `auth.py:_fetch_csrf()` 有注解「*CSRF token 取得方式為 TBD；此處採後者（/api/csrf）*」，`auth-flow.md §9` 也仍標為 TBD。本 spec §2.3 已定案：`csrfToken` 隨 introspection 一併回傳，節省一次 round-trip。

Streamlit 需跟進的變更（不影響 BFF）：

```python
# lib/state.py — 補 CSRF token key
_CSRF_TOKEN = "csrf_token"

def get_csrf() -> Optional[str]:
    return st.session_state.get(_CSRF_TOKEN)

def set_csrf(token: str) -> None:
    st.session_state[_CSRF_TOKEN] = token

def clear_auth() -> None:
    for key in (_ACTOR, _ACCESS_TOKEN, _TOKEN_EXPIRES_AT, _CSRF_TOKEN):  # 加 _CSRF_TOKEN
        st.session_state.pop(key, None)
```

```python
# lib/auth.py — resolve_actor() 落 csrfToken；_do_logout_bff() 改用 state.get_csrf()
def resolve_actor():
    ...
    data = _introspect()
    actor = Actor(data["user"]["name"], map_role(data["role"]))
    state.set_actor(actor)
    state.set_token(data["accessToken"], data["expiresAt"])
    state.set_csrf(data["csrfToken"])   # ← 新增
    return actor

def _do_logout_bff() -> None:
    csrf = state.get_csrf()              # ← 改為從 state 取，刪除 _fetch_csrf() 呼叫
    if csrf is None:
        raise RuntimeError("no csrf token in session_state; call resolve_actor() first")
    _make_bff_client().request(
        "POST",
        f"{settings.bff_base_url}{settings.bff_logout_path}",
        auth="cookie",
        extra_headers={"X-CSRF-Token": csrf, "Origin": settings.streamlit_origin},
    )
# 刪除 _fetch_csrf() 函式與 bff_csrf_path config 項
```

```python
# lib/config.py — 刪 bff_csrf_path，補 streamlit_origin（見 B）
```

同步更新 Streamlit 規格文件（完整清單見 §7.3）：
- `docs/specs/auth-flow.md §3.1`：response 格式補 `csrfToken` 欄位（現版無此欄）
- `docs/specs/auth.md §4`：introspection 回應格式補 `csrfToken` 欄位
- `docs/specs/auth.md §6`（session_state 契約表）：補 `csrf_token` 列
- `docs/specs/auth-flow.md §9`：關閉 TBD「CSRF token 取得方式」→ 已定案；並關閉「60s refresh 門檻」待確認項（§1.3 已定案）

#### B. `Origin` header 未傳送——logout 必定 403（Blocking Bug）

⚠️ **阻斷性**：BFF `verifyCsrf.ts` 要求 `POST /api/auth/logout` 的請求帶 `Origin` header 且必須在 `ALLOWED_ORIGINS` 白名單中。httpx **不自動送 Origin**，目前 Streamlit `_do_logout_bff()` 只送 `X-CSRF-Token`，缺 `Origin` → BFF 返回 403 CSRF_INVALID。

Streamlit 需在 `lib/config.py` 新增：

```python
streamlit_origin: str = "http://localhost:8501"
# staging/prod 設為 https://dash.example.com（與 BFF ALLOWED_ORIGINS 對應）
```

並在 `_do_logout_bff()` 的 `extra_headers` 補入（見上方 A 的程式碼片段）。

BFF 端：把 Streamlit origin 加入 `ALLOWED_ORIGINS`（已在 §1.2 說明，無需改動 BFF code）。

#### C. `adminRole`（Forward-looking，目前 Streamlit 不消費）

本 spec §2.3 回傳 `adminRole`，但 Streamlit `Actor` dataclass 目前只有 `username` 與 `role`。BFF 多回一個欄位不影響現有 Streamlit 行為（Python dict 忽略未讀欄位）。

未來 Streamlit 需要 SUPER_ADMIN gate 時，才需更新：
- `lib/models.py Actor`：補 `admin_role: Optional[str] = None`
- `lib/state.py`：補 `_ADMIN_ROLE` key 與 helper
- `lib/auth.py resolve_actor()`：落 `state.set_admin_role(data.get("adminRole"))`

---

### 7.2 Streamlit 端 TDD 計畫（pytest；BFF 實作完成後跟進）

> 依 CLAUDE.md：每個行為先寫失敗測試，再補最小實作。測試編號以 `S` 前綴區隔 BFF 的 §5。

**既有測試替換說明（實作 §7.1A/B 前先處理，避免殭屍測試）**：

| 檔案 | 測試名稱 | 動作 |
|---|---|---|
| `tests/unit/test_auth.py:182` | `test_do_logout_bff_fetches_csrf_then_posts` | **替換**（見 S4；改驗 Origin + state 取 csrf） |
| `tests/unit/test_auth.py:207` | `test_fetch_csrf_calls_bff_endpoint_and_returns_token` | **刪除**（`_fetch_csrf()` 函式整體移除） |
| `tests/unit/test_config.py:144` | `assert s.bff_csrf_path == "/api/csrf"` | **刪除**（`bff_csrf_path` config 項移除） |

**`tests/unit/test_state.py`（對應 §7.1A — CSRF token state helper）**：

```
S1. set_csrf("tok") → get_csrf() == "tok"
S2. get_csrf() 無值 → None
S3. clear_auth() 呼叫後 csrf_token 從 session_state 消失
```

**`tests/unit/test_auth.py`（對應 §7.1A — resolve_actor 落 csrfToken；§7.1B — Origin header）**：

> 前置：`_INTROSPECT_OK`（`test_auth.py:30`）補 `"csrfToken": "csrf-tok"` 欄位
> （現值：`{"user": {"name": "alice"}, "role": 1, "accessToken": "jwt", "expiresAt": 123}`）

```
S4. resolve_actor() bff 200 → session_state["csrf_token"] == "csrf-tok"

S5. _do_logout_bff()：
    a. 帶 Origin: settings.streamlit_origin（預設 "http://localhost:8501"）
    b. 帶 X-CSRF-Token 來自 state.get_csrf()（不再呼叫 _fetch_csrf）
    c. state.get_csrf() 為 None → 拋 RuntimeError（防止 resolve_actor 未先呼叫）
    （此測試替換 test_do_logout_bff_fetches_csrf_then_posts）
```

**`tests/unit/test_config.py`（對應 §7.1B — streamlit_origin 新增；bff_csrf_path 移除）**：

```
S6. BaseAppSettings 預設 streamlit_origin == "http://localhost:8501"
S7. bff_csrf_path 欄位不再存在
    assert not hasattr(s, "bff_csrf_path")
```

**提交前**：`pytest` 全綠（CLAUDE.md 提交前檢查）。

---

### 7.3 文件同步清單（本 spec 定案後需跟進）

| 文件 | 位置 | 需更新內容 |
|---|---|---|
| `auth-flow.md §3.1` | `StreamSightStreamlit/docs/specs/auth-flow.md` | response 格式補 `csrfToken` 欄位（現版無此欄） |
| `auth.md §4` | `StreamSightStreamlit/docs/specs/auth.md` | introspection 回應格式補 `csrfToken` 欄位 |
| `auth.md §6`（session_state 契約表） | 同上 | 補 `csrf_token` 列（寫入時機：introspection；模式：bff） |
| `auth-flow.md §9` | `StreamSightStreamlit/docs/specs/auth-flow.md` | 打勾關閉：csrfToken TBD（已定案）+ 60s refresh 門檻（§1.3 已定案） |
| `config.md §3.3` | `StreamSightStreamlit/docs/specs/config.md` | 補 `STREAMLIT_ORIGIN` 欄位（已更新） |
| `config.md §7` | 同上 | 打勾關閉 CSRF token 取得待確認項（已更新） |

---

## 8. 待確認 / 開放問題

- [x] **JWT 交給 Streamlit**：已定案（2026-07-18）。底線為「JWT 不進瀏覽器」；Streamlit server 記憶體持有 token 為可接受取捨（見 §0）
- [x] **csrfToken 取得方式**：已定案（2026-07-18）。introspection 一併回傳，不需額外打 `/api/csrf`；`GET /api/csrf` 端點保留供主前端 CMS 使用（見 §7.1 A）
- [ ] **Streamlit `Origin` header（阻斷性）**：Streamlit 端 `_do_logout_bff()` 需補送 `Origin: <streamlit_origin>`，並於 `lib/config.py` 新增 `streamlit_origin` 設定（見 §7.1 B）；BFF 不需改動
- [ ] **SESSION_COOKIE_DOMAIN 部署值**：staging/prod 的父網域是什麼（`app.example.com` / `dash.example.com` 的共同父）
- [ ] **ALLOWED_ORIGINS 的 Streamlit URL**：staging = `?` / prod = `?`（需與 infra 確認）
- [ ] **browser cookie 清除**：logout 後 Streamlit 是否需主動導向主前端清 cookie（見 §3.3）；或接受 cookie 自然過期
