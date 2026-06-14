# Spec 003k：FilterButton

- **狀態**：Draft（v0.5 — label 改 font-bold + whitespace-nowrap，視覺強調 + 防止長分類名稱換行）
- **路徑**：`src/components/ui/FilterButton.tsx`
- **依賴**：[003a Design System](./003a-design-system.md)、[003m CategoryMenu](./003m-category-menu.md)（由父層配對）
- **Figma 對應**：`_Filter Item`（componentId `1:1022`），在 frame `1:2339` 的 row 第一個元素
- **複用性**：**中** — label 由 props 控；可配任何「下拉觸發按鈕」場景

---

## 1. 職責

頁面 chrome 中的「分類 / 篩選」觸發按鈕。預設顯示「全部 ▼」；選了分類後顯示對應中文 label（如「動物保護 ▼」）。點擊觸發父層展開 [CategoryMenu](./003m-category-menu.md)。

> v0.2 預設 `disabled=true`（dropdown 內容缺）。**v0.3 啟用**（user 補功能：點擊展開分類選單）。

---

## 2. Props

```ts
type FilterButtonProps = {
  /** 當前顯示的 label。「全部」或某分類中文名（如「動物保護」）。 */
  label: string
  onClick: () => void
  /** Menu 是否展開；用於 aria-expanded 與 caret 旋轉動效。 */
  isOpen?: boolean
}
```

> v0.2 的 `disabled` prop 拿掉（不再需要）。

---

## 3. Anatomy

| 元素 | 規格 |
|---|---|
| Outer container | `inline-flex items-center bg-black/5 rounded-md px-3 py-1.5` |
| Label `<span>` | `text-sm leading-[22px] text-ink-AA whitespace-nowrap font-bold`（v0.5：粗體 + 不換行） |
| Caret icon | `w-4 h-4 ml-1 shrink-0 text-ink-AA transition-transform`，isOpen 時加 `rotate-180` |

Figma 細節對映：

| Figma | Tailwind |
|---|---|
| Background `palette/gray/100` (`#EDEDF1`) | `bg-black/5`（[003a §2](./003a-design-system.md#2-顏色-token) 統一） |
| `borderRadius: 6px` | `rounded-md` |
| Text style `ios/p2` 14/22 regular → v0.5 改 **bold** | `text-sm leading-[22px] font-bold` |
| Label 防換行（長分類名 e.g.「教育議題提倡」） | `whitespace-nowrap`（v0.5 新增） |
| Text fill `theme/text-AA` | `text-ink-AA` |
| caret_down SVG | Heroicons `<ChevronDownIcon />` 或自繪 |

```tsx
'use client'

function ChevronDownIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 20 20"
      fill="currentColor"
      aria-hidden
      className={className}
    >
      <path
        fillRule="evenodd"
        d="M5.23 7.21a.75.75 0 011.06.02L10 11.06l3.71-3.83a.75.75 0 111.08 1.04l-4.25 4.39a.75.75 0 01-1.08 0L5.21 8.27a.75.75 0 01.02-1.06z"
        clipRule="evenodd"
      />
    </svg>
  )
}

export function FilterButton({ label, onClick, isOpen = false }: FilterButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-haspopup="dialog"
      aria-expanded={isOpen}
      aria-label={`篩選：${label}`}
      className="inline-flex items-center bg-black/5 rounded-md px-3 py-1.5
                 text-sm leading-[22px] text-ink-AA"
    >
      <span className="whitespace-nowrap font-bold">{label}</span>
      <ChevronDownIcon
        className={`w-4 h-4 ml-1 shrink-0 text-ink-AA transition-transform ${isOpen ? 'rotate-180' : ''}`}
      />
    </button>
  )
}
```

> 自繪 SVG inline 而非引 `@heroicons/react`：省 dep + 控制 size 更直接。SVG 8 行 path 為 Heroicons `chevron-down` 公版簡化。

> caret 用 `transition-transform` + `rotate-180`：開啟時翻轉視覺，user 知道「點同個按鈕可關閉」。

---

## 4. 互動

| 動作 | 行為 |
|---|---|
| 點擊 | `onClick()`（父層 toggle isOpen） |
| `aria-expanded` 切換 | 父層傳新 `isOpen` 後本元件自動反映 |
| Tab focus | 預設 `<button>` 行為 |
| Enter / Space | 觸 onClick → 父層 toggle |

---

## 5. 變體

| 條件 | 視覺 |
|---|---|
| `label='全部'` + `isOpen=false` | 「全部 ▼」 |
| `label='動物保護'` + `isOpen=true` | 「動物保護 ▲」(caret 翻轉) |

---

## 6. 狀態

純展示。父層管 isOpen / 顯示文字。

---

## 7. 測試（colocated `FilterButton.test.tsx`）

- 渲染 label
- caret icon 存在且 `aria-hidden`
- 點擊觸 onClick
- `aria-label="篩選：全部"`
- `aria-haspopup="dialog"`（v0.4：對齊 [003m](./003m-category-menu.md) `role="dialog"`）
- `aria-expanded=false` / `true` 反映 isOpen
- isOpen=true 時 caret 有 `rotate-180` class
- v0.5：label span 含 `font-bold` + `whitespace-nowrap`（防長分類名換行 / 視覺強調當前篩選）

---

## 8. a11y

- `<button type="button">` semantic
- `aria-haspopup="dialog"` 告知 SR 點擊會打開 dialog（對齊 [003m CategoryMenu](./003m-category-menu.md) `role="dialog"`；v0.4 修正自 v0.3 的 `"menu"`）
- `aria-expanded` 反映展開狀態
- `aria-label` 表達「這是篩選按鈕」+ 當前選項
- caret icon `aria-hidden`（裝飾）

---

## 9. 開放問題

- ~~icon library~~：v0.4 改為**自繪 SVG inline**（§3 程式碼），不引 `@heroicons/react`；要全 app 多處用 chevron 再考慮抽 `<ChevronDown />` shared component
- **disabled 場景**：用 CSS `disabled:opacity-50`；本元件目前沒接 disabled prop，若未來 categories 載入中要 disable，加 prop
- **多語**：label 文字目前直接傳中文；i18n 場景由父層解析

---

## 10. 變更紀錄

| 版本 | 日期 | 變更 |
|---|---|---|
| 0.2 | 2026-06-14 | 初版（Figma 對齊；`disabled=true` 預設，dropdown 內容缺） |
| 0.3 | 2026-06-14 | user 補功能：拿掉 disabled、加 isOpen 反映展開、加 onClick 串接 [003m CategoryMenu](./003m-category-menu.md)、caret 旋轉動效 |
| 0.4 | 2026-06-14 | `aria-haspopup` 從 `"menu"` 改為 `"dialog"` 對齊 003m v0.4 bottom-sheet modal `role="dialog"`（ARIA pattern 配對修正） |
| 0.5 | 2026-06-14 | label `<span>` 加 `font-bold` + `whitespace-nowrap`：(1) 粗體強調當前篩選分類；(2) 長分類名如「教育議題提倡」「身心障礙服務」遇窄欄不換行影響 chevron 對齊。caret / aria 不變 |
