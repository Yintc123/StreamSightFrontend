/**
 * Charity logo fallback 縮寫規則（[003e1 §3.1](docs/specs/003e1-charity-card.md#31-logo--fallback-dom)）
 *
 * 抽出至獨立檔（非 'use client'），讓 server components (e.g. /charities/[id]
 * detail page) 也能 import；CharityCard 仍可 client-side 使用。
 */
export function getCharityInitial(name: string): string {
  const trimmed = name.trimStart()
  if (!trimmed) return ''
  const first = trimmed[0]
  // ASCII 英數 → 取前 2 個 ASCII alphanumeric，轉大寫
  if (/[A-Za-z0-9]/.test(first)) {
    return trimmed.replace(/[^A-Za-z0-9]/g, '').slice(0, 2).toUpperCase()
  }
  // 非 ASCII → 取第一個 grapheme（Array.from 處理多 code-point emoji）
  return Array.from(trimmed)[0] ?? ''
}
