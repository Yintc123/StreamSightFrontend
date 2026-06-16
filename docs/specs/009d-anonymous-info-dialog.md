# Spec 009d：「匿名捐款」說明對話框

- **狀態**：Draft（v0.1 — 從 IMG_4892 / IMG_4893 抽出，解 [009b §10 OQ](./009b-purchase-confirm.md) 待補項）
- **建立日期**：2026-06-16
- **路徑（規劃）**：
  - `src/components/ui/InfoDialog.tsx` + `.test.tsx`（generic 置中浮層 primitive）
  - `src/app/checkout/AnonymousInfoTrigger.tsx` + `.test.tsx`（icon button + state + 匿名捐款說明文案）
- **依賴**：
  - 既有 [009c shared confirm UI](./009c-shared-confirm-ui.md) — 設計風格家族（圓角 / shadow / 色 token）
  - 既有 [008a BottomSheet](./008a-bottom-sheet.md) — portal / scrim / focus-trap / scroll-lock pattern 參考（**不**重用 component，因為布局是 bottom-anchored）
- **使用方**：
  - [009a §5.7 `<DonorInfoFormPanel>`](./009a-donation-confirm.md) — 「我要匿名捐款」checkbox 右側 ⓘ
  - [009b §6.4 `<ReceiptInfoFormPanel>`](./009b-purchase-confirm.md) — 同上，解 §10 OQ「ⓘ icon 點開內容 Figma 沒給」
- **Figma 對應**：IMG_4892（trigger：checkbox 右側 ⓘ icon）+ IMG_4893（dialog：置中浮層）

---

## 1. 職責

「我要匿名捐款」checkbox 標籤的右側有個 ⓘ icon。**點 icon → 跳出置中浮層說明「什麼是匿名捐款」**，避免使用者勾選時不知道勾下去會發生什麼。

語意拆兩層：

| 層 | 元件 | 路徑 | 職責 |
|---|---|---|---|
| Primitive | `<InfoDialog>` | `src/components/ui/` | Generic 置中浮層：title + body + 單一 dismiss CTA + a11y + scrim + portal |
| Composition | `<AnonymousInfoTrigger>` | `src/app/checkout/` | ⓘ 按鈕 + open state + 把匿名捐款文案灌進 InfoDialog |

> **為何分兩層**：對齊 [009c](./009c-shared-confirm-ui.md) 「primitive vs business form 分檔」慣例。InfoDialog 預期未來會用在其他 info-popup 情境（如收據開立方式各 option 的差異說明），先把通用視覺 / a11y / focus 管理固化在 ui/。AnonymousInfoTrigger 只負責「icon + 文案 + state」這層。

---

## 2. 元件結構與互動 flow

```
                  [Confirm Panel：捐款人基本資料 / 收據資訊]
                        ☐ 我要匿名捐款 ⓘ ◄────────── 點擊 ⓘ
                                          │
                                          ▼
                  ┌─── Portal → document.body ───┐
                  │  fixed inset-0 z-40           │
                  │  bg-black/40   ← scrim        │
                  │                                │
                  │     ┌──────────────────┐      │
                  │     │ 什麼是匿名捐款？  │      │
                  │     │                  │      │
                  │     │ 依法除捐贈者…    │      │
                  │     │                  │      │
                  │     │ [   我知道了   ] │      │  ← dismiss button
                  │     └──────────────────┘      │
                  │                                │
                  └────────────────────────────────┘
                                          │
                                          ▼
                                 close → 焦點回 ⓘ button
```

**Trigger 互動 state machine**（極簡）：

```
[idle] --click icon--> [open] --ESC | backdrop | dismiss button--> [idle]
```

無動畫複雜度（v0.1 不做 enter/exit transition，直接 mount/unmount）。

---

## 3. `<InfoDialog>` Primitive

### 3.1 Props

```ts
type InfoDialogProps = {
  /** 是否顯示；caller 控 open state */
  open: boolean
  /** 任意關閉路徑都會 call：ESC / backdrop / dismiss button */
  onClose: () => void
  /** dialog 標題 (h2 字串) */
  title: string
  /** body 內容（單段 / 多段都行） */
  children: ReactNode
  /** Dismiss button 文字；預設「我知道了」 */
  dismissLabel?: string
}
```

- **不**接 className prop——固定置中 layout / sizing（同 [009c §2.1 ConfirmPageShell](./009c-shared-confirm-ui.md) 的「需要變樣再 prop 化」原則）
- **不**接「dismiss button onClick 反 onClose」自訂 hook——「我知道了」是純 acknowledge、語意對齊 onClose，重複 prop 只徒增 caller 負擔
- `dismissLabel` 預設 `'我知道了'`；可 prop 化是預想其他用途（如「了解」「OK」）的擴充點

### 3.2 視覺 / Tailwind ref

```tsx
'use client'
import { useEffect, useId, useRef } from 'react'
import { createPortal } from 'react-dom'

export function InfoDialog({
  open,
  onClose,
  title,
  children,
  dismissLabel = '我知道了',
}: InfoDialogProps) {
  const titleId = useId()
  const descId = useId()
  const dismissBtnRef = useRef<HTMLButtonElement>(null)

  // SSR-safe：portal 只在 client mount 後渲染（同 BottomSheet pattern）
  if (typeof document === 'undefined' || !open) return null

  return createPortal(
    <div
      role="presentation"
      className="fixed inset-0 z-40 bg-black/40 flex items-center justify-center px-6"
      onClick={(e) => {
        // 只有點 scrim 本人才關；點 panel 內部不關
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descId}
        className="bg-surface-card rounded-2xl shadow-lg w-full max-w-xs px-6 py-6 z-50"
      >
        <h2
          id={titleId}
          className="text-base font-semibold text-ink-AAA text-center mb-3"
        >
          {title}
        </h2>
        <div
          id={descId}
          className="text-sm leading-6 text-ink-AA mb-5 whitespace-pre-line"
        >
          {children}
        </div>
        <button
          ref={dismissBtnRef}
          type="button"
          onClick={onClose}
          className="w-full h-11 rounded-full bg-black/5 text-sm text-ink-AAA
                     hover:bg-black/10
                     focus-visible:outline focus-visible:outline-2
                     focus-visible:outline-offset-2 focus-visible:outline-brand"
        >
          {dismissLabel}
        </button>
      </div>
    </div>,
    document.body,
  )
}
```

樣式對應 IMG_4893：

| 元素 | Token / 數值 |
|---|---|
| Scrim | `bg-black/40 fixed inset-0 z-40`（比 BottomSheet `/30` 略深，對齊 CategoryMenu 慣例） |
| Panel | `bg-surface-card rounded-2xl shadow-lg max-w-xs`（窄欄、不貼邊） |
| 內距 | `px-6 py-6`（比 ConfirmPanel 的 `px-5 py-5` 略寬，反映「壓迫感較強的 modal」設計取向） |
| Title | `text-base font-semibold text-ink-AAA text-center mb-3` |
| Body | `text-sm leading-6 text-ink-AA whitespace-pre-line mb-5` |
| Dismiss button | `h-11 rounded-full bg-black/5 text-ink-AAA hover:bg-black/10`（**不**走 brand 紅 pill；對齊 IMG_4893 中性 acknowledge 樣式） |

> **為何 dismiss button 不是 brand 紅**：圖中該按鈕視覺權重明顯低於 confirm 頁的 sticky CTA — 因為這是「資訊已讀」的 acknowledge，非「執行重要動作」。用 brand 紅會與 sticky CTA 競爭注意力。

### 3.3 a11y 行為

| 行為 | 實作 |
|---|---|
| `role="dialog"` + `aria-modal="true"` | 對齊 BottomSheet pattern；告訴 SR 這是 modal、底下其他元素 inert |
| `aria-labelledby={titleId}` | SR 用 title 命名整個 dialog |
| `aria-describedby={descId}` | SR 讀完 title 再讀 body 段落（非必要但符合 WAI-ARIA APG） |
| ESC 鍵關 | 全域 `keydown` listener（mount 時加、unmount 時撤）；按 ESC → `onClose()` |
| Scrim 點擊關 | `onClick` 只在 `e.target === e.currentTarget`（即 scrim 本身、非 panel）時觸發 |
| Open 時 focus 落在 dismiss button | `useEffect(() => { open && dismissBtnRef.current?.focus() }, [open])` |
| Close 時焦點回 trigger | **caller 責任**（trigger 元件用 ref 記下啟動前的 active element，close 後 `focus()` 回去）；primitive 不管 trigger，無從還原 |
| Focus trap（不讓 Tab 跳出 panel） | v0.1 **不做**完整 trap；panel 內只有 1 個可聚焦元素（dismiss button），實務上沒地方跳——若未來加多元素（連結 / 多按鈕）需補完整 trap |
| Scroll lock | `useEffect` `document.body.style.overflow = 'hidden'`，unmount 還原（同 BottomSheet） |

### 3.4 Open / Close lifecycle（useEffect）

```tsx
useEffect(() => {
  if (!open) return
  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'Escape') onClose()
  }
  document.addEventListener('keydown', onKey)
  const prevOverflow = document.body.style.overflow
  document.body.style.overflow = 'hidden'
  return () => {
    document.removeEventListener('keydown', onKey)
    document.body.style.overflow = prevOverflow
  }
}, [open, onClose])

useEffect(() => {
  if (open) dismissBtnRef.current?.focus()
}, [open])
```

> 兩個 effect 拆開：scroll lock + ESC listener vs. focus management，避免任一相依性陣列污染另一個。

---

## 4. `<AnonymousInfoTrigger>` 業務組合

### 4.1 元件結構

```tsx
'use client'
import { useRef, useState } from 'react'
import { InfoDialog } from '@/components/ui/InfoDialog'

export const ANONYMOUS_INFO_TITLE = '什麼是匿名捐款？'
export const ANONYMOUS_INFO_BODY =
  '依法除捐贈者事先表示反對外，機關團體須主動公開捐贈之姓名及捐款金額。如您不同意公開請選擇「我要匿名捐款」，您的姓名將不會公開於機關團體網站或捐款芳名錄之上。'

export function AnonymousInfoTrigger() {
  const [open, setOpen] = useState(false)
  const triggerRef = useRef<HTMLButtonElement>(null)

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        aria-label="什麼是匿名捐款？"
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen(true)}
        className="inline-flex items-center justify-center w-5 h-5 shrink-0
                   text-ink-A hover:text-ink-AAA
                   focus-visible:outline focus-visible:outline-2
                   focus-visible:outline-offset-2 focus-visible:outline-brand
                   rounded-full"
      >
        <InfoIcon />
      </button>
      <InfoDialog
        open={open}
        onClose={() => {
          setOpen(false)
          // 焦點還原 — 對齊 WAI-ARIA APG：modal close → trigger focus
          triggerRef.current?.focus()
        }}
        title={ANONYMOUS_INFO_TITLE}
      >
        {ANONYMOUS_INFO_BODY}
      </InfoDialog>
    </>
  )
}

function InfoIcon() {
  // 實心圓 + 白色「i」，跟 ReminderNote 的 ExclamationIcon 同系列
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 16 16"
      className="w-4 h-4 fill-current"
    >
      <circle cx="8" cy="8" r="7.5" />
      <rect x="7.1" y="6.6" width="1.8" height="5.4" fill="white" rx="0.4" />
      <circle cx="8" cy="4.5" r="1" fill="white" />
    </svg>
  )
}
```

### 4.2 文案 export

`ANONYMOUS_INFO_TITLE` + `ANONYMOUS_INFO_BODY` 兩個 const 與 component 同檔 export，對齊 [009c §2.4 `DISCLAIMER_PLATFORM`](./009c-shared-confirm-ui.md#24-disclaimerbox--灰底注意事項框) / [009c §2.7 `REMINDER_DONOR_NAME`](./009c-shared-confirm-ui.md#27-remindernote--卡內-inline-提醒v02-新增) 慣例：文案 hardcode 中文、i18n 上線後改 string table、component API 不變。

文案抄錄自 IMG_4893：
- Title：「什麼是匿名捐款？」
- Body：「依法除捐贈者事先表示反對外，機關團體須主動公開捐贈之姓名及捐款金額。如您不同意公開請選擇「我要匿名捐款」，您的姓名將不會公開於機關團體網站或捐款芳名錄之上。」

### 4.3 InfoIcon 圖示選擇

`<InfoIcon>` 用 inline SVG 而非 lucide-react：

| 取捨 | 理由 |
|---|---|
| ✅ 內嵌 SVG | (a) 對齊既有 [`<ReminderNote>` ExclamationIcon](../../src/components/ui/ReminderNote.tsx) + BottomSheet CloseIcon 慣例 — 全專案皆內嵌；(b) 7-day demo 不引入新 dependency；(c) viewBox 16 × 16 / w-4 h-4 對齊既有 icon 比例 |
| ❌ lucide-react | bundle size + 一個 icon 為此引入函式庫過頭 |

視覺：實心黑圓 + 白色「i」，跟 ReminderNote ExclamationIcon「實心黑圓 + 白色 ❗」同家族；hover `text-ink-AAA` 微亮表達可點擊性。

### 4.4 為何 trigger ref 焦點還原放在 caller（AnonymousInfoTrigger）而非 InfoDialog

InfoDialog primitive 不知道是誰打開它（caller 可能是 button、可能是 link、可能是 keyboard shortcut），無法決定焦點還原目標。**caller 持 trigger ref + 在 onClose callback 內 `.focus()`** 是標準 React pattern，對齊 [WAI-ARIA APG Modal Dialog Example](https://www.w3.org/WAI/ARIA/apg/patterns/dialog-modal/)。

### 4.5 為何 open state 留在 trigger 而非 lift 到 page

```
[Page] → [Panel] → [AnonymousInfoTrigger] (own state)
```

- ☐「我要匿名捐款」checkbox 的 state 屬 form（住 reducer / hook）；ⓘ 對話框的 open state **不影響 payload、不影響 isValid、不影響 submit**——完全 self-contained UI 狀態
- 上拉到 page 反而：(a) form reducer 多個 `SET_ANON_DIALOG_OPEN` action 污染域；(b) AnonymousInfoTrigger 不能 self-render、caller 還要記得傳 dialog state
- 同 React 「local state by default, lift only when needed」原則

---

## 5. 整合到 009a / 009b

### 5.1 009b（`<ReceiptInfoFormPanel>`）

[009b §6.4 v0.4 reference JSX](./009b-purchase-confirm.md) 已先預留 `<InfoIcon>` 位置（但未實作）：

```diff
  <label className="flex items-center gap-2 text-sm text-ink-AAA">
    <input type="checkbox" checked={form.isAnonymous} ... />
    <span>我要匿名捐款</span>
-   <button type="button" aria-label="匿名捐款說明"
-           className="text-ink-A hover:text-ink-AAA">
-     <InfoIcon className="w-4 h-4" />
-   </button>
+   <AnonymousInfoTrigger />
  </label>
```

### 5.2 009a（`<DonorInfoFormPanel>`）

[009a §5.7 v0.8 reference JSX](./009a-donation-confirm.md) 原本沒有 ⓘ（spec 對齊 IMG_4888 / 4889；IMG_4892 後新增的 ⓘ 也應補上對齊兩頁體驗）：

```diff
  <label className="flex items-center gap-2 text-sm text-ink-AAA">
    <input type="checkbox" checked={form.isAnonymous} ... />
    <span>我要匿名捐款</span>
+   <AnonymousInfoTrigger />
  </label>
```

### 5.3 兩頁共用同一個 trigger

`<AnonymousInfoTrigger>` 不接 prop，整段 self-contained，**兩頁直接 import 用即可**。文案唯一 source of truth = `ANONYMOUS_INFO_BODY` const。

> 若未來捐款 / 購買兩頁需要不同文案（e.g. 購買頁強調發票 vs. 捐款頁強調收據），再把 trigger 改成 `children` 或 `body` prop 化；v0.1 不做。

---

## 6. a11y 完整總表

| 項 | 期望 | 由誰確保 |
|---|---|---|
| Trigger 視為 button | `<button type="button">` + `aria-label="什麼是匿名捐款？"` | AnonymousInfoTrigger |
| Trigger 暗示是 dialog 啟動 | `aria-haspopup="dialog"` | AnonymousInfoTrigger |
| Trigger 反映 open 狀態 | `aria-expanded={open}` | AnonymousInfoTrigger |
| Dialog 語意 | `role="dialog"` + `aria-modal="true"` | InfoDialog |
| Dialog 命名 | `aria-labelledby` → title h2 id | InfoDialog（useId） |
| Dialog 描述 | `aria-describedby` → body 段落 id | InfoDialog（useId） |
| 開啟時 focus 落在可聚焦元素 | dismiss button 自動 `.focus()` | InfoDialog useEffect |
| 關閉時焦點回 trigger | `triggerRef.current?.focus()` | AnonymousInfoTrigger.onClose |
| ESC 關閉 | document keydown listener | InfoDialog useEffect |
| Scrim click 關閉 | `e.target === e.currentTarget` 守門 | InfoDialog onClick |
| 背景滾動鎖 | `document.body.style.overflow = 'hidden'` | InfoDialog useEffect |
| 鍵盤可達 | Tab 可聚焦 trigger、Enter / Space 觸發 | 原生 button 行為，無自製 |
| 裝飾 icon 不被 SR 念 | `<svg aria-hidden="true">` | InfoIcon |
| Focus trap | v0.1 panel 內僅 1 個可聚焦元素（dismiss button），實務上 Tab 也只能停留同處；**未來若加連結 / 多按鈕需補完整 trap** | InfoDialog（v0.2 議題） |
| Reduce-motion | v0.1 無動畫；未來加 fade 時要尊重 `prefers-reduced-motion` | InfoDialog（未來） |

---

## 7. 測試（colocated `.test.tsx`，**強制 TDD**）

依 [CLAUDE.md](../../CLAUDE.md) 表格 — primitive、業務 hook、Client component 邏輯皆屬「強制 TDD」。

### 7.1 `InfoDialog.test.tsx`（primitive，5 case）

| # | 案例 | 期望 |
|---|---|---|
| 1 | `open=false` → 完全不渲染（getByRole('dialog') throws） | DOM 不污染 |
| 2 | `open=true` → 渲染 dialog + 套 `role="dialog"` + `aria-modal="true"` + title 顯示 | 基本渲染 |
| 3 | 按 ESC → `onClose` 被叫 1 次 | a11y |
| 4 | 點 scrim → `onClose` 被叫 1 次；點 panel 內部 → 不叫 | event-target 判斷 |
| 5 | 點 dismiss button → `onClose` 被叫 1 次 | 互動 |
| 6（optional） | `dismissLabel` prop → button 文字跟著變 | prop 流向 |
| 7（optional） | open 時 dismiss button 取得焦點 | a11y focus |

> 用 happy-dom + `@testing-library/user-event`；ESC key 用 `user.keyboard('{Escape}')`。

### 7.2 `AnonymousInfoTrigger.test.tsx`（composition，4 case）

| # | 案例 | 期望 |
|---|---|---|
| 1 | 預設只渲染 trigger button（含 `aria-label="什麼是匿名捐款？"`）、無 dialog | 初始 idle |
| 2 | 點 trigger → dialog 出現、title 顯示 `'什麼是匿名捐款？'`、body 顯示 `ANONYMOUS_INFO_BODY` | open 流程 |
| 3 | dialog open 時 trigger 的 `aria-expanded="true"`；close 後回 `"false"` | state 同步 |
| 4 | 點 dismiss → dialog 消失、焦點回 trigger button | close + focus restore |
| 5（optional） | `ANONYMOUS_INFO_TITLE` / `ANONYMOUS_INFO_BODY` 都是非空字串 const | 文案 const sanity |

### 7.3 Page-level integration（覆蓋已存 page test）

[009a `DonationConfirmPage.test.tsx`](../../src/app/checkout/donation/DonationConfirmPage.test.tsx) + [009b `PurchaseConfirmPage.test.tsx`](../../src/app/checkout/purchase/PurchaseConfirmPage.test.tsx) 各新增 1 case：

| # | 案例 | 期望 |
|---|---|---|
| `anon-info` | 收據選後、checkbox 出現 → 同時也有 `aria-label="什麼是匿名捐款？"` button；點之 → 跳 dialog 顯示 title | 整合 ok |

不重複測 trigger / dialog 內部行為（已在 §7.1 / §7.2 覆蓋），只驗「panel 內確實放了 AnonymousInfoTrigger」。

---

## 8. 開放問題

- **dialog 動畫 v0.1 不做**：直接 mount/unmount。若視覺檢視覺得太「彈出生硬」，v0.2 加 `transition-opacity` + `transition-transform scale-95→100`；需配套 `prefers-reduced-motion` 守則
- **Focus trap v0.1 不做**：dialog 內僅 1 個可聚焦元素，Tab 留原處實務上可接受。若 v0.2 加連結（如「了解更多 ›」）或第二顆 CTA，需補完整 trap（headless-ui style）
- **InfoIcon 圖示**：v0.1 inline SVG 為「實心圓 + 白 i」（同 ReminderNote 系列）；若 design 改用線框版（hollow circle + i），把 SVG 換成 stroke + 線框 path 即可，無 API 影響
- **未來其他 info popup 復用 InfoDialog**：保留可能性（例如收據開立方式各 option 展開）；當 rule of three 第三處出現時，考慮是否把文案系統抽成 `<InfoTrigger label={…} title={…} body={…} />` generic composition。v0.1 不做
- **dismiss button「我知道了」是否需要紀錄 metric**：v0.1 純 UI 行為；未來若 PM 要看「使用者讀到匿名說明 vs. 直接勾」比例，可在 `onClose` 加 `track('anonymous_info_dismissed')` hook 點。本 spec 不規劃
- **i18n**：`ANONYMOUS_INFO_TITLE` / `ANONYMOUS_INFO_BODY` / `dismissLabel='我知道了'` 三段中文字串硬編碼；i18n 上線後抽到 string table，component API 不變

---

## 9. 變更紀錄

| 版本 | 日期 | 變更 |
|---|---|---|
| 0.1 | 2026-06-16 | 初版：對應 IMG_4892（trigger 位置）+ IMG_4893（dialog 內容）。定義 `<InfoDialog>` generic primitive（置中浮層 / portal / scrim / a11y）+ `<AnonymousInfoTrigger>` 業務組合（icon button + state + 匿名捐款文案）。三層測試 plan（primitive 5 case + trigger 4 case + page integration 1 case）。標明替換 [009b §6.4 v0.4 InfoIcon 占位](./009b-purchase-confirm.md)、補進 [009a §5.7 v0.8 checkbox row](./009a-donation-confirm.md)。Focus trap / 動畫列入 v0.2 議題（v0.1 panel 內僅 1 可聚焦元素，trap 可暫緩） |
