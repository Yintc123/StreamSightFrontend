# CLAUDE.md — frontend/

@AGENTS.md

本檔為 Claude Code 在 `frontend/` 啟動時的指示。
與專案根 `CLAUDE.md` 並存，本檔規則優先於根檔。

> **用繁體中文回應。**

> 上面 `@AGENTS.md` 是 Next.js 16 `create-next-app` 帶來的官方 agent 規範引用，提醒 Next.js 16 與訓練資料可能有 breaking changes，動手前先讀 `node_modules/next/dist/docs/`。

---

## 專案脈絡

- Next.js 16（App Router、Turbopack 預設、React Compiler 啟用）
- React 19.2、TypeScript、TailwindCSS
- 資料抓取：TanStack Query（infinite query）
- 驗證：Zod
- BFF：Route Handlers（`src/app/api/*`），對外隱藏真後端
- 套件管理：pnpm

詳細架構：`docs/architecture.md`
作業需求：`docs/brief.md`

---

## 開發流程：TDD（Test-Driven Development）

### 紅 → 綠 → 重構

1. **紅**：先寫測試，跑 → **必須失敗**（編譯錯誤或斷言失敗都算）
2. **綠**：寫最小實作讓測試通過，**不多寫一行**
3. **重構**：在測試保護下整理結構、命名、抽出共用邏輯

### 強制 vs 可豁免

| 類型 | TDD 嚴格度 | 工具 |
|---|---|---|
| Pure functions / hooks / utils | **強制 TDD** | Vitest |
| Zod schema | **強制 TDD**（happy path + edge cases） | Vitest |
| BFF Route Handler（`app/api/*`） | **強制 TDD**（含錯誤路徑） | Vitest + MSW |
| Client components 邏輯（搜尋 debounce、infinite scroll 觸發、URL sync） | **強制 TDD** | Vitest + Testing Library |
| Pure UI / 排版 / 視覺樣式 | **可後補**（先刻，e2e 補關鍵畫面） | Playwright（e2e） |
| 整體 user flow（列表→搜尋→無結果→無限滾動） | **PR 前必須有** | Playwright |
| Prototype / 探索期 | **豁免**，但 commit message 註明 `[prototype]` | — |

> 邏輯類與資料類絕不豁免；視覺類可彈性。

---

## 測試工具鏈

### 安裝套件

```bash
pnpm add -D vitest @vitejs/plugin-react @vitest/coverage-v8 @vitest/ui \
  @testing-library/react @testing-library/user-event @testing-library/jest-dom \
  happy-dom msw \
  @playwright/test
```

### 指令

| 指令 | 用途 |
|---|---|
| `pnpm test` | 跑 Vitest 一次 |
| `pnpm test:watch` | watch mode（TDD 主要使用） |
| `pnpm test:ui` | Vitest Browser UI |
| `pnpm test:coverage` | 跑測試 + 覆蓋率 |
| `pnpm test:e2e` | 跑 Playwright |
| `pnpm test:e2e:ui` | Playwright UI 模式 |

### 設定檔位置

```
frontend/
├── vitest.config.ts             # Vitest 設定（用 happy-dom）
├── vitest.setup.ts              # 全域 setup：@testing-library/jest-dom、MSW server
├── playwright.config.ts         # Playwright 設定
└── tests/
    ├── e2e/                     # Playwright spec
    └── mocks/
        ├── handlers.ts          # MSW handlers（unit + e2e 共用）
        └── server.ts            # node MSW server（Vitest 用）
```

---

## 測試檔案組織

### Colocate 原則

測試與被測檔案放同層：

```
src/
├── lib/api/
│   ├── client.ts
│   └── client.test.ts              # ✅ colocated
├── components/ui/
│   ├── CharityCard.tsx
│   └── CharityCard.test.tsx        # ✅ colocated
└── app/api/charities/
    ├── route.ts
    └── route.test.ts               # ✅ colocated
```

E2E 不 colocate，集中放 `tests/e2e/`。

### 命名

- 單元 / 整合：`<檔名>.test.{ts,tsx}`
- E2E：`<feature>.spec.ts`
- Setup：`vitest.setup.ts`、`playwright.global.setup.ts`

---

## 工作流程細節（Claude 該做什麼）

### 開始寫一個新功能

1. **不要**先建實作檔
2. **先**建 `<檔名>.test.ts(x)`，寫第一個失敗測試
3. 跑 `pnpm test:watch <檔名>` 確認 fail
4. 建實作檔，最小程式碼讓測試通過
5. 跑測試 → 綠
6. 加下一個測試案例，回到步驟 3

### 修 Bug

1. **先**寫一個能重現 bug 的測試 → 紅
2. 改 code → 綠
3. 不刪這個測試（避免回歸）

### 修改既有功能

1. 確認既有測試覆蓋該功能
2. 沒覆蓋 → 先補測試（描述現狀） → 再改 → 確保改完測試仍 pass 或調整斷言反映新行為

---

## 覆蓋率門檻

| 範圍 | 目標 |
|---|---|
| `src/lib/` （utils、schemas、api wrapper） | ≥ 90% lines |
| `src/app/api/` （Route Handlers） | ≥ 85% lines |
| `src/components/features/` | ≥ 80% lines |
| `src/components/ui/`（純展示） | 無下限（看 e2e） |

CI 不設硬性 fail 門檻（避免 7 天作業被卡住），但 PR description 報告覆蓋率變化。

---

## 提交前檢查

commit 前 Claude **必須**先跑：
1. `pnpm lint`
2. `pnpm test`
3. 若改了 UI 或 user flow：`pnpm test:e2e`

任一失敗 → 不 commit，先修。

---

## MSW 使用約定

BFF Route Handler 測試與 client 測試**共用 MSW handlers**：

```ts
// tests/mocks/handlers.ts
import { http, HttpResponse } from 'msw'
export const handlers = [
  http.get('/api/charities', ({ request }) => {
    const url = new URL(request.url)
    const q = url.searchParams.get('q') ?? ''
    return HttpResponse.json({ items: fakeData(q), nextCursor: null })
  }),
]
```

`vitest.setup.ts` 啟動 node server；Playwright 用 browser worker。

---

## 與 Next.js 16 特性的搭配

- **Cache Components / `use cache`**：被 cache 的 RSC 邏輯主要靠整合測試驗證（透過 BFF 入口），不直接 unit 測試 server-only function 內部
- **Server Actions**：用 Vitest 直接呼叫 action 函式測（不經 HTTP）
- **React Compiler**：自動 memoization 不影響測試行為；不需特別 mock

---

## 例外與豁免

允許**暫時**跳過 TDD 的情況：
- 寫 prototype / spike 探索方案（commit 註明 `[prototype]`，下一個 PR 補測試）
- 純樣式調整（不改邏輯）
- 升級依賴版本（除非升版改 API 行為）

豁免**不適用於**：
- 修 bug（必須先寫 regression test）
- 改既有功能行為
- 新增 Route Handler、hook、Zod schema

---

## 提醒使用者的時機

1. 使用者要求「先寫元件」時，反問：「測試要先嗎？這屬於強制 TDD 範圍嗎？」
2. 跑測試前確認 `pnpm test:watch` 已開
3. 大段重構前先確認測試覆蓋足夠，否則先補
4. PR 前提醒跑 e2e

---

最後更新：2026-06-13
