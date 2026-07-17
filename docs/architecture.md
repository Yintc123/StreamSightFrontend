# 架構：Next.js + BFF

> 本 repo 為 StreamSight 前端**骨架**:業務功能已剝除,只保留可重用的 BFF /
> session / auth / 錯誤處理 / mock / 測試 / 部署基建。以下描述這層骨架的角色與結構。

## 1. BFF 的角色

**BFF（Backend For Frontend）**：在前端與真正的後端（NodeJS + Express/Fastify + ORM + DB）之間，由 Next.js 作為「為前端量身打造的中介後端」。

```
[Browser]
   │
   │ fetch / RSC
   ▼
[Next.js BFF]  ← 本專案 frontend/
   │ - Route Handlers（/api/*）
   │ - Server Components 直接呼叫
   │ - Session、聚合、欄位裁切、錯誤標準化、cache
   ▼
[Real Backend]  ← Domain API（純資料）
   │
   ▼
[Database]
```

### 為什麼用 BFF？
1. **欄位裁切與聚合**：頁面需要的資料形狀常與後端 domain model 不一致，BFF 在此聚合（避免 over-fetch / under-fetch）。
2. **隱藏後端**：瀏覽器只看得到 BFF，後端可放內網。
3. **快取策略集中**：Next.js 的 `revalidate`、`fetch cache`、`unstable_cache` 在 BFF 統一管理。
4. **型別共享**：前端元件、Route Handler、Zod schema 共用 TS 型別。

---

## 2. 資料夾結構（現況骨架）

```
frontend/
├── docs/
│   ├── architecture.md
│   ├── specs/                            # 基建實作規格（001x / 005 / 006 / 007 / 010）
│   └── decisions/                        # ADR
├── public/                               # 靜態資產
├── src/
│   ├── proxy.ts                          # Next 16 Proxy：/cms* auth-gate（optimistic）
│   ├── instrumentation.ts                # Node runtime lifecycle + mock 註冊
│   ├── app/
│   │   ├── layout.tsx · providers.tsx · globals.css
│   │   ├── page.tsx                      # 首頁 + LoginCard
│   │   ├── register/                     # 註冊頁
│   │   ├── auth/Field.tsx                # 共用表單欄位
│   │   └── api/                          # BFF Route Handlers
│   │       ├── auth/{login,register}/route.ts
│   │       ├── csrf/route.ts
│   │       └── health/{,live}/route.ts
│   ├── components/ui/                     # primitives：Spinner / EmptyState / InlineError / BottomSheet / FallbackImage
│   └── lib/
│       ├── api/                          # createRoute、backendFetch、responses、parsers、request-id、http-status
│       ├── session/                      # iron-session cookie + Redis/in-memory store、requireAdmin
│       ├── security/                     # verifyCsrf、origin 檢查
│       ├── auth/                         # decodeJwtPayload
│       ├── errors/                       # 錯誤型別階層 + toErrorResponse + 全域 query error
│       ├── schemas/                      # 通用 Zod：envelope、pagination、auth
│       ├── hooks/                        # useDebouncedValue、useUrlSync、useViewport、useSmartBack…
│       ├── mock/                         # USE_MOCK dispatch 框架 + auth bridge
│       ├── config.ts · log.ts · lifecycle.ts · cn.ts
│       └── client/csrf.ts                # 瀏覽器端取 CSRF token
├── tests/
│   ├── e2e/                              # Playwright
│   ├── mocks/                            # MSW（server + handlers）
│   ├── helpers/ · contracts/
├── .env.example
├── next.config.ts · tsconfig.json · vitest.config.ts · playwright.config.ts
└── package.json
```

> 新增業務垂直時：在 `app/api/<feature>/route.ts` 用 `createRoute` 建 Route
> Handler、在 `lib/schemas/` 加該 feature 的 Zod schema、在 `lib/mock/register.ts`
> 註冊對應 mock、頁面放 `app/<feature>/`。

---

## 3. 資料流（通用 BFF 請求）

```
Browser ──fetch /api/<x>──▶ Next.js Route Handler
                                   │  createRoute：parse query/body/params（Zod）
                                   │
                      ┌────────────┴────────────┐
                      ▼                         ▼
             USE_MOCK=1：resolveMock     USE_MOCK=0：backendFetch(BACKEND_API_URL)
                      │                         │
                      └────────────┬────────────┘
                                   ▼
                            Zod parse + reshape（裁切 backend-only 欄位）
                                   │
                                   ▼
                       okResponse → { data } JSON envelope
```

- RSC 也可直接呼叫 `lib/api/*` 的 server-only helper,不繞 HTTP。
- Client 端資料抓取用 TanStack Query(`Providers` 設定 staleTime / gcTime /
  全域錯誤攔截 → toast)。

---

## 4. 與真後端的銜接

- BFF → 真後端：`BACKEND_API_URL`（環境變數，僅 server 端可見），透過 `backendFetch`（含 timeout、request-id 轉發）。
- `USE_MOCK=1` 時 Route Handler 走 `lib/mock/` 的 dispatch,對前端 contract 不變,未來切真後端無痛。

---

## 5. 環境變數

見 [`.env.example`](../.env.example)。重點:`SESSION_SECRET`(必填)、`USE_MOCK`、
`BACKEND_API_URL`、`REDIS_HOST/PORT`、`ALLOWED_ORIGINS`(CSRF)、`SESSION_COOKIE_NAME`
(預設 `streamsight_session`)、`REDIS_KEY_PREFIX`(預設 `streamsight-bff`)。

---

## 6. 錯誤處理

| 來源 | 處理方式 |
|---|---|
| BFF → 真後端逾時 / 5xx | 標準錯誤 envelope `{ error: { code, message } }`（見 `lib/errors`） |
| Zod parse 失敗（後端契約破裂） | `ContractViolationError` → 5xx |
| 客戶端 fetch 失敗 | TanStack Query retry 1 次 + 全域 `handleGlobalQueryError` 顯示 Toast |

詳見 [`specs/006-error-handling.md`](./specs/006-error-handling.md)。

---

## 7. 技術選型摘要

| 層級 | 選用 |
|---|---|
| 前端框架 | Next.js 16（App Router、Turbopack 預設） |
| React | React 19.2 |
| 語言 | TypeScript |
| 樣式 | TailwindCSS v4 |
| 資料抓取 | TanStack Query v5 |
| 驗證 | Zod v4 |
| Session | iron-session + Redis(ioredis) |
| 測試 | Vitest + Testing Library + MSW(unit)· Playwright(e2e) |
| 套件管理 | pnpm |

> 詳細決策依據見 [`decisions/`](./decisions/)（ADR）。

---

## 8. SPA 導航、scroll 還原、跨頁 state

頁面切換是 SPA（Next 叫 soft navigation），按返回會記憶 scroll 與 URL searchParams
狀態 — 由 Next.js App Router runtime 預設行為 + `useUrlSync` / `useSmartBack` 協作。

---

最後更新：2026-07-17
