# StreamSight — Frontend

**Next.js 16（App Router）+ BFF** 前端骨架。

本 repo 已剝除原業務功能，只保留可重用的基礎架構：BFF Route Handler 框架、
iron-session + Redis session、CSRF 防護、登入 / 註冊 auth、錯誤標準化、mock
框架、測試與部署設定。新功能垂直（list / detail / …）在此骨架上長出來。

---

## Quick Start

```bash
pnpm install
cp .env.example .env.local

# 必填:iron-session 每個 cookie 都要簽章,SESSION_SECRET 一定要設(即使 USE_MOCK=1)
#   在 .env.local 填入:SESSION_SECRET=$(openssl rand -base64 48)

# 預設 USE_MOCK=1 → 用內建 mock,不需真後端 / Redis 即可開發
pnpm dev                        # http://localhost:3000
```

跑真後端(`USE_MOCK=0`)時,額外需要:
- `BACKEND_API_URL`(預設 `http://localhost:3001`)指向 backend
- Redis 當 session store:`docker compose up -d redis`(對外 port 6380)

## 環境變數

完整清單見 [`.env.example`](.env.example)(註解分組說明)。重點:

| 變數 | 必填 | 說明 |
|---|---|---|
| `SESSION_SECRET` | ✅(≥32 字元) | iron-session cookie 簽章金鑰。`openssl rand -base64 48` |
| `USE_MOCK` | — | `1`(預設)走內建 mock;`0` 打真後端 |
| `BACKEND_API_URL` | `USE_MOCK=0` 時 | BFF → backend base URL |
| `REDIS_HOST` / `REDIS_PORT` | `USE_MOCK=0` 時 | BFF session store(本機 `docker compose up -d redis`,port 6380) |
| `ALLOWED_ORIGINS` | ✅(prod) | CSRF 允許來源(逗號分隔;prod 需含非 localhost) |

## Scripts

| 指令 | 用途 |
|---|---|
| `pnpm dev` | 啟動開發伺服器(Turbopack) |
| `pnpm build` | 產出 production build(`output: standalone`) |
| `pnpm start` | 跑 production build |
| `pnpm lint` | ESLint |
| `pnpm typecheck` | `tsc --noEmit` |
| `pnpm test` | Vitest 跑一次 |
| `pnpm test:watch` | Vitest watch(TDD 主力) |
| `pnpm test:ui` | Vitest UI |
| `pnpm test:coverage` | Vitest + 覆蓋率 |
| `pnpm test:e2e` | Playwright e2e |
| `pnpm test:e2e:ui` | Playwright UI 模式 |

## Tech Stack

- **框架**:Next.js 16(App Router、Turbopack 預設)· React 19.2 · TypeScript · TailwindCSS v4
- **資料**:TanStack Query v5 · Zod v4
- **BFF**(Route Handlers `src/app/api/*`,對外隱藏真後端):
  - iron-session(cookie session)+ Redis(ioredis)session store
  - CSRF 防護(`verifyCsrf`)· 登入 / 註冊 auth
  - mock 模式(`USE_MOCK`)· `server-only` 邊界 · `sonner` toast
- **測試**:Vitest + Testing Library + MSW(unit / BFF)· Playwright(e2e)
- **部署**:`output: "standalone"` + Dockerfile + docker-compose · pnpm

> 註:專案脈絡文件曾提及 React Compiler,但目前 `next.config.ts` **未啟用**(無對應設定與依賴)。

## 目前保留的頁面與 BFF Route

**頁面(`src/app/*/page.tsx`)**:`/`(首頁 + 登入卡)· `/register`(註冊)

**BFF Route(`src/app/api/*/route.ts`)**:`auth/login`、`auth/register`、`csrf`、`health`(+`health/live`)

**受保護路由 auth-gate**:`src/proxy.ts` 對 `/cms*` 做 session-cookie optimistic
check(目前是 placeholder 保護區,示範 Next.js 16 Proxy + RSC 雙層驗證 pattern)。

## 骨架能力(可重用基建)

- **`src/lib/api/`** — BFF Route Handler 框架:`createRoute`(query/body/params
  parse + 統一錯誤)、`backendFetch`(→ 真後端,含 timeout)、`okResponse`、
  `parsers`、`request-id`、`http-status`
- **`src/lib/session/`** — iron-session cookie + Redis / in-memory store、
  `requireAdmin`
- **`src/lib/security/`** — CSRF(`verifyCsrf`)、origin 檢查
- **`src/lib/errors/`** — 錯誤型別階層 + `toErrorResponse` + 全域 query error
- **`src/lib/hooks/`** — `useDebouncedValue`、`useUrlSync`、`useViewport`、
  `useScrollPercentSentinel`、`useSmartBack`、`useInAppNav`
- **`src/components/ui/`** — primitives:`Spinner`、`EmptyState`、`InlineError`、
  `BottomSheet`、`FallbackImage`
- **`src/lib/mock/`** — `USE_MOCK=1` 的 mock dispatch 框架(目前只註冊 auth bridge)

## 部署

`next.config.ts` 用 `output: "standalone"` 產出精簡 Node server;搭配 `Dockerfile` +
`docker-compose.yml`(含 Redis on 6380)。

> ⚠️ `.aws/task-definition.json` 與 `.github/workflows/pipeline.yml` 內的 ECS
> cluster / service / ALB DNS / SecretsManager 等識別符沿用舊部署的實體資源命名
> (僅字串已改為 `streamsight`),實際上線前需對照重建後的 AWS 資源。

## 文件

- [`docs/architecture.md`](./docs/architecture.md) — BFF 架構、資料流、資料夾結構
- [`docs/specs/`](./docs/specs/) — 基建實作規格(001x BFF / session / CSRF、005 首頁 auth、006 錯誤處理、007 註冊、010 auth-gate)
- [`docs/decisions/`](./docs/decisions/) — ADR(架構決策紀錄)
