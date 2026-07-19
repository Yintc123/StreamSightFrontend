# Spec 014a — 主題狀態、持久化與 SSR 直出（業務邏輯）

狀態：**已實作（2026-07-18）**（v0.2）
父規格：[`014-theme-mode.md`](./014-theme-mode.md)｜姊妹規格：[`014b-theme-ui.md`](./014b-theme-ui.md)

本規格負責主題功能的**非視覺**部分：狀態模型、cookie 持久化、SSR/CSR 一致、
即時切換的資料流，以及讓覆寫式主題化「元件一行不改」得以成立的 token **間接引用機制**。
所有**色值、元件、排版、動畫**在 [`014b`](./014b-theme-ui.md)。

---

## 1. 目的與範圍

### 範圍（本規格）

- **狀態模型**：`dark`（預設）⇄ `light` 雙態；值域 / 收斂規則。
- **持久化**：獨立 `theme` cookie（`Max-Age` 一年、`httpOnly:false`、登出不清）。
- **SSR 直出防閃爍**：RootLayout 讀 cookie → `<html data-theme>` first paint 即正確，免 inline script。
- **即時切換資料流**：client 直改 `document.documentElement` + 寫 cookie，**無 round-trip、無 Route Handler**。
- **SSR/CSR 一致**：以伺服器值初始化 `ThemeProvider`，杜絕 hydration mismatch。
- **Token 間接引用機制**：themeable 色彩 token 一律走「utility → `var(--color-*)`」；**禁 `@theme inline`**
  （此機制讓 014b 的覆寫得以 cascade；具體色值不在此規格）。

### 不在範圍（→ 014b）

- 淺色調色盤色值、`globals.css` 的 `[data-theme="light"]` 覆寫內容。
- `ThemeToggle` 元件、放置點（header / `CmsTopBar`，016 v0.4 前為 `CmsNav`）與排版。
- `color-scheme` / Toaster 跟隨的視覺接線、過渡動畫與 FOUC guard 的 CSS。

### 不在範圍（本期整體）

- 三態（跟隨系統 `prefers-color-scheme`）—— 見 §7 OQ-1。
- 伺服器端 per-user 偏好保存（不寫後端、不進 iron-session）。

---

## 2. 依賴與現況（實查）

| 事實 | 位置 | 對本規格的意義 |
|---|---|---|
| Tailwind v4 CSS-first，語義 token 定義於 `@theme`，**無 `@theme inline`** | `src/app/globals.css` | 間接引用機制成立的前提；覆寫可 cascade |
| 全庫**零 hardcoded hex、零 `dark:` variant** | `src/**/*.tsx`（實查 0/0） | 覆寫式主題化「元件一行不改」成立 |
| `<html>` 已有 `suppressHydrationWarning` | `src/app/layout.tsx:20` | `data-theme` 屬性差異不噴 hydration 警告 |
| iron-session cookie：`httpOnly:true`、`maxAge:SESSION_TTL` | `src/lib/session/config.ts` | **theme cookie 另立一條**，屬性不同 |
| 登出以 `clearSessionCookie() → destroy()` 只清 session 那條 | `src/lib/session/cookie.ts:31` | theme cookie 獨立 → 登出/登入主題保留 |
| `src/lib/config.ts` 開頭 `import 'server-only'` | `src/lib/config.ts:1` | client 端**不能** import，`Secure` 判斷改用 `process.env.NODE_ENV`（§I-1） |
| Next 16 官方防閃爍指南 | `node_modules/next/dist/docs/01-app/02-guides/preventing-flash-before-hydration.md` | cookie 方案 = 伺服器直出，優於 localStorage + inline script |

一般依賴：spec 001（BFF / session 基礎）。

---

## 3. 設計決策

### 3.1 Token 間接引用機制（讓 014b 的覆寫得以成立）

- `@theme` 內既有值 = **dark 預設**，維持不動（`data-theme` 缺省或 `="dark"` 即此套）。
- themeable 色彩 token 一律保持「utility → `var(--color-*)`」**間接引用**；
  `--color-*` 為可繼承自訂屬性，設在 `<html>` 會向下 cascade，utility 於 use-site 解析當前主題值。
- **禁用 `@theme inline`**：`inline` 會把值內聯進 utility、無法被 cascade 覆寫，主題化即失效。
- 特異度契約：014b 的 `html[data-theme="light"]`(0,1,1) > `:root`(0,1,0)，覆寫穩定勝出、與宣告順序無關。
- **不引入 `dark:` variant**：語義 token 已承擔切換，元件維持單一 class。

> 本節只定義**機制與約束**；`[data-theme="light"]` 區塊的實際色值由 [`014b §5`](./014b-theme-ui.md) 提供。

### 3.2 持久化：獨立持久 `theme` cookie（**登出不清**）

| Cookie | 用途 | 生命週期 | httpOnly | 登出時 |
|---|---|---|---|---|
| iron-session（既有） | 驗證 / adminRole | session | `true` | **被 `destroy()`** |
| `theme`（本規格新增） | 深 / 淺偏好 | `Max-Age=31536000`（1 年） | **`false`** | **不動** |

- `httpOnly:false`：一鍵切換要在 client 即時 `document.cookie` 寫入，故 client 需可讀寫。
- `SameSite=Lax`、`Path=/`、`Secure`（prod）、`Max-Age≈31536000`。
- **絕不放進 iron-session、logout 不清它** → 登出→登入、關瀏覽器重開、匿名訪客皆保留主題。
- 值域僅 `light | dark`；未知 / 缺省 → **`dark`**（Zod 收斂，見 §6）。

### 3.3 防閃爍：cookie SSR 直出（免 inline script）

- RootLayout（RSC）以 `await readThemeCookie()` 讀 `theme` → 直接 `<html data-theme={theme}>`。
  硬導覽 / 重新整理時**伺服器已輸出正確屬性**，first paint 即正確，無需 inline script。
- 代價：root layout 讀 cookie → 該層轉**動態渲染**。本站頁面本就多為動態，可接受（見 OQ-3）。
- `<html>` 既有 `suppressHydrationWarning` 覆蓋殘餘屬性差異。
- **功能開關（D8）**：`NEXT_PUBLIC_ENABLE_THEME_TOGGLE !== '1'` 時，root layout **跳過** `readThemeCookie()`，
  直接以 `'light'` 作為 `initialTheme`，layout **回靜態渲染**（見 §I-8）。

### 3.4 即時切換：client 直改 DOM + 寫 cookie（無 round-trip / 無 Route Handler）

因 cookie 為 client-writable，切換**不需**伺服器往返，也**不需**新增 Route Handler：

1. `next = theme === 'dark' ? 'light' : 'dark'`
2. `document.documentElement.dataset.theme = next`（即時重繪；`color-scheme` 由 CSS 隨 `[data-theme]` 走，見 014b）
3. `document.cookie = "theme=" + next + "; Max-Age=31536000; Path=/; SameSite=Lax"`（+ prod `Secure`）
4. 更新 React context state → `Toaster` 等消費者 re-render（消費端在 014b）
5. 下次 SSR 讀到同一 cookie，伺服器輸出即與 client 一致

### 3.5 SSR/CSR 一致：`ThemeProvider` 以伺服器值初始化

- RootLayout 讀到的 cookie 值，作為 `initialTheme` prop 傳入 `Providers → ThemeProvider`。
- `ThemeProvider` 以該 prop 初始化 context state（**不在 client 重讀 cookie 決定初值**），
  保證 SSR 與 hydration 初值一致、無閃爍、無 mismatch。
- **與 014b 的契約**：`ThemeProvider` 於 mount 後（`useEffect`）在 `<html>` 掛
  `data-theme-ready`（供 014b 的過渡動畫 FOUC guard 判斷「載入後才啟用 transition」）。

---

## 4. 檔案與元件清單

| 檔案 | 動作 | 職責 |
|---|---|---|
| `src/lib/theme/schema.ts` | 新增 | `themeSchema = z.enum(['light','dark'])`、`type Theme`、`parseTheme(raw): Theme`（未知→`dark`）、`THEME_COOKIE`、`THEME_COOKIE_MAX_AGE` 常數。**⚠ 不可加 `import 'server-only'`**——client 的 `ThemeProvider` 也要 import 這些常數（見 §I-2） |
| `src/lib/theme/readThemeCookie.ts` | 新增 | **server-only**；以 `await cookies()` 讀 `THEME_COOKIE`，經 `parseTheme` 回 `Theme`（缺省 `dark`） |
| `src/lib/theme/ThemeProvider.tsx` | 新增 | **`'use client'`** context + `useTheme()`；`{ theme, toggle, setTheme }`；執行 §3.4 的 DOM + cookie 寫入；§3.5 mount 後掛 `data-theme-ready`。**⚠ prod 判斷用 `process.env.NODE_ENV`，不可 import `@/lib/config`（server-only）**（見 §I-1） |
| `src/app/layout.tsx` | 改 | **改為 `async`**；`NEXT_PUBLIC_ENABLE_THEME_TOGGLE === '1'` 時 `await readThemeCookie()`，否則直接 `'light'`（靜態渲染）→ `<html data-theme={theme}>`；傳 `initialTheme` 給 `Providers` |
| `src/app/providers.tsx` | 改（**與 014b 共用**） | 收 `initialTheme` prop；包 `<ThemeProvider initialTheme={initialTheme}>`。**Toaster 改讀 `useTheme` 屬 014b**（見 §I-3） |

> 切換**不新增** Route Handler（§3.4），不涉及 BFF TDD。

---

## 4b. 實作註記 / 陷阱（§I）

- **§I-1 — client 端 `Secure` 不可用 server env**：`src/lib/config.ts` 開頭 `import 'server-only'`，
  client component **不能** import。`ThemeProvider` 寫 cookie 判斷是否加 `Secure` 一律用
  `process.env.NODE_ENV === 'production'`（Next 於 client bundle 內聯此值），**勿** import `@/lib/config`。
- **§I-2 — 常數模組不可 server-only**：`schema.ts` 存 `THEME_COOKIE`/`THEME_COOKIE_MAX_AGE`/`parseTheme`，
  同時被 server 的 `readThemeCookie` 與 client 的 `ThemeProvider` import。**絕不可**在 `schema.ts` 加
  `import 'server-only'`（否則 client bundling 失敗）。`readThemeCookie.ts` 才掛 server-only。
- **§I-3 — providers.tsx 是共用檔**：本規格負責「包 `ThemeProvider` + 收 `initialTheme`」；
  Toaster 改讀 `useTheme()` 的接線在 [`014b §I-3`](./014b-theme-ui.md)。`ThemeProvider` 需包在 `<Toaster>` **外層**。
- **§I-7 — RootLayout 動態化**：`await readThemeCookie()` 使 root layout 轉動態渲染（見 §3.3／OQ-3），屬預期行為。
- **§I-8 — 功能開關環境變數**：`NEXT_PUBLIC_ENABLE_THEME_TOGGLE`（`.env.*`）。值為 `'1'` 才啟用切換；
  預設 `'0'`（關閉）。`NEXT_PUBLIC_` 前綴使此值在 server（`process.env`）與 client bundle 皆可讀，
  不需另立 server-only 判斷。測試環境於 `vitest.config.ts` 固定設為 `'1'`，現有 `ThemeToggle` 測試不受影響。

---

## 5. 一鍵切換時序（資料流）

```
使用者按 ThemeToggle（current=dark；元件在 014b）
   │
   ├─ next = 'light'
   ├─ document.documentElement.dataset.theme = 'light'   ← CSS 即時重繪（color-scheme 見 014b）
   ├─ document.cookie = 'theme=light; Max-Age=31536000; Path=/; SameSite=Lax'
   └─ setTheme('light')  → context 更新 → Toaster 等 re-render（消費端 014b）

之後任一次硬導覽 / 重新整理：
   RootLayout(RSC) → readThemeCookie() = 'light' → <html data-theme="light"> 直出
   → first paint 即淺色，無閃爍

登出（destroy session cookie）→ theme cookie 未動 → 再登入仍為 'light'
```

---

## 6. TDD 測試計畫（本規格皆屬強制 TDD 範圍）

| 目標 | 類型 | 工具 | 關鍵案例 |
|---|---|---|---|
| `themeSchema` / `parseTheme` | Zod schema | Vitest | happy：`'light'`/`'dark'` 通過；edge：`'blue'`→`dark`、`undefined`→`dark`、`''`→`dark` |
| `readThemeCookie` | server util | Vitest（mock `next/headers` `cookies()`） | cookie=light→`'light'`；缺 cookie→`'dark'`；亂值→`'dark'` |
| `ThemeProvider` / `useTheme` | client 邏輯 | Vitest + Testing Library | `initialTheme` 決定初值；`toggle()` 翻轉；寫入 `document.cookie`（含 `Max-Age`/`Path`）；設 `documentElement.dataset.theme`；mount 後掛 `data-theme-ready` |

> 邏輯 / 資料類**不豁免**。`ThemeToggle` 互動測試與 e2e 在 [`014b §6`](./014b-theme-ui.md)。

---

## 7. 決策紀錄與待決

- **D1 模式數**：✅ **雙態（`dark` 預設 ⇄ `light`）**。「跟隨系統」暫不做（OQ-1）。
- **D2 持久化**：✅ **獨立持久 `theme` cookie**（`httpOnly:false`、`Max-Age` 1 年、`SameSite=Lax`、`Path=/`）；**不進 iron-session、登出不清**。
- **D3 防閃爍**：✅ cookie **SSR 直出** `data-theme`，免 inline script；root layout 轉動態（OQ-3）。
- **D5 切換機制**：✅ client 直改 `dataset.theme` + 寫 cookie，**無 round-trip、無 Route Handler**。

> **D4（token 架構）**：機制面（間接引用、禁 `@theme inline`、特異度）定案於本規格 §3.1；色值面在 014b。

### Open Questions（不阻塞開工）

- **OQ-1（三態）**：未來加「跟隨系統」時，`theme` cookie 值域擴為 `light|dark|system`，
  並在 `readThemeCookie` / provider 解析 system → media query。**本期不做**。
- **OQ-3（root layout 動態化）**：讀 cookie 使 root layout 動態；若日後需靜態化，改以 middleware 於邊緣設 `data-theme`。**功能開關關閉（D8）時 layout 已回靜態，此問題僅在開關開啟時存在**。

---

## 8. 變更紀錄

| 版本 | 日期 | 變更 |
|---|---|---|
| 0.1 | 2026-07-18 | 自 `014-theme-mode.md` v0.2 拆出「業務邏輯」部分：狀態模型、cookie 持久化、SSR 直出、即時切換資料流、token 間接引用機制、server-only 邊界、邏輯類 TDD。色值 / 元件 / 排版移至 `014b`。 |
| 0.2 | 2026-07-18 | 狀態更新為「已實作」：`schema.ts`、`readThemeCookie.ts`、`ThemeProvider.tsx`、root layout 接線、providers 接線全部落地，含完整 Vitest 測試。 |
| 0.3 | 2026-07-19 | +D8 **功能開關**：`NEXT_PUBLIC_ENABLE_THEME_TOGGLE` env var（預設 `0`）；§3.3 補開關邏輯（跳過 cookie / 固定 `light` / layout 回靜態）；+§I-8；OQ-3 補充說明；`layout.tsx` 檔案清單更新。Vitest 設 `'1'` 保既有測試。 |

---

最後更新：2026-07-19（v0.3，+D8 功能開關）
