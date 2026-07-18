# Spec 014b — 主題 UI 元件與淺色調色盤（元件 / 視覺）

狀態：**已實作（2026-07-18）**（v0.2）
父規格：[`014-theme-mode.md`](./014-theme-mode.md)｜姊妹規格：[`014a-theme-logic.md`](./014a-theme-logic.md)

本規格負責主題功能的**視覺與元件**部分：`ThemeToggle` 元件、淺色調色盤色值、
`globals.css` 覆寫、放置點與排版、`color-scheme` / Toaster 跟隨、過渡動畫。
狀態模型、cookie、`ThemeProvider`/`useTheme` 的 API 由 [`014a`](./014a-theme-logic.md) 提供，本規格為其**消費端**。

---

## 1. 目的與範圍

### 範圍（本規格）

- **淺色調色盤**：為既有語義 token（`--color-*`）補一套 light 值（§5）。
- **`globals.css` 覆寫**：新增 `html[data-theme="light"]` 區塊（依 014a §3.1 的間接引用機制）。
- **`ThemeToggle` 元件**：一鍵按鈕、手寫 inline SVG（sun/moon）、a11y、鍵盤操作。
- **放置點**：首頁 `header` + CMS `CmsNav`（含排版調整，§3.6）。
- **`color-scheme` 跟隨**：原生控件（input / scrollbar / autofill）隨主題。
- **Toaster 跟隨**：sonner `theme` 改讀 `useTheme()`。
- **平滑過渡**：色彩 transition + 首屏 FOUC guard + `prefers-reduced-motion` 尊重。

### 不在範圍（→ 014a）

- 狀態模型 / 值域收斂、cookie 持久化、SSR 直出、`ThemeProvider`/`useTheme` 實作。
- server-only 邊界、root layout 動態化。

### 不在範圍（本期整體）

- 淺色色值**最終**的 WCAG AA 對比度定稿（初稿見 §5，驗證見 OQ-2）。
- 逐元件 `dark:` variant（本庫零用法且不引入）。

---

## 2. 依賴與現況（實查）

| 事實 | 位置 | 對本規格的意義 |
|---|---|---|
| 語義 token 於 `@theme` 定義（dark base） | `src/app/globals.css:18-55` | 覆寫式主題化：只重新指派 `--color-*`，元件 class 一行不改 |
| `color-scheme: dark` 寫死於 `html,body` | `globals.css:90` | 需改為隨主題（§3.2） |
| `<Toaster theme="dark">` 寫死 | `src/app/providers.tsx:71` | 需改為讀當前主題（§3.3） |
| 全庫**零 hardcoded hex、零 `dark:` variant** | `src/**/*.tsx`（實查 0/0） | 覆寫可行且乾淨 |
| **本庫無圖示庫** | `package.json` | ThemeToggle 手寫 inline SVG（參照 `BottomSheet.tsx`／`Spinner.tsx`） |
| `CmsNav` 為 `'use client'`，`ml-auto` 目前掛在 `<span>{name}</span>` | `src/app/cms/CmsNav.tsx:45` | 插入點需重整為容器（§3.6） |
| 首頁 header 為 `justify-center`（標題置中） | `src/app/page.tsx:19` | 加右側 toggle 需保持標題置中（§3.6） |

一般依賴：[`014a`](./014a-theme-logic.md)（`useTheme` API、`data-theme` / `data-theme-ready` 契約）、spec 013b（`CmsNav`）、首頁 `page.tsx` header。

---

## 3. 設計決策

### 3.1 淺色覆寫區塊：`html[data-theme="light"]` 重新指派 `--color-*`

- 依 [`014a §3.1`](./014a-theme-logic.md) 的間接引用機制，新增 `html[data-theme="light"] { … }`，
  僅**重新指派 `--color-*`**（值見 §5）+ `color-scheme: light`。
- `--color-*` 設在 `<html>` 向下 cascade，`bg-surface-page` 等 utility 於 use-site 取當前主題值。
- **`data-theme="dark"` 無需覆寫區塊**（§I-6）：dark = `@theme`/`:root` base，`<html data-theme="dark">`
  不需任何 `[data-theme="dark"]` 規則即正確。
- 非色彩 token（`--font-sans`、`--animate-*`、keyframes）**不隨主題變**，維持於 `@theme`。

### 3.2 `color-scheme` 跟隨（原生控件）

- 現況 `html,body { color-scheme: dark }`（`globals.css:90`）**保留為 base**。
- 於 `html[data-theme="light"] { color-scheme: light; … }` 覆寫（§I-4）。
- **勿**把 `color-scheme` 移進 `@theme`。

### 3.3 Toaster 跟隨（消費 `useTheme`）

- `providers.tsx` 現為 `<Toaster theme="dark">`（寫死）。改成消費 [`014a`](./014a-theme-logic.md) 的 `useTheme()`：
  Toaster 需在 `ThemeProvider` **內層**，以 `theme={theme}` 傳入（或抽一個讀 `useTheme` 的小包裝），
  使切換即時反映到 toast 樣式（§I-3）。

### 3.4 平滑過渡（選配、尊重動效偏好）+ 首屏 FOUC guard

- 於 `color`/`background-color`/`border-color` 加短 transition（~150ms）讓切換不生硬。
- **首屏 FOUC guard**（§I-5）：transition 僅作用於 `html[data-theme-ready]`。
  `data-theme-ready` 由 [`014a`](./014a-theme-logic.md) 的 `ThemeProvider` 於 mount 後掛上 →
  首次載入初始色**不動畫**，只有使用者主動切換才有過渡。
- `@media (prefers-reduced-motion: reduce)` 下移除整段 transition。

### 3.5 `ThemeToggle` 元件設計

- **`'use client'`**；`const { theme, toggle } = useTheme()`（來自 014a）。
- 手寫 inline SVG：`dark` 顯示月亮、`light` 顯示太陽（或反之，表「按了會切到的目標」皆可，於實作定案並反映在 `aria-label`）。
- a11y：
  - `aria-pressed={theme === 'light'}`（反映當前狀態）。
  - `aria-label` 隨主題：「切換為淺色」/「切換為深色」。
  - `<button type="button">`，鍵盤 Enter/Space 原生可觸發。
- 樣式沿用既有 token（`text-ink-AA hover:text-ink-AAA` 等），不寫死顏色。

### 3.6 放置點與排版（**定案：解決 014 v0.2 遺留的排版缺口**）

- **首頁 header**（`page.tsx:19`，現 `justify-center`）：header 改為 `relative`，
  `<h1>` 維持置中，`<ThemeToggle>` 以 `absolute right-[14px] top-1/2 -translate-y-1/2` 疊放右側
  → 標題仍真正置中，不被 toggle 推移。
- **`CmsNav`**（`CmsNav.tsx:45`）：把現有 `<span className="ml-auto …">{name}</span>` 的 `ml-auto`
  上移到新容器 —— `<div className="ml-auto flex items-center gap-2">` 內含 name `<span>`（移除其 `ml-auto`）
  + `<ThemeToggle>`，使兩者靠右並列、間距一致。
- 兩處皆匿名訪客與已登入 admin 可見可切（header 屬未登入頁、`CmsNav` 屬已登入區）。

---

## 4. 檔案與元件清單

| 檔案 | 動作 | 職責 |
|---|---|---|
| `src/components/ui/ThemeToggle.tsx` | 新增 | §3.5：一鍵按鈕、手寫 inline SVG、`aria-label`/`aria-pressed`、鍵盤 Enter/Space；消費 014a `useTheme` |
| `src/app/globals.css` | 改 | §3.1 加 `html[data-theme="light"]` 覆寫區塊（§5 色值）；§3.2 `color-scheme` 覆寫；§3.4 transition + `[data-theme-ready]` guard + `prefers-reduced-motion` |
| `src/app/cms/CmsNav.tsx` | 改 | §3.6：`ml-auto` 容器內加 `<ThemeToggle>` |
| `src/app/page.tsx` | 改 | §3.6：header 改 `relative`，右側 `absolute` 疊放 `<ThemeToggle>` |
| `src/app/providers.tsx` | 改（**與 014a 共用**） | §3.3：`<Toaster>` 改讀 `useTheme()`（`ThemeProvider` 包法由 014a 定） |

---

## 4b. 實作註記 / 陷阱（§I）

- **§I-3 — Toaster 改讀 context**：`ThemeProvider` 需包在 `<Toaster>` **外層**（014a 負責包法）；
  Toaster 改成消費 `useTheme()` 的小包裝，或下沉為 `ThemeProvider` 子節點後以 `theme={theme}` 傳入。
- **§I-4 — `color-scheme` 落點**：`html,body { color-scheme: dark }` 保留為 base；
  另在 `html[data-theme="light"]` 覆寫。**勿**移進 `@theme`。
- **§I-5 — transition 首屏 FOUC**：色彩 transition 會在首次載入對初始色動畫一次（經典 dark-mode 閃色）。
  採「載入後才啟用」guard：transition 僅作用於 `html[data-theme-ready]`；`data-theme-ready` 由 014a 的
  `ThemeProvider` mount 後掛上。`prefers-reduced-motion` 下整段移除。
- **§I-6 — `data-theme="dark"` 無需覆寫區塊**：dark = base，`<html data-theme="dark">` 免任何規則即正確。

---

## 5. 淺色 token 對照（初稿 — 最終值待 AA 對比度驗證，OQ-2）

沿用「電子青」品牌識別，light 版把 accent / 狀態色**加深**以在淺底維持對比。

| Token | dark（現值，維持） | light（初稿） | 說明 |
|---|---|---|---|
| `--color-brand` | `#22d3ee` | `#0891b2` | CTA fill；淺底需加深的 cyan-600 |
| `--color-brand-400` | `#38bdf8` | `#0ea5e9` | hover / 次強調 |
| `--color-brand-overlay` | `rgba(34,211,238,.14)` | `rgba(8,145,178,.12)` | 圖上疊字 |
| `--color-ink-on-brand` | `#06121a` | `#06121a` | 疊在 brand 上的深字（兩套通用） |
| `--color-ink-AAA` | `rgba(230,237,246,.95)` | `rgba(15,23,42,.92)` | primary text（深字疊淺底） |
| `--color-ink-AA` | `rgba(230,237,246,.72)` | `rgba(15,23,42,.66)` | secondary |
| `--color-ink-A` | `rgba(230,237,246,.45)` | `rgba(15,23,42,.45)` | muted / placeholder |
| `--color-ink-link` | `#38bdf8` | `#0e7490` | 連結 |
| `--color-surface-page` | `#0b0f17` | `#f6f8fb` | page bg |
| `--color-surface-card` | `#151c2b` | `#ffffff` | card / sheet bg |
| `--color-line` | `rgba(230,237,246,.12)` | `rgba(15,23,42,.12)` | border / divider |
| `--color-line-soft` | `rgba(230,237,246,.07)` | `rgba(15,23,42,.07)` | 細分隔線 |
| `--color-ok` | `#34d399` | `#059669` | healthy |
| `--color-warn` | `#fbbf24` | `#b45309` | warning |
| `--color-danger` | `#f87171` | `#dc2626` | error |
| `color-scheme` | `dark` | `light` | 原生控件 |

---

## 6. TDD 測試計畫

### 強制 TDD（元件邏輯）

| 目標 | 類型 | 工具 | 關鍵案例 |
|---|---|---|---|
| `ThemeToggle` 互動 | client 元件邏輯 | Vitest + Testing Library + user-event | 點擊 → 呼叫 `useTheme().toggle`；`aria-pressed` 反映當前；`aria-label` 隨主題（「切換為淺色 / 深色」）；鍵盤 Enter/Space 可觸發 |

> 測試時以測試用 `ThemeProvider`（或 mock `useTheme`）包裹 `ThemeToggle`。

### 可後補 / e2e（PR 前）

| 目標 | 工具 | 關鍵畫面 / 流程 |
|---|---|---|
| 一鍵切換 + 持久 | Playwright | 按鈕 → `html[data-theme]` 由 dark→light；reload 後仍 light（cookie 生效） |
| 登出/登入保留 | Playwright | 設 light → 登出 → 登入 → 仍 light（theme cookie 獨立於 session） |
| 淺色調色盤視覺 | Playwright（截圖） | 首頁 + `/cms` 深/淺兩版關鍵畫面 |
| AA 對比度 | 手動 / axe | §5 最終值驗證（OQ-2 收尾） |

> 純樣式（transition、圖示排版、色值）可後補；`ThemeToggle` 互動邏輯**不豁免**。

---

## 7. 決策紀錄與待決

- **D4 token 架構（色值面）**：✅ `@theme` 保留 dark base + `html[data-theme="light"]` 覆寫；色值見 §5。（機制面在 [`014a §3.1`](./014a-theme-logic.md)）
- **D6 放置點**：✅ 首頁 `header` + `CmsNav`（匿名 + 已登入皆可切）；排版於 §3.6 定案。

### Open Questions（不阻塞開工）

- **OQ-2（淺色色值）**：§5 為初稿；實作重構階段以 WCAG AA（正文 4.5:1、大字 3:1）驗證後定稿。

---

## 8. 變更紀錄

| 版本 | 日期 | 變更 |
|---|---|---|
| 0.1 | 2026-07-18 | 自 `014-theme-mode.md` v0.2 拆出「UI 元件 / 視覺」部分：淺色調色盤、`globals.css` 覆寫、`ThemeToggle`、`color-scheme` / Toaster 跟隨、過渡 + FOUC guard、元件 TDD 與 e2e。**新定案 §3.6 放置點排版**（解決原 v0.2 遺留的 header `justify-center` 與 `CmsNav` `ml-auto` 插入細節）。 |
| 0.2 | 2026-07-18 | 狀態更新為「已實作」：`ThemeToggle.tsx`、`globals.css` 淺色覆寫、`color-scheme` 處理、Toaster 跟隨 `useTheme`、FOUC guard、CmsNav / 首頁 header 放置點全部落地，含完整測試。淺色色值仍待 WCAG AA 驗證（OQ-2 維持開放）。 |

---

最後更新：2026-07-18（v0.2，已實作；OQ-2 淺色色值 AA 驗證待完成）
