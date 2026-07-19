# Spec 017 — 404 全域重導首頁

- **狀態**：待實作
- **影響範圍**：
  - `src/app/not-found.tsx`（新增）
  - `src/app/not-found.test.tsx`（新增）
- **依賴**：無

---

## 1. 背景與目標

目前所有未匹配的路由（如 `/foo`、`/cms/nonexistent`）會顯示 Next.js 預設的白底 404 頁，
沒有品牌外觀也沒有任何引導動作，使用者體驗差且無法自行離開。

**目標**：讓所有 404 頁面**自動重導回首頁（`/`）**，保持使用者流程不中斷。

---

## 2. 範圍

| 項目 | 說明 |
|------|------|
| `src/app/not-found.tsx`（新增） | App Router 全域 404 元件，立即 `redirect('/')` |
| `src/app/not-found.test.tsx`（新增） | 驗證元件呼叫 `redirect('/')` |

**不在範圍內**：

- API 路由（`/api/*`）— 保留 Next.js 預設 JSON 404 回應，不影響 BFF 呼叫方
- 特定動態路由內的 `notFound()` 呼叫 — 目前專案無此用法，未來有需要另立 spec
- `global-not-found.tsx`（experimental，v15.4.0+）— 專為多根 layout 設計，本專案單一根 layout 無需使用

---

## 3. 行為說明

### 3.1 觸發條件

Next.js App Router 在以下情況渲染最近的 `not-found.tsx`：

1. **路由不存在**：瀏覽器訪問任何不在 `src/app/` 定義的路徑（如 `/foo`、`/cms/xyz`）
2. **頁面元件呼叫 `notFound()`**：Server Component 明確宣告資源不存在（目前無，但未來適用）

兩種情況均由 `src/app/not-found.tsx` 接住，執行 `redirect('/')` 送回首頁。

### 3.2 行為矩陣

| 情境 | 實作前 | 實作後 |
|------|--------|--------|
| `/foo`（不存在路由） | 白底 Next.js 404 頁 | 307 → `/` |
| `/cms/nonexistent`（不存在子路由） | 白底 Next.js 404 頁 | 307 → `/` |
| `/api/nonexistent` | JSON `{ message: "Not Found" }` | 不變（API 路由不受影響）|
| `notFound()` 被呼叫的動態路由 | N/A（目前無） | 同上，觸發時 → `/` |

> **注意**：`/cms/*` 路由由 `src/proxy.ts` 的 auth 閘道先行攔截；
> 無 session cookie 時在 proxy 層就已被重導至 `/?reason=cms-auth`，
> 不會抵達 `not-found.tsx`。
> 有 session cookie 但路徑不存在的情況，才由 `not-found.tsx` 接住。

---

## 4. 實作

### 4.1 TDD 流程（先寫測試）

依 CLAUDE.md TDD 規範：**先建測試、確認紅，再建實作、確認綠**。

#### §4.1.1 先建測試

```tsx
// src/app/not-found.test.tsx
import { describe, it, expect, vi } from 'vitest'

// 對齊專案既有模式（見 src/lib/session/requireAdmin.test.ts）：
// mock 讓 redirect() 拋出可識別的錯誤，方便在 toThrow() 斷言。
const redirectMock = vi.fn((path: string): never => {
  throw new Error(`REDIRECT:${path}`)
})
vi.mock('next/navigation', () => ({
  redirect: (path: string) => redirectMock(path),
}))

import NotFound from './not-found'

describe('not-found', () => {
  it('redirects to /', () => {
    expect(() => NotFound()).toThrow(/REDIRECT/)
    expect(redirectMock).toHaveBeenCalledWith('/')
  })
})
```

跑 `pnpm test not-found` → 應見 **紅（找不到 `./not-found` 模組）**。

#### §4.1.2 再建實作

```tsx
// src/app/not-found.tsx
import { redirect } from 'next/navigation'

export default function NotFound(): never {
  redirect('/')
}
```

跑 `pnpm test not-found` → 應見 **綠**。

### 4.2 模式依據

與 `src/app/register/page.tsx`（Spec 012b §1.2）完全相同模式——
保留路由但永久導回首頁，對舊書籤 / 外連友善。

---

## 5. 測試策略

| 層 | 內容 | 工具 | TDD 嚴格度 |
|----|------|------|------------|
| Unit | `not-found.tsx` 呼叫 `redirect('/')` | Vitest | **強制** |
| E2E | 訪問 `/nonexistent` 最終落在 `/`，LoginCard 可見 | Playwright | PR 前補 |

E2E 測試建議加入 `tests/e2e/not-found.spec.ts`，驗證：

```
1. 瀏覽器訪問 /nonexistent-path
2. 最終 URL 為 /
3. 頁面可見 LoginCard（data-component="LoginCard" 或 heading "StreamSight"）
```

---

## 6. 提交前檢查

1. `pnpm lint` → 無 error
2. `pnpm test` → 全綠（含新增的 `not-found.test.tsx`）
3. 手動訪問 `http://localhost:3000/nonexistent` → 重導至 `/`
4. 若改了 E2E spec：`pnpm test:e2e` → 全綠

---

## 7. 後續（OQ）

- **E2E spec**：本 spec 優先補 unit，E2E 可在下一個 PR 補入 `tests/e2e/not-found.spec.ts`
- **`?reason=not-found` toast**：目前重導首頁無額外 toast；若產品決定要提示「頁面不存在」，
  可參考 `AuthRedirectToast` 模式在首頁加 toast，不需改動 `not-found.tsx`

---

*最後更新：2026-07-19*
