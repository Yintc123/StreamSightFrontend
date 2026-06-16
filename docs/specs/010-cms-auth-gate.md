# Spec 010：`/cms` Auth Gate（Next.js 16 Proxy + RSC）

- **狀態**：Draft（v0.1 — 從 [spec 005 v0.6](./005-homepage-auth.md) §4a 抽出獨立）
- **建立日期**：2026-06-16
- **路徑**：
  - `src/proxy.ts` / `src/proxy.test.ts`（Next.js 16 Proxy；edge runtime，cookie presence 檢查）
  - `src/app/cms/page.tsx`（async RSC；full session 驗證）
  - `src/app/AuthRedirectToast.tsx` / `.test.tsx`（v0.2 — 首頁 client component；讀 `?reason=cms-auth` → toast「無使用 cms 權限」+ strip query）
  - `src/app/page.tsx`（v0.2 — 首頁 RSC 掛 `<Suspense><AuthRedirectToast/></Suspense>`）
- **依賴**：
  - 既有 iron-session + Redis session service（[spec 001b](./001b-session-store.md) / [spec 001c](./001c-session-service.md)）
  - cookie name `jko_session`（`env.SESSION_COOKIE_NAME`，預設值；vitest.config.ts `env` block 也固定相同值）
  - [Next.js 16 Proxy doc](../../node_modules/next/dist/docs/01-app/01-getting-started/16-proxy.md)
  - [Next.js 16 Authentication guide](../../node_modules/next/dist/docs/01-app/02-guides/authentication.md)（特別 §"Optimistic checks with Proxy"）

---

## 1. 職責

`/cms` 與 `/cms/*` 是登入後 CMS（charity / project / sale-item CRUD placeholder，未來功能掛在這底下），**只允許持有有效 session 的請求進入**：

- 沒登入 → 立刻 redirect `/`
- session cookie 損壞 / 過期 / Redis 沒紀錄 → 同樣 redirect `/`，不漏

附帶讓 CMS RSC 拿到驗證過的 `StoredSession`，可以直接 render `user.name` 等資料而不必再驗一次。

---

## 2. Threat model

| 情境 | 該擋下嗎？ |
|---|---|
| 完全沒 cookie 的訪客直接訪問 `/cms` | ✅ |
| 訪客 cookie 已過期（Redis TTL 到） | ✅ |
| 訪客手動偽造 / 改寫 cookie 內容 | ✅（iron-session seal 驗 HMAC，decrypt 失敗 → null） |
| Redis 暫時不可用 | ✅（`getSessionService().get()` throw → RSC error boundary → 安全失敗）|
| 訪客有 cookie 但 sessionId 對應 Redis 沒資料（管理員手動 destroy） | ✅（Redis lookup → null） |
| 訪客已登入但是 BE access token 已過期 | ⚠️ 範圍外（access token expiry 由 BFF route 內 `backendFetch` 觸發 refresh；CMS placeholder 目前不打 BE，不會踩到） |
| 訪客已登入但 role ≠ ADMIN | ⚠️ 範圍外（未來真實 admin 區另開 spec；spec 007 §10 已留 `/admin` 給 role gate） |

CSRF：本 spec 不涵蓋——CMS 目前是讀取頁，未來 mutation 走 BFF route 時由 [spec 001d CSRF](./001d-security-csrf.md) `verifyCsrf` 把關。

---

## 3. 設計：雙層 gate

對齊 Next.js 16 auth 指南推薦的 **「Optimistic checks with Proxy + DAL」** pattern。一句話總結：

> Proxy 早一步擋掉「明顯沒登入」的請求；RSC 再用 session service 把關「cookie 有但實際無效」的邊界情況。

```
            ┌───────────────────┐
GET /cms ──▶│  src/proxy.ts     │── 無 jko_session cookie ──▶ 307 → /?reason=cms-auth
            │  (edge runtime)   │
            │  matcher: /cms*   │
            └────────┬──────────┘
                     │ 有 cookie
                     ▼
            ┌───────────────────┐
            │ src/app/cms/      │── get() === null ──▶ redirect('/?reason=cms-auth')
            │   page.tsx (RSC)  │
            │ (node runtime)    │── session 有效 ──▶ render
            └───────────────────┘
                     ▼ (redirect 落地後)
            ┌───────────────────┐
            │ src/app/page.tsx  │── <AuthRedirectToast/>
            │   (homepage RSC)  │    reads ?reason=cms-auth
            │                   │    → toast.error('無使用 cms 權限')
            │                   │    → router.replace('/') 把 query 清掉
            └───────────────────┘
```

### 3.1 第一層 — `src/proxy.ts`（Proxy）

> **Next.js 16 命名**：Middleware 在 Next 16 改名 Proxy（[官方 doc](../../node_modules/next/dist/docs/01-app/01-getting-started/16-proxy.md)）；檔案約定一樣是 `proxy.ts` 放在 `src/` 或 project root。

行為：

```ts
// 簡化版
const SESSION_COOKIE_NAME = process.env.SESSION_COOKIE_NAME ?? 'jko_session'

export function proxy(request: NextRequest): NextResponse {
  if (!request.cookies.get(SESSION_COOKIE_NAME)?.value) {
    const url = request.nextUrl.clone()
    url.pathname = '/'
    url.search = ''
    return NextResponse.redirect(url)   // 307
  }
  return NextResponse.next()
}

export const config = { matcher: ['/cms', '/cms/:path*'] }
```

**限制**（為何只做 cookie presence 不做 full validation）：

1. **runtime**：proxy 預設跑 edge；iron-session unseal 需要 `SESSION_SECRET` 與 Redis client，兩者都是 server-only / Node-only。
2. **效能**：proxy 也會跑在 [Link prefetch](https://nextjs.org/docs/app/getting-started/linking-and-navigating#prefetching)，每張 link prefetch 一次 = 多打一次 Redis；Next.js 16 官方指南明說「avoid database checks to prevent performance issues」。
3. **正確性**：proxy 用 `fetch()` 也沒辦法 cache 結果（`options.cache` / `next.revalidate` 在 proxy 內無效，[Proxy doc §31](../../node_modules/next/dist/docs/01-app/01-getting-started/16-proxy.md)），無法用「打 Redis 但 cache 5 秒」這種捷徑。

所以這層只做 **「cookie 在不在」** — 最便宜的快篩。

**`SESSION_COOKIE_NAME` 為何不從 `@/lib/config` 來**：`config.ts` 標 `'server-only'`，edge runtime 不能 import；改成 `process.env` 直讀 + fallback 預設值，與 `config.ts` 的 default 對齊（`vitest.config.ts` 也固定該 env，test 不會漂走）。

### 3.2 第二層 — `src/app/cms/page.tsx`（RSC）

```tsx
export default async function CmsPage() {
  const session = await getSessionService().get()
  if (!session) redirect('/')
  // ... render with session.user.name ...
}
```

`getSessionService().get()`（[spec 001c](./001c-session-service.md)）做完整三步：

1. 從 cookie 抽 `sessionId`（iron-session unseal；HMAC 驗失敗或 secret 不對 → 視為無 cookie）
2. 拿 sessionId 去 Redis 查 `StoredSession`
3. 回 `StoredSession | null`

`null` 涵蓋的情境：cookie 損壞 / 過期 / Redis miss / sessionId 對不上。一律 `redirect('/?reason=cms-auth')`。

RSC 跑 Node runtime，無 edge 限制，可放心打 Redis + iron-session。

### 3.3 第三層 — `src/app/AuthRedirectToast.tsx`（首頁回饋 toast，v0.2 新增）

Proxy 與 RSC 都會把 `?reason=cms-auth` 黏在 `/` 上：

| redirect 來源 | URL |
|---|---|
| Proxy（無 cookie） | `307 → /?reason=cms-auth` |
| RSC（cookie 在但 session null） | `redirect('/?reason=cms-auth')` → 308 |

首頁 `src/app/page.tsx` 掛 `<Suspense><AuthRedirectToast /></Suspense>`。`AuthRedirectToast` 是 client component：

```tsx
// 簡化版
export function AuthRedirectToast() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const reason = searchParams.get('reason')

  useEffect(() => {
    if (reason !== 'cms-auth') return
    toast.error('無使用 cms 權限', {
      id: 'cms-auth-required',
      duration: 4000,
    })
    router.replace('/')   // strip query so refresh 不會再 toast
  }, [reason, router])

  return null
}
```

**為何要 strip query**：使用者按 F5 刷新時 URL 還是 `/?reason=cms-auth`，會再 toast 一次（騷擾）；`router.replace('/')` 把 query 清掉，refresh 後就沒事。

**為何 toast 帶固定 `id`**：React 19 strict mode 在 dev 會把 effect 跑兩次；sonner 的 `id` upsert 確保「第二次呼叫不堆疊」，使用者只看到 1 個 toast（同 [spec 006 §2.2](./006-error-handling.md) 5xx toast 的 dedup 策略）。

**為何 `?reason=cms-auth`，不用 cookie flash**：cookie flash 要在 proxy 寫 + page 讀清，跨 edge / node runtime 麻煩；query string 在 redirect URL 內，proxy edge 直接組裝、首頁 client 直接讀，零跨 runtime 狀態，最簡單。代價是 URL 變醜一瞬間（被 `router.replace` 清掉）。

**為何用 `<Suspense>` 包**：Next.js 16 `useSearchParams()` 在客戶端讀 URL params 時，要求 caller 落在 `<Suspense>` 邊界內，避免 streaming SSR 時 client / server params 不同步。

---

## 4. cookie 契約

| 欄位 | 值 |
|---|---|
| 名稱 | `process.env.SESSION_COOKIE_NAME`（預設 `jko_session`） |
| 值 | iron-session sealed blob（含 sessionId + HMAC；[spec 001c §3](./001c-session-service.md)） |
| HttpOnly | true |
| Secure | production true，dev false |
| SameSite | Lax |
| Path | `/` |
| TTL | `env.SESSION_TTL_SECONDS`（預設 30 天） |

Proxy **只**讀 cookie 存在性，**不**讀內容；任何非空字串都視為「可能有 session」（最終驗證落到 RSC 那一層）。

---

## 5. 行為矩陣

| 訪問 | cookie 狀態 | session 狀態 | Proxy 行為 | RSC 行為 | 使用者看到 |
|---|---|---|---|---|---|
| `/cms` | 缺 | — | 307 → `/?reason=cms-auth` | 不執行 | 跳首頁 + toast「無使用 cms 權限」 |
| `/cms/orders` | 缺 | — | 307 → `/?reason=cms-auth` | 不執行 | 同上 |
| `/cms?tab=foo` | 缺 | — | 307 → `/?reason=cms-auth`（原 query 丟掉） | 不執行 | 同上 |
| `/cms` | 有 | 有效 | next() | render | CMS placeholder（無 toast） |
| `/cms` | 有 | seal 失敗（亂改 / secret 換過） | next() | `get()` → null → `redirect('/?reason=cms-auth')` | 跳首頁 + toast |
| `/cms` | 有 | Redis miss（過期 / 被 destroy） | next() | 同上 | 跳首頁 + toast |
| `/cms` | 有 | Redis 暫時不可用 | next() | `get()` throw → Next.js error boundary | 500 頁（範圍外，未來統一 error UX 再處理）|
| `/donation`（非 cms） | 任意 | 任意 | matcher 不匹配，proxy 不跑 | 該頁不做 auth | 公開頁照常 |
| 直接訪問 `/?reason=cms-auth` | — | — | matcher 不匹配 | — | toast 一次 + `router.replace('/')` 清掉 query |
| `/?reason=other-cause` | — | — | matcher 不匹配 | — | 無 toast（reason 不是 `cms-auth`） |

---

## 6. 測試

### 6.1 `src/proxy.test.ts`（強制 TDD — 邏輯類）

| # | 案例 | 期望 |
|---|---|---|
| 1 | `jko_session` cookie 存在 + 訪問 `/cms` | `proxy()` 不 redirect（pass through） |
| 2 | `jko_session` cookie 存在 + 訪問 `/cms/orders`（nested） | 同上 |
| 3 | 無 cookie + 訪問 `/cms` | 307 → `http://localhost:3000/?reason=cms-auth` |
| 4 | 有 `other=1` 但缺 `jko_session` + 訪問 `/cms/charities` | 307 → `/?reason=cms-auth` |
| 5 | 有 query string（`?tab=foo`）+ 無 cookie | 307 → `/?reason=cms-auth`（原 query 丟掉，補 reason） |
| 6 | matcher 設定 | `['/cms', '/cms/:path*']` |

**為何用 `req.cookies.set()` 建構而非 header**：happy-dom 環境下，`new NextRequest(url, { headers: { cookie: '...' } })` 在 Next 16 build 不會把 cookie header 解析到 `RequestCookies`；改用 `NextRequest.cookies.set(name, value)` 是跨版本可靠的入口。

### 6.2 `src/app/cms/page.tsx`（RSC，免測）

RSC 內 `if (!session) redirect('/?reason=cms-auth')` 一行邏輯：

- `getSessionService().get()` 已由 [spec 001c](./001c-session-service.md) 的 `service.test.ts` 完整覆蓋（happy / 損壞 cookie / Redis miss / refresh / destroy）
- `redirect()` 是 Next.js 內建，無自家邏輯
- RSC 內呼叫 server-only 模組，單元測試成本高、價值低

→ 不另寫 RSC 測試；信賴上游 + e2e 串通。

### 6.2a `src/app/AuthRedirectToast.test.tsx`（v0.2 — 強制 TDD）

| # | 案例 | 期望 |
|---|---|---|
| 1 | `searchParams.reason === 'cms-auth'` | `toast.error('無使用 cms 權限', { id: 'cms-auth-required' })` + `router.replace('/')` 各呼叫 1 次 |
| 2 | `reason` 不存在 | 不 toast、不 replace |
| 3 | `reason === 'other-cause'` | 不 toast、不 replace（只認 `cms-auth`） |
| 4 | 渲染輸出 | DOM 為空（component return null） |

**mock 策略**：`vi.hoisted()` 提前生 `replaceMock` / `searchParamsMock` / `toastErrorMock`，再 `vi.mock('next/navigation')` / `vi.mock('sonner')` 注入；test 用 `searchParamsMock.get.mockImplementation((k) => ...)` 模擬不同 `?reason` 值。

### 6.3 e2e（後續加，本 spec 不強制）

| 流程 | 涵蓋 |
|---|---|
| 直接訪問 `/cms`（無 cookie）→ 跳 `/?reason=cms-auth` → 看到 toast「無使用 cms 權限」+ URL 變回 `/` | proxy 層 + AuthRedirectToast |
| 登入後（dev login）→ 訪問 `/cms` → 看到 placeholder + 使用者名 → 無 toast | RSC 層 + happy path |
| 登入後手動清掉 `jko_session` cookie → 重新進 `/cms` → 跳 `/` + toast | proxy 層 |
| 把 `jko_session` 改成亂字串 → 進 `/cms` → 跳 `/` + toast | RSC 層（cookie 在但 unseal 失敗） |
| 直接訪問 `/?reason=cms-auth` → toast 一次 + URL strip 成 `/` → 再 F5 不再 toast | AuthRedirectToast 的 strip query 行為 |

---

## 7. 開放問題

- **`?next=<原 pathname>` 回跳目的地**：目前一律 redirect 到 `/`。若要做「登入前嘗試訪問 `/cms/orders`，登入後跳回 `/cms/orders`」，要：
  1. Proxy redirect 時帶 `?next=<原 pathname>`
  2. LoginCard / RegisterCard 提交成功時讀 query 的 `next` 再 `router.push(next ?? '/cms')`
  3. 驗證 `next` 是 same-origin path 才接受（避免 open redirect 漏洞）

  範圍外；標為 nice-to-have。

- **Role gate（ADMIN vs USER）**：BE spec 008 §10 / spec 007 §10 已有 `role=0=ADMIN` / `role=1=USER` 與 `requireAdmin` preHandler 概念；目前 `/cms` 只擋「沒登入 vs 登入」一刀，不分 role。未來真實後台需要：
  - 在 §3.2 RSC 加 `if (session.user.role !== ADMIN) redirect('/cms')`（或顯示 403）
  - 或把 ADMIN-only 路徑搬到 `/admin/*` 另開 proxy + RSC gate
  - 或 BE 那層用 `requireAdmin` preHandler 做 source of truth，FE 信賴 BE 401/403 → BFF 透傳

  spec 007 §10「路徑命名澄清」已預留 `/admin` 給未來真 admin 後台；本 spec 不擴張。

- **保護其他路徑**：目前 matcher 只蓋 `/cms*`。未來若 `/profile`、`/orders/me` 等使用者私人區也要登入才能看，可：
  - 把它們加進 matcher：`matcher: ['/cms', '/cms/:path*', '/profile', '/profile/:path*']`
  - 或抽成 `protectedRoutes` 陣列由 `proxy()` 內判斷（[Next.js auth 指南](../../node_modules/next/dist/docs/01-app/02-guides/authentication.md) §"Optimistic checks" 範例就是這寫法）

  目前只有 `/cms` 一條，直接寫死 matcher；超過 3 條再重構。

- **Proxy redirect 用 307 而非 302**：Next 16 `NextResponse.redirect()` 預設 307（temp redirect、保留 method）。對 GET-only 的訪問差異不大；如果未來 `/cms` 接 POST（不太可能）才會差。本 spec 不調。

- **Edge runtime 時鐘 / 區域**：proxy 跑 edge，無時鐘漂移問題（不做 session 過期判斷）；不依賴特定 region。

---

## 8. 變更紀錄

| 版本 | 日期 | 變更 |
|---|---|---|
| 0.1 | 2026-06-16 | 初版：從 [spec 005 v0.6](./005-homepage-auth.md) §4a 抽出。雙層 gate（`src/proxy.ts` cookie presence + `src/app/cms/page.tsx` RSC full validation）、threat model（§2）、行為矩陣（§5）、proxy 6 個 test case（§6.1）、開放問題（`?next=` / role gate / 其他保護路徑）。實作已在 spec 005 v0.6 落地，本 spec 整理脈絡與決策依據。 |
| 0.2 | 2026-06-16 | **加 toast「無使用 cms 權限」**：(a) proxy / RSC 兩條 redirect path 都改成 `'/?reason=cms-auth'`；(b) 新 `src/app/AuthRedirectToast.tsx`（client component，react `useSearchParams` + `useRouter`、effect 內 `toast.error` + `router.replace('/')` strip query），首頁 `src/app/page.tsx` 用 `<Suspense fallback={null}>` 包住掛載；(c) toast id 固定 `cms-auth-required`，sonner upsert 防 strict-mode 雙渲染重複；duration 4 秒；(d) 新 §3.3「第三層 — AuthRedirectToast」、§5 行為矩陣加 toast 欄、§6.2a 新 4 個 test case、§6.3 e2e 補 toast 流程；proxy 既有 3 條 redirect-target 測試斷言改成 `?reason=cms-auth`。 |
