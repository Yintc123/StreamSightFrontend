# Spec 001d：BFF 基礎建設 — Security / CSRF

- **狀態**：Draft
- **建立日期**：2026-06-13
- **影響範圍**：`src/lib/security/{verifyCsrf,origin}.ts`、`tests/helpers/csrf.ts`
- **依賴**：
  - [001a foundations](./001a-foundations.md)（`env`、`CsrfError`、常數）
  - [001b session-store](./001b-session-store.md)（`StoredSession` type）
- **下游**：[001f createRoute](./001f-create-route.md)、[001g routes-and-lifecycle](./001g-routes-and-lifecycle.md)
- **總覽**：見 [001 index](./001-bff-infrastructure.md)

---

## 1. 防護方案選擇

採 **Synchronizer Token Pattern**（token 綁 session）+ **Origin / Referer 檢查**（defense in depth）+ **SameSite=Lax cookie**。

| 方案 | 採用？ | 理由 |
|---|---|---|
| **Synchronizer Token（session 內）** | ✅ | 已有加密 session 容器；無需第二顆 cookie；server 端比對最不易失誤 |
| Double-Submit Cookie | ❌ | 需第二顆 non-httpOnly cookie，XSS 攻擊面較大 |
| 純 Origin/Referer | ❌（單獨）| 偶有瀏覽器不送 header；僅作第二道 |
| 僅 SameSite=Lax | ❌（單獨）| Lax 仍允許 top-level GET；部分瀏覽器版本行為不一 |

---

## 2. Token 規格

| 屬性 | 值 |
|---|---|
| 長度 | 32 random bytes → base64url（43 字元） |
| 來源 | `crypto.randomBytes(32)`（常數 `CSRF_TOKEN_BYTES` 見 001a §4）|
| 儲存（server） | session 內 `csrfToken` 欄位（`StoredSession`，見 001b §1.2） |
| 客戶端取得 | `GET /api/csrf`（001g §2）或 server-rendered HTML 嵌入 |
| 客戶端儲存 | **僅記憶體**（禁 localStorage / sessionStorage） |
| 客戶端傳送 | `X-CSRF-Token` HTTP header（禁 URL / body） |

### 2.1 生命週期

| 階段 | 行為 |
|---|---|
| Session 建立（首次登入） | `SessionService.create()` 自動產生 |
| Refresh access token | **不**輪換（CSRF 綁 session 不綁 access token） |
| 登入狀態轉換（login / logout / 切換帳號）| **強制輪換**（呼叫 `SessionService.rotateCsrfToken()`） |
| Session 銷毀 | 隨之失效 |

### 2.2 客戶端傳送 token

unsafe method（POST / PUT / PATCH / DELETE）**必須**帶 `X-CSRF-Token`。

**約定**：GET handler **必須** idempotent；任何寫入動作必須用 POST/PUT/PATCH/DELETE。違反此約定等於繞過 CSRF 防護。

---

## 3. Server 端驗證（`src/lib/security/verifyCsrf.ts`）

豁免改為 **route-level opt-in**（透過 createRoute 的 `csrfExempt: true`，見 001f），不再維護全域 path Set。理由：
- 新增 OAuth callback 等豁免端點時，「忘記加進清單 / 拼錯 path」是高機率 bug
- 豁免本質是 route 屬性，與 route 定義同檔可讀性 + grep-ability 最高
- code review 時一眼看到 `csrfExempt: true` 比追到 security 模組底下的常數更直觀

```ts
// src/lib/security/verifyCsrf.ts
import 'server-only'
import { timingSafeEqual } from 'node:crypto'
import { CsrfError } from '@/lib/errors/CsrfError'
import { allowedOrigins, extractOriginFromReferer } from './origin'
import type { StoredSession } from '@/lib/session/types'

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS'])

export type VerifyCsrfOptions = {
  /** true 時跳過 token 比對（仍檢查 Origin 白名單），用於 chicken-and-egg 端點如 `/api/csrf` / `/api/auth/login` */
  exempt?: boolean
}

/**
 * Unsafe method 才驗證；safe method 直接通過。
 *
 * - `session` 可為 null（anonymous endpoint）。非 exempt 且為 unsafe method 時，
 *   無 session ⇒ `CsrfError`（否則攻擊者用 anonymous POST 偽造寫入）。
 * - Origin 檢查**無論 exempt 與否都跑**，作為第二道防線。
 */
export function verifyCsrf(
  req: Request,
  session: StoredSession | null,
  options: VerifyCsrfOptions = {},
): void {
  if (SAFE_METHODS.has(req.method)) return

  // Origin / Referer 檢查（exempt 也適用）
  const origin = req.headers.get('origin') ?? extractOriginFromReferer(req)
  if (!origin || !allowedOrigins.has(origin)) {
    throw new CsrfError('Invalid origin')
  }

  if (options.exempt) return

  // 非 exempt：必須有 session 才能有 csrfToken 可比對
  if (!session) {
    throw new CsrfError('No session for CSRF verification')
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

## 4. Origin 白名單（`src/lib/security/origin.ts`）

```ts
// src/lib/security/origin.ts
import 'server-only'
import { env } from '@/lib/config'

export const allowedOrigins: ReadonlySet<string> = new Set(
  (env.ALLOWED_ORIGINS ?? 'http://localhost:3000').split(',').map(s => s.trim()).filter(Boolean),
)

/**
 * 從 Referer header 萃取 origin（協議 + 主機 + port）；失敗回 null。
 * 用於 Origin header 缺漏的舊瀏覽器 fallback。
 */
export function extractOriginFromReferer(req: Request): string | null {
  const ref = req.headers.get('referer')
  if (!ref) return null
  try { return new URL(ref).origin } catch { return null }
}
```

> Production 環境的 `ALLOWED_ORIGINS` 不可空、不可僅含 localhost（守門於 `config.ts` superRefine，見 001a §3.1）。

---

## 5. `csrfExempt` × `requireAuth` 互動（與 001f 共享）

兩個欄位**正交**，所有 4 種組合都合法：

| `requireAuth` | `csrfExempt` | 典型用途 |
|---|---|---|
| `false` | `false` | 公開讀取端點（GET 列表）|
| `false` | `true` | Chicken-and-egg 寫入：`/api/auth/login`、`/api/auth/register`、OAuth callback |
| `true` | `false` | **多數寫入端點**（要 session + CSRF token）|
| `true` | `true` | 罕見：已有 session 但 CSRF 用其他機制（如 logout 用 state 參數）。**Code review 必須質疑** |

---

## 6. 測試清單

### 6.1 `verifyCsrf` 案例矩陣

| 案例 | method | session | exempt | origin | x-csrf-token | 期望 |
|---|---|---|---|---|---|---|
| Safe method GET | GET | any | any | any | any | 通過 |
| Safe method HEAD | HEAD | any | any | any | any | 通過 |
| Safe method OPTIONS | OPTIONS | any | any | any | any | 通過 |
| 無 Origin 且無 Referer | POST | any | any | 無 | any | `CsrfError`（Origin 檢查先於 exempt） |
| Origin 不在白名單 | POST | any | any | `evil.com` | any | `CsrfError` |
| Origin 不在白名單（即使 exempt） | POST | null | true | `evil.com` | any | `CsrfError` |
| exempt + Origin 正確 + 無 token + 無 session | POST | null | true | 白名單內 | 無 | 通過 |
| 非 exempt + Origin 正確 + null session | POST | null | false | 白名單內 | any | `CsrfError`（防偽造寫入） |
| 非 exempt + 有 session + 無 X-CSRF-Token | POST | 有 | false | 白名單內 | 無 | `CsrfError` |
| Token 長度錯 | POST | 有 | false | 白名單內 | 短字串 | `CsrfError`（不可拋 native 例外） |
| Token 內容錯（長度對） | POST | 有 | false | 白名單內 | 同長度但內容差 | `CsrfError` |
| Origin 正確 + token 正確 | POST | 有 | false | 白名單內 | 正確 token | 通過 |
| Referer fallback：Origin 缺、Referer 屬白名單 | POST | 有 | false | 無 + Referer 白名單 | 正確 token | 通過 |
| Referer 解析失敗（不合法 URL） | POST | 有 | false | 無 + Referer 亂碼 | any | `CsrfError` |

### 6.2 `extractOriginFromReferer`

- `https://example.com/path?q=1` → `'https://example.com'`
- `https://example.com:8080/path` → `'https://example.com:8080'`
- 無 Referer → `null`
- 不合法 URL → `null`

### 6.3 `allowedOrigins`

- `ALLOWED_ORIGINS=http://a.com,http://b.com` → Set `{ 'http://a.com', 'http://b.com' }`
- 空字串元素 trim 後過濾掉
- 未設 env → 預設 `{ 'http://localhost:3000' }`

---

## 7. 測試輔助

```ts
// tests/helpers/csrf.ts
export function csrfHeader(token: string): HeadersInit {
  return { 'x-csrf-token': token, 'origin': 'http://localhost:3000' }
}
```

---

## 8. 驗收條件

當以下都成立時，本子 spec 視為**已實作**：

- [ ] `src/lib/security/verifyCsrf.ts`：§3 程式碼通過 §6.1 所有案例（含 `session=null + exempt=false` → CsrfError 的關鍵案例）
- [ ] `src/lib/security/origin.ts`：`allowedOrigins` Set + `extractOriginFromReferer` 通過 §6.2 / §6.3
- [ ] `tests/helpers/csrf.ts` 提供 `csrfHeader(token)`
- [ ] **無業務字眼**（grep 不到 `charity|donation|streamsight[^_-]`）
- [ ] `pnpm lint` + `pnpm test` + `pnpm typecheck` 綠
