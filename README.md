# StreamSight — Frontend

> Next.js 16（App Router）+ BFF 前端骨架

本 repo 為 StreamSight 系統的前端層，同時扮演 **BFF（Backend For Frontend）** 角色。業務功能已剝除，保留可重用的基礎架構：BFF Route Handler 框架、iron-session + Redis session、CSRF 防護、Admin 登入 auth、錯誤標準化、mock 框架、測試與部署設定。新業務功能垂直（列表、詳情、報表…）在此骨架上長出來。

---

## 目錄

- [架構概覽](#架構概覽)
- [系統需求](#系統需求)
- [快速開始](#快速開始)
- [測試帳號](#測試帳號)
- [環境變數](#環境變數)
- [開發指令](#開發指令)
- [專案結構](#專案結構)
- [技術選型](#技術選型)
- [頁面與 BFF Route 總覽](#頁面與-bff-route-總覽)
- [API 文件](#api-文件)
- [骨架能力（可重用基建）](#骨架能力可重用基建)
- [測試](#測試)
- [部署](#部署)
- [Streamlit 整合](#streamlit-整合)
- [新增業務功能](#新增業務功能)
- [文件](#文件)

---

## 架構概覽

```
[Browser]
    │  fetch / RSC
    ▼
[Next.js BFF]  ← 本 repo
    │  Route Handlers（/api/*）
    │  Server Components 直接呼叫
    │  Session、聚合、欄位裁切、錯誤標準化、cache
    ▼
[Real Backend]  ← Domain API（純資料，放內網）
    │
    ▼
[Database]
```

BFF 的核心價值：

| 目的 | 說明 |
|---|---|
| 欄位裁切 / 聚合 | 頁面所需資料形狀常與後端 domain model 不同，BFF 在此整合 |
| 隱藏後端 | 瀏覽器只看得到 BFF；後端可放置於內網 |
| 快取策略集中 | `revalidate`、`unstable_cache` 在 BFF 統一管理 |
| 型別共享 | 前端元件、Route Handler、Zod schema 共用 TypeScript 型別 |

---

## 系統需求

| 工具 | 版本 |
|---|---|
| Node.js | ≥ 22（Dockerfile 使用 `node:22-alpine`） |
| pnpm | 11.6.0（`packageManager` 欄位固定） |
| Redis | ≥ 7（`USE_MOCK=0` 時必需） |
| Docker（選用） | 任意近期版本 |

---

## 快速開始

### Mock 模式（不需要真後端或 Redis）

```bash
# 1. 安裝依賴
pnpm install

# 2. 複製環境變數範本
cp .env.example .env.local

# 3. 填入 SESSION_SECRET（必填；即使 USE_MOCK=1 也需要）
#    在 .env.local 中設定：
SESSION_SECRET=$(openssl rand -base64 48)

# 4. 確認 USE_MOCK=1（.env.example 預設即為 0，需手動改為 1）
#    .env.local:
#    USE_MOCK=1

# 5. 啟動開發伺服器
pnpm dev
# → http://localhost:3000
```

### 真後端模式（`USE_MOCK=0`）

```bash
# 1. 啟動 Redis（host port 6380）
docker compose up -d redis

# 2. 設定 .env.local
#    USE_MOCK=0
#    BACKEND_API_URL=http://localhost:8000   # 真後端位址
#    REDIS_HOST=localhost
#    REDIS_PORT=6380

# 3. 啟動開發伺服器
pnpm dev
```

> **Redis port 注意**：`.env.example` 預設 `REDIS_PORT=6379`，對應整合 repo（StreamSight 根目錄）compose 起的 Redis；若使用本 repo 的 `docker compose up -d redis`（對外 port 6380，避開 6379 衝突），`.env.local` 需改為 `REDIS_PORT=6380`。

### 整套服務一鍵啟動

若要同時啟動前端、後端、MariaDB、Redis、Streamlit，請改用整合 repo（StreamSight 根目錄）的 `docker compose up -d`，詳見根目錄 README 的快速啟動說明。

---

## 測試帳號

### Mock 模式（`USE_MOCK=1`）

Mock 的 login handler **不驗證帳密**——任意帳號密碼皆可登入，登入後身分固定為 root 管理員（`username: admin`、`name: Root Admin`、`admin_role: root`）。

e2e 測試與文件範例慣例使用以下帳密（見 `tests/e2e/cms-admins.spec.ts`）：

| 帳號 | 密碼 |
|---|---|
| `admin` | `admin-dev-password-change-me` |

### 真後端模式（`USE_MOCK=0`）

無內建測試帳號。初始管理員由整合 repo 的 `setup.sh` / `setup.ps1` 在初始化時互動建立（預設 username `admin`，密碼由你自行輸入）。

> **注意**：上表帳密僅供 mock／e2e 測試使用。任何真實環境的帳號密碼都不應寫入 README 或版本控制。

---

## 環境變數

完整清單見 [`.env.example`](.env.example)（內有分組說明）。下表列出重點變數：

### 必填

| 變數 | 說明 |
|---|---|
| `SESSION_SECRET` | iron-session cookie 簽章金鑰（≥32 字元）。產生：`openssl rand -base64 48` |
| `ALLOWED_ORIGINS` | CSRF 允許來源（逗號分隔）。生產環境需含非 localhost 位址 |

### 條件必填

| 變數 | 條件 | 說明 |
|---|---|---|
| `BACKEND_API_URL` | `USE_MOCK=0` | BFF → 真後端 base URL（預設 `http://localhost:8000`） |
| `REDIS_HOST` / `REDIS_PORT` | `USE_MOCK=0` | BFF session store。`.env.example` 預設 port `6379`（整合 repo 的 Redis）；用本 repo 的 `docker compose up -d redis` 時為 `6380` |

### 選填

| 變數 | 預設值 | 說明 |
|---|---|---|
| `USE_MOCK` | `0` | `1` → mock 模式（e2e 測試 / 無真後端開發用） |
| `SESSION_COOKIE_NAME` | `streamsight_session` | Session cookie 名稱 |
| `SESSION_COOKIE_DOMAIN` | 空 | 跨子網域 SSO 時設定（例如 `.example.com`） |
| `SESSION_TTL_SECONDS` | `2592000`（30 天） | Cookie 有效期，對齊 refresh token 生命週期 |
| `SESSION_SECRET_PREVIOUS` | 空 | 輪替金鑰期間設定；舊 cookie 仍可解密直到移除 |
| `REDIS_PASSWORD` | 空 | Redis 驗證密碼 |
| `REDIS_KEY_PREFIX` | `streamsight-bff-dev` | Redis key 前綴 |
| `REDIS_TLS_ENABLED` | `0` | 生產環境建議開啟 |
| `REDIS_CONNECT_TIMEOUT_MS` | `2000` | Redis 連線逾時 |
| `REDIS_COMMAND_TIMEOUT_MS` | `1000` | Redis 指令逾時 |
| `STREAMLIT_BASE_URL` | 空 | Streamlit app base URL；空白時 sidebar 連結使用相對路徑 |
| `APP_VERSION` / `APP_COMMIT` | `0.0.0` / 空 | `/api/health` 回傳的版本資訊 |

### 公開變數（`NEXT_PUBLIC_*`，build-time inline）

| 變數 | 預設值 | 說明 |
|---|---|---|
| `NEXT_PUBLIC_APP_NAME` | `StreamSight` | 顯示於頁面標題 |
| `NEXT_PUBLIC_ENABLE_THEME_TOGGLE` | `0` | `1` → 顯示深/淺色切換按鈕 |

---

## 開發指令

| 指令 | 用途 |
|---|---|
| `pnpm dev` | 啟動開發伺服器（Turbopack） → http://localhost:3000 |
| `pnpm build` | 產出 production build（`output: standalone`） |
| `pnpm start` | 執行 production build |
| `pnpm lint` | ESLint |
| `pnpm typecheck` | `tsc --noEmit` |
| `pnpm test` | Vitest 跑一次 |
| `pnpm test:watch` | Vitest watch 模式（TDD 主力） |
| `pnpm test:ui` | Vitest Browser UI |
| `pnpm test:coverage` | Vitest + 覆蓋率報告 |
| `pnpm test:e2e` | Playwright e2e（自動帶 `USE_MOCK=1` 啟動 dev server） |
| `pnpm test:e2e:ui` | Playwright UI 模式 |

> **提交前**：`pnpm lint` → `pnpm test` → （若改 UI）`pnpm test:e2e`，任一失敗不可 commit。

---

## 專案結構

> 單元／整合測試與被測檔案 colocate（`<檔名>.test.ts(x)`），樹中省略不列。
> BFF Route Handlers 的完整清單見〈[頁面與 BFF Route 總覽](#頁面與-bff-route-總覽)〉。

```
StreamSightFrontend/
├── docs/
│   ├── architecture.md              # BFF 架構、資料流、資料夾結構
│   ├── specs/                       # 基建實作規格（001a–001h、005–017）
│   └── decisions/                   # ADR（架構決策紀錄）
├── infra/
│   └── terraform/                   # Infrastructure as Code
├── public/                          # 靜態資產
├── src/
│   ├── proxy.ts                     # Next.js 16 Proxy：/cms* auth-gate（optimistic）
│   ├── instrumentation.ts           # Runtime 進入點（委派至 instrumentation.node.ts）
│   ├── instrumentation.node.ts      # Node runtime 初始化：OTel、mock、lifecycle
│   ├── app/
│   │   ├── layout.tsx               # Root layout
│   │   ├── providers.tsx            # TanStack Query Provider + Toast
│   │   ├── globals.css
│   │   ├── page.tsx                 # 首頁（LoginCard）
│   │   ├── not-found.tsx            # 404（重導向首頁）
│   │   ├── register/page.tsx        # 新管理員帳號建立
│   │   ├── auth/Field.tsx           # 共用表單欄位元件
│   │   ├── AuthRedirectToast.tsx
│   │   ├── LoginCard.tsx
│   │   ├── cms/
│   │   │   ├── layout.tsx           # CMS 版型（側欄 + 頂欄）
│   │   │   ├── CmsSideNav.tsx       # 側欄導航（含 Streamlit 連結）
│   │   │   ├── CmsTopBar.tsx        # 頂欄（用戶資訊、登出）
│   │   │   ├── CmsHomeToast.tsx     # /cms 首頁提示 toast
│   │   │   ├── useSidebarPanel.ts   # 側欄面板開合狀態 hook
│   │   │   ├── page.tsx             # /cms 首頁（ADMIN gate）
│   │   │   ├── admins/              # 管理員管理（SUPER_ADMIN gate）
│   │   │   │   ├── page.tsx
│   │   │   │   ├── api.ts           # Client API（TanStack Query）
│   │   │   │   └── …               # AdminsTable、AdminFormSheet、AdminRoleControl、AdminLifecycleMenu
│   │   │   ├── settings/            # 個人設定（改密碼）：page.tsx、ProfileForm.tsx
│   │   │   └── users/page.tsx       # 重導向 → /cms/admins
│   │   └── api/                     # BFF Route Handlers
│   │       ├── auth/                # login、logout、session
│   │       ├── cms/                 # admins CRUD／role／archive／unarchive／restore、me、me/password
│   │       ├── csrf/route.ts        # GET：取 CSRF token
│   │       └── health/              # /api/health、/api/health/live
│   ├── components/
│   │   └── ui/                      # UI primitives
│   │       ├── BottomSheet.tsx
│   │       ├── EmptyState.tsx
│   │       ├── FallbackImage.tsx
│   │       ├── FormField.tsx
│   │       ├── InlineError.tsx
│   │       ├── Spinner.tsx
│   │       ├── StatusBadge.tsx
│   │       ├── ThemeToggle.tsx
│   │       └── useImageWithFallback.ts
│   └── lib/
│       ├── api/                     # BFF 基礎框架
│       │   ├── create-route.ts      # createRoute：Route Handler 工廠（Zod parse + auth + 統一錯誤）
│       │   ├── create-admin-route.ts# createAdminRoute：SUPER_ADMIN gate 的薄包裝
│       │   ├── backend.ts           # backendFetch：→ 真後端（timeout、request-id、trace 轉發）
│       │   ├── admin-routes.ts      # /api/cms/* handler 實作（route.ts re-export）
│       │   ├── admin-fetch.ts       # 後端 admin payload 驗證 + snake→camel 轉接
│       │   ├── responses.ts         # okResponse、errorResponse
│       │   ├── parsers.ts           # 通用 request parser
│       │   ├── constants.ts         # timeout、refresh lock TTL、body 上限等常數
│       │   ├── request-id.ts
│       │   ├── http-status.ts
│       │   └── index.ts
│       ├── session/                 # iron-session cookie + store
│       │   ├── config.ts
│       │   ├── cookie.ts
│       │   ├── service.ts           # session CRUD（get / save / destroy）
│       │   ├── requireAdmin.ts      # Server 端 auth guard
│       │   ├── types.ts
│       │   └── store/               # Redis store + in-memory 備援
│       ├── security/
│       │   ├── verifyCsrf.ts        # Double Submit Cookie CSRF 驗證
│       │   └── origin.ts            # Origin 白名單檢查
│       ├── auth/
│       │   └── decodeJwtPayload.ts  # JWT payload decode（不驗章）
│       ├── cms/
│       │   └── adminActions.ts      # 管理員列表 row-level 動作規則（純函式）
│       ├── errors/                  # 錯誤型別階層（一類一檔，經 index.ts 匯出）
│       │   ├── BffError.ts          # 基底錯誤（含 error code）
│       │   ├── …                   # ValidationError、UnauthenticatedError、ForbiddenError、
│       │   │                        # CsrfError、NotFoundError、PayloadTooLargeError、
│       │   │                        # ContractViolationError、BackendTimeoutError、
│       │   │                        # BackendUpstreamError、BackendClientError
│       │   ├── toErrorResponse.ts   # 錯誤 → 統一 JSON 回應
│       │   └── globalQueryError.ts  # TanStack Query 全域錯誤攔截
│       ├── schemas/                 # 共用 Zod schema
│       │   ├── auth.ts              # LoginRequest、SessionUser、AdminRoleWire…
│       │   ├── admin.ts             # Admin CRUD schema
│       │   ├── envelope.ts          # API response envelope
│       │   └── pagination.ts
│       ├── theme/
│       │   ├── ThemeProvider.tsx    # 深/淺色主題 context
│       │   ├── readThemeCookie.ts   # SSR 讀取主題 cookie
│       │   └── schema.ts
│       ├── hooks/
│       │   ├── useDebouncedValue.ts
│       │   ├── useUrlSync.ts        # URL searchParams ↔ state 雙向同步
│       │   ├── useViewport.ts
│       │   ├── useScrollPercentSentinel.ts
│       │   ├── useSmartBack.ts      # 跨頁返回導航
│       │   └── useInAppNav.ts
│       ├── observability/
│       │   ├── otel-sdk.ts          # OpenTelemetry SDK 初始化
│       │   └── trace.ts             # Span helper
│       ├── mock/                    # USE_MOCK=1 mock 框架
│       │   ├── dispatch.ts          # mock 路由分派
│       │   ├── register.ts          # mock handler 註冊
│       │   ├── auth-mock.ts
│       │   └── admin-mock.ts
│       ├── client/
│       │   └── csrf.ts              # 瀏覽器端取 CSRF token
│       ├── config.ts                # 環境變數統一讀取與驗證
│       ├── log.ts                   # 結構化 logger
│       ├── lifecycle.ts             # Node runtime 生命週期 hooks
│       ├── date.ts                  # 共用日期格式化
│       └── cn.ts                    # clsx + tailwind-merge
├── tests/
│   ├── e2e/                         # Playwright spec（整體 user flow）
│   ├── mocks/
│   │   ├── handlers.ts              # MSW handlers（unit + BFF 測試共用）
│   │   └── server.ts                # MSW node server（Vitest 用）
│   ├── helpers/                     # backend mock、cookie store、csrf 輔助
│   └── contracts/                   # session store 契約測試
├── .env.example                     # 環境變數範本（含完整說明）
├── Dockerfile                       # 多階段 build（deps / builder / runtime）
├── docker-compose.yml               # 本機 Redis（host port 6380）
├── next.config.ts                   # output: standalone
├── vitest.config.ts
├── vitest.setup.ts
├── playwright.config.ts
├── tsconfig.json
└── package.json
```

---

## 技術選型

| 層級 | 選用 |
|---|---|
| 前端框架 | Next.js 16（App Router、Turbopack 預設） |
| React | React 19.2 |
| 語言 | TypeScript |
| 樣式 | TailwindCSS v4 |
| 資料抓取 | TanStack Query v5（infinite query、全域錯誤攔截） |
| Schema 驗證 | Zod v4 |
| Session | iron-session v8 + Redis（ioredis） |
| Toast | Sonner |
| Observability | OpenTelemetry（OTLP HTTP exporter） |
| 單元 / 整合測試 | Vitest v4 + Testing Library + MSW v2 + happy-dom |
| E2E 測試 | Playwright |
| 套件管理 | pnpm 11.6.0 |
| 容器 | Docker（node:22-alpine）|

詳細決策依據見 [`docs/decisions/`](./docs/decisions/)（ADR）。

---

## 頁面與 BFF Route 總覽

### 頁面

| 路徑 | 說明 | 存取控制 |
|---|---|---|
| `/` | 首頁（LoginCard） | 公開 |
| `/register` | 新管理員帳號建立 | 公開 |
| `/cms` | CMS 後台首頁 | ADMIN |
| `/cms/admins` | 管理員管理（列表、新增、升降權、封存） | SUPER_ADMIN |
| `/cms/settings` | 個人設定（改密碼） | ADMIN |
| `/cms/users` | 重導向 → `/cms/admins` | ADMIN |

### BFF Route Handlers

| 方法 | 路徑 | 說明 |
|---|---|---|
| `POST` | `/api/auth/login` | Admin 登入（與真後端換取 JWT；存入 BFF session） |
| `POST` | `/api/auth/logout` | 登出（清 BFF session + 撤銷後端 refresh token） |
| `GET` | `/api/auth/session` | Session introspection（供 Streamlit 端查詢登入狀態） |
| `GET` | `/api/csrf` | 取 CSRF token（Double Submit Cookie 機制） |
| `GET` | `/api/health` | 健康檢查（含版本、commit、Redis 連線狀態） |
| `GET` | `/api/health/live` | Liveness probe（ECS / K8s 用） |
| `GET` | `/api/cms/admins` | 管理員列表（分頁） |
| `POST` | `/api/cms/admins` | 新增管理員 |
| `GET` | `/api/cms/admins/[id]` | 取單一管理員 |
| `PATCH` | `/api/cms/admins/[id]` | 更新管理員資料 |
| `DELETE` | `/api/cms/admins/[id]` | 刪除管理員 |
| `PUT` | `/api/cms/admins/[id]/role` | 升降權（SUPER_ADMIN 限定） |
| `POST` | `/api/cms/admins/[id]/archive` | 封存管理員 |
| `POST` | `/api/cms/admins/[id]/unarchive` | 解封存管理員 |
| `POST` | `/api/cms/admins/[id]/restore` | 復原已刪除管理員 |
| `GET` | `/api/cms/me` | 目前登入者資料 |
| `POST` | `/api/cms/me/password` | 修改密碼 |

---

## API 文件

| 文件 | 位址 | 說明 |
|---|---|---|
| BFF Route Handlers | 上方〈[頁面與 BFF Route 總覽](#頁面與-bff-route-總覽)〉 | 瀏覽器實際呼叫的 API（本 repo） |
| 後端 Swagger UI | http://localhost:8000/docs | FastAPI 自動生成的互動式文件 |
| 後端 ReDoc | http://localhost:8000/redoc | 同一份 OpenAPI 的閱讀版 |
| 後端 OpenAPI schema | http://localhost:8000/openapi.json | 供工具匯入（Postman、codegen） |

> 後端為內網 domain API：瀏覽器端一律走 BFF（`/api/*`），不要直接呼叫後端。後端文件位址以本機 `docker compose` 部署為準（port 8000），其他環境請替換 host。

---

## 骨架能力（可重用基建）

### `src/lib/api/` — BFF Route Handler 框架

- **`createRoute`**（`create-route.ts`）：Route Handler 工廠，統一處理 Zod parse（query / body / params）、auth guard、CSRF、錯誤回應格式化
- **`createAdminRoute`**（`create-admin-route.ts`）：`createRoute` 的薄包裝，強制登入並要求 SUPER_ADMIN 以上權限（`/api/cms/admins*` 用）
- **`backendFetch`**（`backend.ts`）：向真後端發送請求，含 timeout、request-id 轉發、`USE_MOCK` 旁路
- **`admin-fetch.ts` / `admin-routes.ts`**：後端 admin payload 驗證與 snake→camel 轉接、`/api/cms/*` handler 實作
- **`okResponse` / `errorResponse`**：標準化 JSON envelope `{ data }` / `{ error: { code, message } }`

### `src/lib/session/` — Session 管理

- iron-session cookie（簽章加密）+ Redis session store（ioredis）
- in-memory store 備援（`USE_MOCK=1` 或 test 環境）
- 金鑰輪替：`SESSION_SECRET` + `SESSION_SECRET_PREVIOUS` 雙金鑰窗口
- **`requireAdmin(role?)`**：Server 端 auth guard，不符合直接 throw `UnauthorizedError`

### `src/lib/observability/` — 可觀測性

- **OpenTelemetry**：`otel-sdk.ts` 初始化 SDK（OTLP HTTP exporter）
- **`trace.ts`**：Span helper + W3C trace-context / baggage headers 轉發
- Trace context 隨 `backendFetch` 傳遞至真後端，串接分散式追蹤鏈

### `src/lib/security/` — 安全防護

- **`verifyCsrf`**：Double Submit Cookie 模式，搭配 `/api/csrf` 端點
- **`checkOrigin`**：CORS origin 白名單驗證（`ALLOWED_ORIGINS`）

### `src/lib/errors/` — 錯誤標準化

錯誤型別階層（一類一檔，經 `errors/index.ts` 匯出）：

`BffError`（基底，含 error code）→ `ValidationError`、`UnauthenticatedError`、`ForbiddenError`、`CsrfError`、`NotFoundError`、`PayloadTooLargeError`、`ContractViolationError`、`BackendTimeoutError`、`BackendUpstreamError`、`BackendClientError`

所有 Route Handler 錯誤經 `toErrorResponse` 轉換為統一 JSON 格式；Client 端由 TanStack Query `handleGlobalQueryError` 顯示 Toast。

### `src/lib/hooks/`

| Hook | 用途 |
|---|---|
| `useDebouncedValue` | 搜尋 debounce |
| `useUrlSync` | URL searchParams ↔ React state 雙向同步（返回時還原） |
| `useViewport` | Viewport 寬度監聽 |
| `useScrollPercentSentinel` | Infinite scroll 觸發 |
| `useSmartBack` | App 內跨頁返回（history.back vs. push to fallback） |
| `useInAppNav` | 偵測是否從 App 內導航 |

### `src/lib/mock/` — Mock 框架

`USE_MOCK=1` 時，`backendFetch` 轉向 `lib/mock/dispatch` 回傳 fixture，無需真後端或 Redis。Playwright e2e 固定帶 `USE_MOCK=1` 啟動 dev server，確保 e2e 不依賴外部服務。

### `src/components/ui/` — UI Primitives

`Spinner`、`EmptyState`、`InlineError`、`BottomSheet`、`FallbackImage`、`FormField`、`ThemeToggle`、`StatusBadge`

---

## 測試

### 架構

```
src/<feature>/<name>.ts
src/<feature>/<name>.test.ts     # 與被測檔案 colocate
tests/
├── e2e/<feature>.spec.ts        # Playwright（整體 user flow）
├── mocks/
│   ├── handlers.ts              # MSW handlers（unit + BFF 共用）
│   └── server.ts                # MSW node server（Vitest 用）
└── helpers/
```

### 覆蓋率目標

| 範圍 | 目標 |
|---|---|
| `src/lib/`（utils、schemas、api wrapper） | ≥ 90% lines |
| `src/app/api/`（Route Handlers） | ≥ 85% lines |
| 功能元件邏輯（目前 colocate 於 `src/app/` 下；未來抽出至 `src/components/features/`） | ≥ 80% lines |
| `src/components/ui/`（純展示） | 無下限（e2e 補關鍵路徑） |

### TDD 強制範圍

| 類型 | 嚴格度 |
|---|---|
| Pure functions / hooks / utils | 強制 TDD |
| Zod schema | 強制 TDD（happy path + edge cases） |
| BFF Route Handler | 強制 TDD（含錯誤路徑） |
| Client 元件邏輯（搜尋 debounce、URL sync） | 強制 TDD |
| 純 UI / 排版 / 樣式 | 可後補（e2e 補關鍵畫面） |
| 整體 user flow | PR 前必須有 Playwright spec |

---

## 部署

### Docker（多階段 build）

```
deps     → pnpm install --frozen-lockfile
builder  → pnpm build（Next.js standalone output）
runtime  → node:22-alpine，僅複製 standalone tree，non-root user（nextjs:1001）
```

```bash
# 本機建立 image
docker build \
  --build-arg NEXT_PUBLIC_APP_NAME=StreamSight \
  --build-arg NEXT_PUBLIC_ENABLE_THEME_TOGGLE=0 \
  --build-arg BUILD_GIT_SHA=$(git rev-parse --short HEAD) \
  -t streamsight-frontend .

# 執行（掛載 runtime env）
docker run -p 3000:3000 \
  -e SESSION_SECRET=<your-secret> \
  -e BACKEND_API_URL=http://api:8000 \
  -e REDIS_HOST=redis \
  -e REDIS_PORT=6379 \
  -e ALLOWED_ORIGINS=https://app.example.com \
  streamsight-frontend
```

### 本機開發用 Redis

```bash
docker compose up -d redis   # Redis on host port 6380
```

### CI/CD Pipeline（`.github/workflows/pipeline.yml`）

| Job | 觸發條件 | 說明 |
|---|---|---|
| `lint-typecheck` | 所有 PR / push | ESLint + `tsc --noEmit` |
| `test` | 所有 PR / push | Vitest + 覆蓋率（Redis service，USE_MOCK=1） |
| `e2e` | 所有 PR / push | Playwright（Chromium + WebKit，Redis service） |
| `build` | 所有 PR / push | Next.js production build（驗證 env 正確） |
| `deploy` | 僅 main 通過所有 Job | 建 Docker image → 推 ECR → 更新 ECS task def → 滾動部署 |

### AWS ECS

`infra/` 目錄含 Terraform 設定。CI/CD pipeline 透過 `infra/` 的設定部署至 ECS。

> **注意**：`infra/` 內的 ECS cluster / service / ALB DNS / SecretsManager 識別符，實際上線前需對照重建後的 AWS 資源調整。

---

## Streamlit 整合

StreamSight 同時部署了一個 Streamlit dashboard，兩個 app 共享同一登入狀態：

1. **Session introspection**：Streamlit 端呼叫 `GET /api/auth/session` 取得登入者資訊
   - 需帶 `Origin` header（在 `ALLOWED_ORIGINS` 白名單內）
   - 需帶 `X-CSRF-Token` header（先呼叫 `GET /api/csrf` 取得）
2. **登出同步**：Streamlit 呼叫 `POST /api/auth/logout` 清除 BFF session
3. **CMS sidebar 連結**：`STREAMLIT_BASE_URL` 設定 Streamlit app 位址；空白時退回同源相對路徑

---

## 新增業務功能

以 feature 為單位，在骨架上垂直生長：

```
# 1. BFF Route Handler
src/app/api/<feature>/route.ts         # createRoute 建立
src/app/api/<feature>/route.test.ts    # Vitest + MSW

# 2. Zod schema
src/lib/schemas/<feature>.ts
src/lib/schemas/<feature>.test.ts

# 3. 頁面
src/app/<feature>/page.tsx

# 4. Client API（TanStack Query）
src/app/<feature>/api.ts

# 5. 元件
src/components/features/<feature>/   # 目錄尚未建立；跨頁共用元件抽到此處，
                                     # 頁面專屬元件則與 page.tsx colocate（現行慣例，如 cms/admins/）
```

遵循 TDD 流程：先建測試（紅）→ 最小實作（綠）→ 重構。

---

## 文件

| 文件 | 說明 |
|---|---|
| [`docs/architecture.md`](./docs/architecture.md) | BFF 架構、資料流、資料夾結構詳解 |
| [`docs/specs/`](./docs/specs/) | 基建實作規格（001x BFF/session/CSRF、005–017） |
| [`docs/decisions/`](./docs/decisions/) | ADR（架構決策紀錄） |
| [`.env.example`](./.env.example) | 完整環境變數清單（含分組說明） |
| [`CLAUDE.md`](./CLAUDE.md) | Claude Code 操作規範（TDD 規則、提交流程） |

---

最後更新：2026-07-19
