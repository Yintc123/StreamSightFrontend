# Spec 018 — 閒置 15 分鐘自動登出

- **狀態**：待實作
- **影響範圍**：
  - `src/lib/hooks/useIdleLogout.ts`（新增）
  - `src/lib/hooks/useIdleLogout.test.ts`（新增）
  - `src/app/cms/IdleLogout.tsx`（新增，掛載用的 client 元件）
  - `src/app/cms/layout.tsx`（修改，插入 `<IdleLogout />`）
  - `src/app/AuthRedirectToast.tsx`（修改，新增 `idle-logout` reason）
  - `tests/e2e/idle-logout.spec.ts`（新增，PR 前補）
- **依賴**：
  - 登出流程：`src/app/api/auth/logout/route.ts`、`src/lib/client/csrf.ts`（`getCsrfToken`）
  - 提示機制：`src/app/AuthRedirectToast.tsx`（`?reason=` → toast，Spec 010 §3.3）
  - 認證版面：`src/app/cms/layout.tsx`（`requireAdminSession()` 保證此範圍內已登入）

---

## 1. 背景與目標

登入 CMS（`/cms/*`）後,session cookie 預設 TTL 長達 30 天（`SESSION_TTL_SECONDS`）。
若使用者離開座位卻未主動登出,後台在無人看管下長時間保持已登入狀態,存在資安風險
（他人可直接操作管理後台 / 使用者管理 / 資料平台）。

**目標**:在登入後的 CMS 區域偵測使用者閒置,**滑鼠與鍵盤連續 15 分鐘沒有任何動作**即
**自動登出並導回首頁**,並以 toast 告知原因。任何滑鼠或鍵盤活動都重置 15 分鐘計時。

**非目標**:這不是「session 絕對存活上限」機制(那屬後端 refresh token 生命週期);
本規格只處理「前端閒置」→ 前端主動觸發既有登出流程。

---

## 2. 範圍

| 項目 | 說明 |
|------|------|
| `src/lib/hooks/useIdleLogout.ts`（新增） | 核心 hook:掛載活動監聽、計時、逾時觸發登出。純邏輯,**強制 TDD** |
| `src/lib/hooks/useIdleLogout.test.ts`（新增） | 用 `vi.useFakeTimers()` 驗證逾時、重置、跨分頁、只觸發一次 |
| `src/app/cms/IdleLogout.tsx`（新增） | 薄 client 元件,`'use client'`,呼叫 hook,`return null` |
| `src/app/cms/layout.tsx`（修改） | 在 CMS shell 內插入 `<IdleLogout />`(僅登入後區域啟用) |
| `src/app/AuthRedirectToast.tsx`（修改） | `REASONS` 新增 `idle-logout` → 訊息「閒置過久,已自動登出」 |
| `tests/e2e/idle-logout.spec.ts`（PR 前補） | 縮短逾時、模擬閒置,驗證導回 `/` 且見 toast |

**不在範圍內**:

- **倒數警告 modal / 「繼續操作」按鈕**:v1 逾時直接登出,不先跳警告(見 OQ-1)。
- **公開首頁 / 未登入頁面的閒置偵測**:未登入無 session 可登出,不掛(見 D6)。
- **Streamlit iframe 內的活動**:跨來源 iframe 的滑鼠/鍵盤事件不會冒泡到父頁,
  父頁無法感知(見 §3.4 邊界與 OQ-3)。
- **後端 session 絕對生命週期 / refresh token 輪替**:屬既有後端機制,不在此改動。

---

## 3. 行為說明

### 3.1 閒置定義（D1）

「活動」= 於 `window` 觸發下列任一事件,全部以 `{ passive: true }` 註冊:

| 類別 | 事件 |
|------|------|
| 滑鼠 | `mousemove`、`mousedown`、`wheel` |
| 鍵盤 | `keydown` |

任一事件即視為「使用者仍在」,重置 15 分鐘計時。連續 15 分鐘無上述任何事件 → 逾時。

> 觸控裝置(`touchstart`)暫不納入(CMS 為桌面後台導向);列 OQ-2。

### 3.2 計時機制（D3）

高頻事件(尤其 `mousemove`)不可每次都重排計時器,故:

1. 活動事件經**節流**(throttle,每 `ACTIVITY_THROTTLE_MS = 1000ms` 最多處理一次)後,
   更新 `lastActivity = Date.now()` 並寫入 `localStorage`(跨分頁,見 D5)。
2. 以單一 `setTimeout` 排程於 `lastActivity + IDLE_TIMEOUT_MS` 觸發。
3. `setTimeout` **fire 時二次驗證**:計算 `Date.now() - lastActivity`;
   - `≥ IDLE_TIMEOUT_MS` → 觸發登出;
   - `< IDLE_TIMEOUT_MS`(被背景分頁節流提前/延後喚醒,或其他分頁剛有活動)→ 依剩餘時間補排,不登出。

> 二次驗證讓計時以**時間戳**為準,不依賴 `setTimeout` 的精確度,對瀏覽器背景節流免疫。

### 3.3 逾時觸發登出（D7）

逾時後執行(以 `firedRef` 保證整個生命週期**只執行一次**):

1. `getCsrfToken()` 取得 CSRF token(`src/lib/client/csrf.ts`)。
2. `fetch('/api/auth/logout', { method: 'POST', credentials: 'same-origin', headers: { 'x-csrf-token': csrfToken } })`。
3. 無論成功或失敗(fail-safe),**硬導向** `window.location.assign('/?reason=idle-logout')`。

> 重用 `CmsTopBar` 手動登出的**同一條路徑**(§依賴),差別僅在導向帶 `?reason=idle-logout`
> 而非手動登出的 `router.push('/')`。硬導向(整頁重載)確保 RSC 重新評估、已清除的 session
> cookie 立即生效。

### 3.4 行為矩陣

| 情境 | 行為 |
|------|------|
| 在 `/cms/*` 且 15 分鐘內有滑鼠/鍵盤活動 | 計時持續重置,不登出 |
| 在 `/cms/*` 連續 15 分鐘無滑鼠/鍵盤活動 | 自動登出 → `/?reason=idle-logout` → toast |
| 閒置中切到別的分頁又切回(分頁隱藏→可見) | `visibilitychange` 立即檢查:已逾時則當下登出,未逾時續計(D4) |
| 筆電闔蓋 / 系統睡眠超過 15 分鐘後喚醒 | 喚醒時 `visibilitychange`/timer 二次驗證判定逾時 → 登出(D4) |
| 多分頁:A 分頁閒置、B 分頁使用者活動中 | B 的活動經 `storage` 事件同步到 A,A 一併重置,不誤登出(D5) |
| 逾時當下瀏覽器離線 / logout API 失敗 | 仍硬導向 `/?reason=idle-logout`(fail-safe,§3.3-3) |
| 使用者本來就在公開首頁(未登入) | 不掛載,無偵測(D6) |
| `NEXT_PUBLIC_IDLE_LOGOUT_MINUTES=0` | 停用整個機制,hook 直接 early-return(D2) |

### 3.5 邊界與 Streamlit iframe

CMS 頂部列可切到「資料平台」(Streamlit)。若 Streamlit 以**跨來源 iframe** 嵌入,
使用者在 iframe 內的滑鼠/鍵盤事件**不會冒泡到父頁**,父頁會誤判為閒置。
- 若 Streamlit 是**整頁跳轉**(離開 Next.js):不在本 hook 作用範圍,由 Streamlit 端自理(見 OQ-3)。
- 若為 iframe:需 Streamlit 端 postMessage 心跳,屬跨專案協調 → OQ-3,不阻塞本 spec。

---

## 4. 決策表

| 決策 | 內容 | 出處 |
|------|------|------|
| D1 閒置定義 | 滑鼠(`mousemove`/`mousedown`/`wheel`)+ 鍵盤(`keydown`),`{ passive: true }` | §3.1 |
| D2 逾時 / 開關 | 預設 15 分鐘(`900_000ms`);`NEXT_PUBLIC_IDLE_LOGOUT_MINUTES` 可覆寫,設 `0` 停用 | §3.2 / §5.4 |
| D3 計時機制 | `lastActivity` 時間戳 + 單一 `setTimeout` + fire 時二次驗證;活動節流 1s | §3.2 |
| D4 喚醒即時檢查 | 監聽 `visibilitychange`,轉可見時立即比對時間戳,逾時即登出 | §3.4 |
| D5 跨分頁同步 | 活動時間戳寫 `localStorage`(key `streamsight:idle:last-activity`)+ 監聽 `storage` 重排;兼作跨 reload 保留 | §3.4 |
| D6 掛載範圍 | 僅登入後區域:於 `src/app/cms/layout.tsx` 插 `<IdleLogout />`;**不**掛全域 `Providers` | §5.3 |
| D7 登出動作 | 重用 `getCsrfToken()` + `POST /api/auth/logout`,硬導向 `/?reason=idle-logout`;`firedRef` 只觸發一次;fail-safe 仍導向 | §3.3 |
| D8 提示 | 擴充 `AuthRedirectToast.REASONS`:`idle-logout` → 「閒置過久,已自動登出」;無倒數警告 | §5.5 / OQ-1 |

### Open Questions（不阻塞開工）

- **OQ-1(倒數警告)**:是否在第 14 分鐘先跳「即將登出,點此繼續」warning?v1 直接登出;未來可加 modal。
- **OQ-2(觸控)**:是否納入 `touchstart`/`touchmove` 支援平板操作?視 CMS 是否有平板使用者。
- **OQ-3(Streamlit iframe 心跳)**:若資料平台以 iframe 嵌入,需 Streamlit 端 postMessage 活動心跳給父頁重置計時。跨專案,另立 spec。
- **OQ-4(逾時是否也撤銷後端 refresh family)**:現行 logout route 已 best-effort 通知後端撤銷,沿用即可;無需額外處理。

---

## 5. 實作

### 5.1 TDD 流程（先寫測試）

依 CLAUDE.md:hook 屬**強制 TDD**。先建 `useIdleLogout.test.ts`,確認紅,再建實作。

#### §5.1.1 先建測試(骨架)

```ts
// src/lib/hooks/useIdleLogout.test.ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook } from '@testing-library/react'

// 對齊既有 client 測試:mock CSRF 與 fetch
vi.mock('@/lib/client/csrf', () => ({
  getCsrfToken: vi.fn(() => Promise.resolve('csrf-abc')),
}))

import { getCsrfToken } from '@/lib/client/csrf'
import { useIdleLogout, IDLE_STORAGE_KEY } from './useIdleLogout'

const IDLE_MS = 15 * 60 * 1000

describe('useIdleLogout', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve(new Response(null, { status: 204 }))))
    // 攔截硬導向:jsdom/happy-dom 不允許 assign 真跳轉
    vi.stubGlobal('location', { assign: vi.fn() } as unknown as Location)
    localStorage.clear()
  })
  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
    vi.clearAllMocks()
  })

  it('連續 15 分鐘無活動 → 觸發登出並導向 /?reason=idle-logout', async () => {
    renderHook(() => useIdleLogout())
    await vi.advanceTimersByTimeAsync(IDLE_MS + 1000)
    expect(getCsrfToken).toHaveBeenCalledTimes(1)
    expect(fetch).toHaveBeenCalledWith('/api/auth/logout', expect.objectContaining({ method: 'POST' }))
    expect(location.assign).toHaveBeenCalledWith('/?reason=idle-logout')
  })

  it('活動事件重置計時 → 不登出', async () => {
    renderHook(() => useIdleLogout())
    await vi.advanceTimersByTimeAsync(IDLE_MS - 1000)
    window.dispatchEvent(new Event('mousemove'))
    await vi.advanceTimersByTimeAsync(IDLE_MS - 1000) // 距上次活動未滿 15 分
    expect(location.assign).not.toHaveBeenCalled()
  })

  it('逾時只觸發一次登出', async () => {
    renderHook(() => useIdleLogout())
    await vi.advanceTimersByTimeAsync(IDLE_MS * 3)
    expect(location.assign).toHaveBeenCalledTimes(1)
  })

  it('其他分頁活動(storage 事件)重置本分頁計時', async () => {
    renderHook(() => useIdleLogout())
    await vi.advanceTimersByTimeAsync(IDLE_MS - 1000)
    // 模擬他分頁剛寫入較新的活動時間戳
    localStorage.setItem(IDLE_STORAGE_KEY, String(Date.now()))
    window.dispatchEvent(new StorageEvent('storage', { key: IDLE_STORAGE_KEY }))
    await vi.advanceTimersByTimeAsync(IDLE_MS - 1000)
    expect(location.assign).not.toHaveBeenCalled()
  })

  it('NEXT_PUBLIC_IDLE_LOGOUT_MINUTES=0 → 停用,不掛監聽', async () => {
    vi.stubEnv('NEXT_PUBLIC_IDLE_LOGOUT_MINUTES', '0')
    renderHook(() => useIdleLogout())
    await vi.advanceTimersByTimeAsync(IDLE_MS * 2)
    expect(location.assign).not.toHaveBeenCalled()
  })
})
```

`pnpm test useIdleLogout` → 應見 **紅**(找不到模組)。

#### §5.1.2 再建實作(參考結構,依測試補齊)

```ts
// src/lib/hooks/useIdleLogout.ts
'use client'

import { useEffect, useRef } from 'react'
import { getCsrfToken } from '@/lib/client/csrf'

export const IDLE_STORAGE_KEY = 'streamsight:idle:last-activity'
const ACTIVITY_THROTTLE_MS = 1000
const ACTIVITY_EVENTS = ['mousemove', 'mousedown', 'wheel', 'keydown'] as const

function idleTimeoutMs(): number {
  const min = Number(process.env.NEXT_PUBLIC_IDLE_LOGOUT_MINUTES ?? '15')
  return Number.isFinite(min) ? min * 60_000 : 15 * 60_000
}

export function useIdleLogout(): void {
  const firedRef = useRef(false)
  const lastActivityRef = useRef(Date.now())
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const lastWriteRef = useRef(0)

  useEffect(() => {
    const timeoutMs = idleTimeoutMs()
    if (timeoutMs <= 0) return // 停用(D2)

    async function logout() {
      if (firedRef.current) return
      firedRef.current = true
      try {
        const csrf = await getCsrfToken()
        await fetch('/api/auth/logout', {
          method: 'POST',
          credentials: 'same-origin',
          headers: { 'x-csrf-token': csrf },
        })
      } catch {
        // fail-safe:仍導向首頁(D7)
      }
      window.location.assign('/?reason=idle-logout')
    }

    function schedule() {
      if (timerRef.current) clearTimeout(timerRef.current)
      const remaining = lastActivityRef.current + timeoutMs - Date.now()
      if (remaining <= 0) {
        void logout()
        return
      }
      timerRef.current = setTimeout(() => {
        // fire 時二次驗證(D3)
        if (Date.now() - lastActivityRef.current >= timeoutMs) void logout()
        else schedule()
      }, remaining)
    }

    function markActive(now = Date.now()) {
      lastActivityRef.current = now
      schedule()
    }

    function onActivity() {
      const now = Date.now()
      if (now - lastWriteRef.current < ACTIVITY_THROTTLE_MS) return // 節流(D3)
      lastWriteRef.current = now
      try {
        localStorage.setItem(IDLE_STORAGE_KEY, String(now)) // 跨分頁(D5)
      } catch {
        /* localStorage 不可用時退化為單分頁 */
      }
      markActive(now)
    }

    function onStorage(e: StorageEvent) {
      if (e.key !== IDLE_STORAGE_KEY || !e.newValue) return
      const ts = Number(e.newValue)
      if (Number.isFinite(ts) && ts > lastActivityRef.current) markActive(ts) // 他分頁活動(D5)
    }

    function onVisibility() {
      if (document.visibilityState === 'visible') schedule() // 喚醒即時檢查(D4)
    }

    for (const ev of ACTIVITY_EVENTS) {
      window.addEventListener(ev, onActivity, { passive: true })
    }
    window.addEventListener('storage', onStorage)
    document.addEventListener('visibilitychange', onVisibility)
    markActive() // 初始排程

    return () => {
      for (const ev of ACTIVITY_EVENTS) window.removeEventListener(ev, onActivity)
      window.removeEventListener('storage', onStorage)
      document.removeEventListener('visibilitychange', onVisibility)
      if (timerRef.current) clearTimeout(timerRef.current)
    }
  }, [])
}
```

`pnpm test useIdleLogout` → 應見 **綠**。

### 5.2 掛載元件

```tsx
// src/app/cms/IdleLogout.tsx
'use client'

import { useIdleLogout } from '@/lib/hooks/useIdleLogout'

// Spec 018 — 僅在登入後 CMS 區域啟用閒置登出;不渲染任何內容。
export function IdleLogout(): null {
  useIdleLogout()
  return null
}
```

### 5.3 接入 CMS Layout（D6）

`src/app/cms/layout.tsx` 已由 `requireAdminSession()` 保證此 subtree 內使用者已登入,
是唯一且理想的掛載點(避免在公開首頁空轉):

```tsx
import { IdleLogout } from './IdleLogout'
// ...
  return (
    <div className="min-h-dvh bg-surface-page flex flex-col">
      <IdleLogout />
      <CmsTopBar ... />
      {/* ...其餘不變 */}
    </div>
  )
```

> **不掛全域 `Providers`**:首頁 / 登入頁無 session,掛了只會空跑監聽甚至誤觸登出流程。

### 5.4 環境變數（D2）

- `NEXT_PUBLIC_IDLE_LOGOUT_MINUTES`:預設 `15`;設 `0` 停用整個機制。
- 需 `NEXT_PUBLIC_` 前綴才能在 client 讀到。於 `.env.example` 補一行說明,預設值即 15。

### 5.5 提示擴充（D8）

在 `src/app/AuthRedirectToast.tsx` 的 `REASONS` 依既有模式新增:

```ts
const IDLE_LOGOUT_REASON = 'idle-logout'
export const IDLE_LOGOUT_TOAST_ID = 'idle-logout'
export const IDLE_LOGOUT_TOAST_MESSAGE = '閒置過久,已自動登出'

const REASONS: Record<string, ToastSpec> = {
  // ...既有 cms-auth / cms-not-admin
  [IDLE_LOGOUT_REASON]: {
    id: IDLE_LOGOUT_TOAST_ID,
    message: IDLE_LOGOUT_TOAST_MESSAGE,
  },
}
```

> `AuthRedirectToast` 已掛在首頁(`src/app/page.tsx`),導回 `/?reason=idle-logout` 即自動顯示,
> 並 `router.replace('/')` 清 query,重新整理不重複跳。無需改動觸發邏輯。

---

## 6. 測試策略

| 層 | 內容 | 工具 | TDD 嚴格度 |
|----|------|------|------------|
| Unit | `useIdleLogout`:逾時登出、活動重置、只觸發一次、storage 同步、`=0` 停用、fail-safe 仍導向 | Vitest(`vi.useFakeTimers`) | **強制** |
| Unit | `AuthRedirectToast`:`idle-logout` → 對應訊息 toast(擴充既有測試) | Vitest + Testing Library | **強制** |
| E2E | 縮短逾時(env override)後閒置 → 落在 `/` 且見 toast | Playwright | PR 前補 |

E2E 建議(`tests/e2e/idle-logout.spec.ts`):以 `NEXT_PUBLIC_IDLE_LOGOUT_MINUTES` 設極短值
(或用 Playwright clock API 快轉時間),登入 → 進 `/cms` → 不操作 → 驗證:

```
1. 最終 URL 為 /(帶或已清除 ?reason=idle-logout)
2. 頁面可見 LoginCard
3. toast 文案含「已自動登出」
```

---

## 7. 提交前檢查

1. `pnpm lint` → 無 error
2. `pnpm test` → 全綠(含新增 `useIdleLogout.test.ts` 與 `AuthRedirectToast` 擴充)
3. 手動:進 `/cms`,將 `NEXT_PUBLIC_IDLE_LOGOUT_MINUTES` 暫設小值(如 `0.2`≈12s),
   靜置 → 應自動導回 `/` 並見 toast;期間動滑鼠/打字 → 不應登出
4. 若改了 UI 或 user flow:`pnpm test:e2e` → 全綠

---

## 8. 後續（OQ 匯總）

- **OQ-1 倒數警告 modal**:第 14 分鐘先提示「即將登出」+ 「繼續操作」按鈕。
- **OQ-2 觸控事件**:納入 `touchstart` 以支援平板。
- **OQ-3 Streamlit iframe 心跳**:資料平台若為跨來源 iframe,需 postMessage 活動心跳同步父頁計時。
- **OQ-4 後端撤銷**:沿用 logout route 既有 best-effort 撤銷,無需額外處理。

---

## 變更紀錄

| 版本 | 日期 | 變更 |
|------|------|------|
| 0.1 | 2026-07-19 | 初版:閒置 15 分鐘(滑鼠+鍵盤)自動登出。決策 D1–D8 定案;計時採時間戳+二次驗證、`visibilitychange` 喚醒檢查、`localStorage`+`storage` 跨分頁同步;掛載於 CMS layout;重用既有 logout + `?reason=idle-logout` toast。OQ-1~4 待決不阻塞。 |

---

*最後更新:2026-07-19*
