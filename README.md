# JKODonation — Frontend

2026 全端面試作業：捐款項目列表（公益團體）。
本目錄為 **Next.js 16（App Router）+ BFF** 前端應用。

> 設計稿：Figma《2026 全端面試作業 - web》

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
- **資料**:TanStack Query v5(infinite query)· Zod v4
- **BFF**(Route Handlers `src/app/api/*`,對外隱藏真後端):
  - iron-session(cookie session)+ Redis(ioredis)session store
  - CSRF 防護(`verifyCsrf`)· 登入 / 註冊 auth
  - mock 模式(`USE_MOCK`)· `server-only` 邊界 · `sonner` toast
- **測試**:Vitest + Testing Library + MSW(unit / BFF)· Playwright(e2e)
- **部署**:`output: "standalone"` + Dockerfile + docker-compose · pnpm

> 註:專案脈絡文件曾提及 React Compiler,但目前 `next.config.ts` **未啟用**(無對應設定與依賴)。

## 頁面與 BFF Route

**頁面(`src/app/*/page.tsx`)**:`/`(首頁 + 登入)· `/register` · `/donation`(列表)· `/charities/[id]` · `/donation-projects/[id]` · `/sale-items/[id]` · `/checkout/donation` · `/checkout/purchase` · `/cms`(+ `/cms/charities`、`/new`、`/[id]/edit`)

**BFF Route(`src/app/api/*/route.ts`,16 條)**:`auth/login`、`auth/register`、`csrf`、`categories`、`charities`(+`[id]`)、`donations`(+`[id]`)、`items`(+`[id]`)、`checkout/donation`、`checkout/purchase`、`cms/charities`(+`[id]`)、`health`(+`health/live`)

## 部署

`next.config.ts` 用 `output: "standalone"` 產出精簡 Node server;搭配 `Dockerfile` + `docker-compose.yml`(含 Redis on 6380)。詳見專案根 [ADR 010](../docs/decisions/)。

## 文件

- [`docs/brief.md`](./docs/brief.md) — 作業需求、畫面盤點、範圍
- [`docs/architecture.md`](./docs/architecture.md) — BFF 架構、資料流、資料夾結構
- [`docs/specs/`](./docs/specs/) — API / UI 實作規格（持續補上）
- 專案根 `/docs/decisions/` — ADR（架構決策紀錄）

---

## AI 使用聲明

本專案在開發過程中使用 AI 工具輔助。

### 使用的 AI 工具
- Claude（[Claude Code](https://claude.com/claude-code) CLI，模型：Opus 4.8）

### AI 角色
BFF 架構討論、Zod schema 與 Route Handler 的按規格 TDD 實作、元件骨架生成、code review。

### 人工角色
需求理解、畫面盤點、架構決策、實作驗收、跨 spec 一致性把關。

### Prompt 紀錄
代表性 Prompt 對話見專案根 [`/docs/prompts/`](../docs/prompts/)（raw + 精選版）。
