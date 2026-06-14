'use client'
import { useEffect } from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'

/**
 * Spec 002 §7.2 — useUrlSync
 *
 * 把指定的 keys 同步進 URL `?key=value`：
 *  - 值為非空 string → set
 *  - 值為空字串 / undefined → delete
 *  - 既有 search params（如 utm=abc）保留
 *
 * 一律用 `router.replace({ scroll: false })`：
 *  - replace 而非 push：tab/q/category 切換不污染 history
 *  - scroll: false：避免每次 URL 變動 scroll-to-top
 *  - back/forward 的 scroll 由 browser history state 處理（不受影響）
 *
 * **重要：只在 URL 實際需要變動時才呼叫 replace**
 * 否則 Next 16 dev 會把每次 replace 當成 navigation、fetch 新 RSC payload，
 * 而 searchParams 是 useEffect deps → 又觸發 effect → 又 replace → 無限 loop
 * + 後端 spam call。
 */
export function useUrlSync(params: Record<string, string | undefined>): void {
  const router = useRouter()
  const searchParams = useSearchParams()
  const pathname = usePathname()
  const depsValues = Object.values(params)

  useEffect(() => {
    const next = new URLSearchParams(searchParams.toString())
    for (const [k, v] of Object.entries(params)) {
      if (v && v.length > 0) next.set(k, v)
      else next.delete(k)
    }
    const newQs = next.toString()
    const currentQs = searchParams.toString()
    if (newQs === currentQs) return // 已同步，避免無限 loop
    // 帶上 pathname：router.replace('') 不會清掉 querystring（保持 current URL），
    // 必須用 `${pathname}` 才能真正 drop 全部 params。
    router.replace(newQs ? `${pathname}?${newQs}` : pathname, { scroll: false })
    // params is a fresh object each render; flatten value-deps so the effect
    // only re-fires when an actual value changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router, searchParams, pathname, ...depsValues])
}
