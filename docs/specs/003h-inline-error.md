# Spec 003h：InlineError

- **狀態**：Draft
- **路徑**：`src/components/ui/InlineError.tsx`
- **依賴**：[003a Design System](./003a-design-system.md)
- **Figma 對應**：（無；本 spec 自定，低調樣式以不搶其他狀態主視覺）
- **複用性**：**高** — `message / onRetry` 純 props，無業務字眼；任何 fetch 錯誤都能用

---

## 1. 職責

「載入失敗」狀態的占位元件。顯示錯誤訊息 + Retry 按鈕。視覺保守（不誇張、不紅色 alert 風格）— 跟 EmptyState 一致的「居中、克制」風格。

---

## 2. Props

```ts
type InlineErrorProps = {
  message?: string  // 預設「連線失敗，請稍候再試」
  onRetry: () => void
}
```

---

## 3. Anatomy

| 元素 | 規格 |
|---|---|
| Container | `flex flex-col items-center gap-3 py-8 px-4 text-center` |
| Message | `text-sm text-ink-AA` |
| Retry button | `px-4 py-2 bg-brand text-white rounded-full text-sm hover:opacity-90 active:opacity-80` |

```tsx
export function InlineError({
  message = '連線失敗，請稍候再試',
  onRetry,
}: InlineErrorProps) {
  return (
    <div className="flex flex-col items-center gap-3 py-8 px-4 text-center" role="alert">
      <p className="text-sm text-ink-AA">{message}</p>
      <button
        onClick={onRetry}
        type="button"
        className="px-4 py-2 bg-brand text-white rounded-full text-sm hover:opacity-90 active:opacity-80"
      >
        重試
      </button>
    </div>
  )
}
```

---

## 4. 使用情境

| 來源 | Props |
|---|---|
| [003j CharityList](./003j-charity-list.md) status === `error`（first page 失敗） | `message={error.message}`、`onRetry={refetch}` |
| 同上 fetch-next-page 失敗（已有 cached 資料） | `message="載入下一頁失敗"`、`onRetry={fetchNextPage}` — 接在 sentinel 處而非取代列表 |
| `src/app/donation/error.tsx`（Next 16 error boundary） | `onRetry={reset}` |

---

## 5. 變體

由 props 控；無內建變體。

> 開放問題 §8：未來若要分「網路錯」/「rate-limit 429」/「server 5xx」用不同 message tone，可加 `severity?: 'warning' | 'error'` prop。

---

## 6. 測試（colocated `InlineError.test.tsx`）

- 渲染預設 message
- 渲染自訂 message
- 按 retry button 觸 onRetry
- button type 為 button（避免 form submit）

---

## 7. a11y

- `role="alert"`：搜尋進入錯誤時，screen reader 立即讀出 message
- `<button type="button">` semantic
- 不依賴顏色傳達狀態（文字 + button 已表達「錯了、可重試」）

> `role="alert"` 在 screen reader 內會打斷正在念的內容；若評估太突兀可改 `role="status" aria-live="polite"` 但延遲讀出。

---

## 8. 開放問題

- **錯誤分類**：目前 message 為自由字串；可拆 `errorCode` prop 讓元件依碼選預設文案（429 → 「請稍候再試」、5xx → 「系統繁忙」）
- **Retry 動效 / loading state**：重試中要不要 disable button + spinner？目前 onRetry 立即觸發；若 retry 本身慢，可加 `isRetrying` prop
- **Toast vs inline**：第一次 fetch 失敗用 inline（取代列表）合理；fetch-next 失敗用 inline 也可以但 toast 可能更不擾人 — 等實作時看 UX 評估
- **rate-limit 提示**：backend 429 是否提示「請稍候 N 秒」？需要 backend 回 Retry-After header，並由 BFF 透傳
