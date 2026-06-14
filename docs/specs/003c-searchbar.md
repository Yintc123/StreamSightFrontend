# Spec 003c：SearchBar

- **狀態**：Draft（v0.2 — 加 `autoFocus` prop；spec §1 兩模式論述還原）
- **路徑**：`src/components/ui/SearchBar.tsx`
- **依賴**：[003a Design System](./003a-design-system.md)、`public/figma/icon-magnifier.svg`
- **Figma 對應**：component `1:290`（`search bar / status=typing`）
- **複用性**：**高** — 純受控元件（value / onChange / onCancel），無業務字眼；可在所有列表頁、選單篩選使用

---

## 1. 職責

提供關鍵字輸入：放大鏡 icon + 輸入欄 + 「取消」按鈕。本元件本身**永遠展開**；collapsed 狀態（只有放大鏡 icon 的觸發按鈕）由 [003i Shell](./003i-charity-list-shell.md#34-browse-vs-search-兩模式layout) 自繪小 `<button>`，點下後切到「search 模式」並 mount `<SearchBar>`。SearchBar 不感知模式切換、不持有 isSearching state。

v0.2 加 `autoFocus` prop：進入 search 模式時，Shell 用 `<SearchBar autoFocus>` 讓 input 自動取得 focus（mobile 自動開鍵盤）。

debounce / URL sync 邏輯**不**在本元件內 — 由 [003i CharityListShell](./003i-charity-list-shell.md) 透過 props 控制（受控元件）。

---

## 2. Props

```ts
type SearchBarProps = {
  value: string
  onChange: (next: string) => void
  /** 點「取消」時呼叫；元件內會 blur input + 清空 value */
  onCancel?: () => void
  placeholder?: string
  /** mount 時自動 focus input（搜尋模式進入時開鍵盤）；v0.2 新增 */
  autoFocus?: boolean
}
```

---

## 3. Anatomy

| 元素 | 規格 |
|---|---|
| Outer container | `flex items-center w-full` |
| Input field wrapper | `flex-1 flex items-center gap-[9px] py-[9px] px-3 bg-black/5 rounded-[20px]` |
| Magnifier icon | `w-5 h-5 shrink-0 opacity-50` 用 `/figma/icon-magnifier.svg` |
| Input | `flex-1 bg-transparent text-sm leading-[22px] text-ink-AAA placeholder:text-ink-A focus:outline-none` |
| Cancel button | `py-[6px] pl-3 text-base leading-6 text-ink-link`（顯示條件見 §5） |

```tsx
'use client'
import { useRef } from 'react'

export function SearchBar({ value, onChange, onCancel, placeholder = '搜尋公益團體' }: SearchBarProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const handleCancel = () => {
    onChange('')
    onCancel?.()
    inputRef.current?.blur()
  }
  return (
    <div className="flex items-center w-full">
      <div className="flex-1 flex items-center gap-[9px] py-[9px] px-3 bg-black/5 rounded-[20px]">
        <img src="/figma/icon-magnifier.svg" alt="" className="w-5 h-5 shrink-0 opacity-50" />
        <input
          ref={inputRef}
          type="search"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          className="flex-1 bg-transparent text-sm leading-[22px] text-ink-AAA placeholder:text-ink-A focus:outline-none"
        />
      </div>
      {value && (
        <button
          onClick={handleCancel}
          className="py-[6px] pl-3 text-base leading-6 text-ink-link shrink-0"
        >
          取消
        </button>
      )}
    </div>
  )
}
```

---

## 4. 互動

| 動作 | 行為 |
|---|---|
| 輸入文字 | 觸發 `onChange(next)` — 即時，不 debounce（debounce 在 shell 層） |
| 按「取消」 | `onChange('')` → `onCancel?.()` → `inputRef.blur()`（mobile 收鍵盤） |
| Enter | 預設行為（`type="search"` 在 mobile 會送 form submit；本作業無 form，無實際影響） |
| ESC | 元件不接；可後續加 |

---

## 5. 變體

| 狀態 | 「取消」按鈕 |
|---|---|
| `value === ''` | 隱藏（避免空狀態多餘按鈕） |
| `value !== ''` | 顯示 |

> Figma 三個 target frame 都填了 `"流浪動物"`，所以畫面上都看得到取消。`value === ''` 的視覺由本 spec 推定。

---

## 6. 焦點 / 鍵盤

- Mobile：輸入欄 focus → OS 自動展開鍵盤（無需元件處理）
- Desktop：focus ring 由 `focus:outline-none` 抑制（Figma 無 focus ring）；用戶可看到 caret 即可

> a11y 妥協：完全去掉 focus ring 不友善。`focus-visible:ring-1 ring-ink-A` 是合理 enhancement，但 Figma 沒給故本 spec 不強制。

---

## 7. 測試（colocated `SearchBar.test.tsx`）

- 受控：給 `value="foo"` 渲染後 input 顯示 `foo`
- 輸入觸 `onChange`：fire `userEvent.type(input, 'a')` → `onChange` 被呼叫且收到 `"fooa"`
- `value=''` 時取消按鈕不渲染
- `value='x'` 時取消按鈕渲染；點擊觸 `onChange('')` + `onCancel`
- 點「取消」後 input 不再 focused（spy `blur`）
- 放大鏡 icon 渲染
- `autoFocus=true` → mount 時 input 取得 focus（v0.2）
- `autoFocus=false` (default) → mount 時 input 不 focus（v0.2）

---

## 8. a11y

- `<input type="search">`（mobile 鍵盤顯示放大鏡 + 「搜尋」按鈕）
- placeholder 文字（不依賴語意；視覺輔助）
- 取消按鈕用 `<button>`（非 link）；無 aria-label，文字「取消」已 semantic
- 放大鏡 svg `alt=""`（裝飾）

---

## 9. 開放問題

- **focus visible ring**：a11y 友善的 keyboard-focus 樣式（`focus-visible:ring-2 ring-ink-A`）— 評估後加
- **Loading spinner**：搜尋進行中要不要在搜尋欄右側顯示 spinner？Figma `1:290` 有 `spinner` componentProperty 但目標 frame 都 `false`；本 spec 不接
- **Clear (X) icon vs 「取消」**：iOS 慣用 X icon 在 input 內，本 spec 跟 Figma 用「取消」文字 button 在 input 外
- **「取消」是否清空 + 收鍵盤**：目前一鍵兩效。若評審覺得「取消應只是收鍵盤、保留文字」，分成 `onCancel` 不清值 + `onChange('')` 由外層觸發
