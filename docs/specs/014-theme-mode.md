# Spec 014 — 深/淺色主題模式（一鍵切換）｜總覽索引

狀態：**規格定案，dev-ready（未實作）**（v0.3，2026-07-18）

讓使用者以**單一按鈕**在深色 / 淺色主題間切換，偏好以**獨立持久 cookie** 保存，
SSR 首屏直接畫對顏色（無閃爍），且**不受登入 / 登出影響**。

> 目前全站固定深色（`globals.css` 的「深色觀測台」設計系統）。本規格在**不改動任一元件 class**
> 的前提下，讓同一組語義 token 能在深 / 淺兩套值間切換。

> **v0.3 起本規格拆為兩份可獨立實作的子規格**（沿用 012a/b、013a/b 慣例）。
> 本檔僅保留總覽、拆分邊界與跨檔契約；細節見子規格。

---

## 子規格

| 規格 | 主題 | 內容 |
|---|---|---|
| [**014a — 業務邏輯**](./014a-theme-logic.md) | 狀態 / 持久化 / SSR | 狀態模型、`theme` cookie（登出不清）、SSR 直出防閃爍、`ThemeProvider`/`useTheme`、token 間接引用機制、server-only 邊界、邏輯類 TDD |
| [**014b — UI 元件**](./014b-theme-ui.md) | 元件 / 視覺 | `ThemeToggle`、淺色調色盤色值、`globals.css` 覆寫、放置點排版、`color-scheme` / Toaster 跟隨、過渡動畫、元件 TDD + e2e |

## 拆分邊界

- **014a 定義機制與 API**：`useTheme()`、`<html data-theme>` / `data-theme-ready` 契約、cookie 讀寫。
- **014b 為消費端**：以 014a 的 API 接視覺（色值、元件、Toaster、動畫）。
- **共用檔** `src/app/providers.tsx`：包 `ThemeProvider` + 收 `initialTheme` 屬 014a；
  `<Toaster>` 改讀 `useTheme` 屬 014b。

## 跨檔契約（實作務必對齊）

1. **`data-theme`**：014a 於 `<html>` SSR 直出並在切換時即改；014b 的 CSS 以 `html[data-theme="light"]` 覆寫。
2. **`data-theme-ready`**：014a 的 `ThemeProvider` mount 後掛上；014b 的過渡動畫僅作用於 `html[data-theme-ready]`（首屏 FOUC guard）。
3. **`useTheme()`**：014a 匯出 `{ theme, toggle, setTheme }`；014b 的 `ThemeToggle` / Toaster 消費之。

## 建議實作順序

1. **014a**（先）：schema → readThemeCookie → ThemeProvider → layout/providers 接線（紅→綠→重構，皆強制 TDD）。
2. **014b**（後）：globals.css 淺色覆寫 → ThemeToggle（TDD）→ 放置點 → Toaster / 過渡 → e2e。

---

## 決策總表（詳見各子規格）

| 決策 | 內容 | 出處 |
|---|---|---|
| D1 模式數 | 雙態 `dark`⇄`light`（跟隨系統暫不做，OQ-1） | 014a |
| D2 持久化 | 獨立持久 `theme` cookie，登出不清 | 014a |
| D3 防閃爍 | cookie SSR 直出，免 inline script | 014a |
| D4 token 架構 | dark base + `[data-theme="light"]` 覆寫；禁 `@theme inline`、不引入 `dark:` | 機制 014a §3.1／色值 014b §5 |
| D5 切換機制 | client 直改 `dataset.theme` + 寫 cookie，無 round-trip、無 Route Handler | 014a |
| D6 放置點 | 首頁 `header` + `CmsNav`；排版 014b §3.6 | 014b |

### Open Questions（不阻塞開工）

- **OQ-1（三態）** → 014a：未來 cookie 值域擴 `light|dark|system`。
- **OQ-2（淺色色值）** → 014b：§5 初稿，重構階段以 WCAG AA 驗證定稿。
- **OQ-3（root layout 動態化）** → 014a：本期接受動態；未來可改 middleware 邊緣設 `data-theme`。

---

## 變更紀錄

| 版本 | 日期 | 變更 |
|---|---|---|
| 0.1 | 2026-07-18 | 初版：雙態深/淺主題、獨立持久 theme cookie（登出保留）、cookie SSR 直出防閃爍、`[data-theme]` token 覆寫架構、一鍵切換時序與 TDD 計畫。決策 D1–D6 定案；OQ-1~3 待決不阻塞。 |
| 0.2 | 2026-07-18 | 實作前審查修訂：新增實作註記/陷阱（§I-1~7）——client 端 `Secure` 用 `process.env.NODE_ENV`、`schema.ts` 不可 server-only、Toaster 改讀 `useTheme`、`color-scheme` 落點、transition 首屏 FOUC guard、`data-theme="dark"` 免覆寫、root layout 動態化為預期。 |
| 0.3 | 2026-07-18 | **拆分**：本檔改為總覽索引；業務邏輯→[`014a`](./014a-theme-logic.md)、UI 元件→[`014b`](./014b-theme-ui.md)。014b §3.6 新定案 header / `CmsNav` 放置點排版（解決 v0.2 遺留缺口）。 |

---

最後更新：2026-07-18（v0.3，拆分為 014a / 014b）
