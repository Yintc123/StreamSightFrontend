'use client'
import { useEffect, useRef } from 'react'

type Options = {
  enabled: boolean
  /** 觸發閾值；0.1 = 「距底 10% 內」觸發。預設 0.1。 */
  threshold?: number
  onTrigger: () => void
}

/**
 * Spec 002 §7.3 — scroll-percent sentinel
 *
 * 對應 brief「scroll bar 距底剩 5%~10% 觸發」。
 * 與 v0.1 IntersectionObserver-rootMargin 相比：用相對百分比，長短頁面行為一致。
 */
export function useScrollPercentSentinel(opts: Options) {
  const fired = useRef(false)
  useEffect(() => {
    if (!opts.enabled) {
      fired.current = false
      return
    }
    const threshold = opts.threshold ?? 0.1

    function check() {
      const doc = document.documentElement
      const scrollTop = doc.scrollTop || window.scrollY
      const distFromBottom = doc.scrollHeight - scrollTop - doc.clientHeight
      const percentFromBottom = distFromBottom / Math.max(doc.scrollHeight, 1)
      if (percentFromBottom <= threshold) {
        if (!fired.current) {
          fired.current = true
          opts.onTrigger()
        }
      } else {
        fired.current = false
      }
    }

    check() // 初始檢查（content 不夠長時直接觸）
    window.addEventListener('scroll', check, { passive: true })
    window.addEventListener('resize', check, { passive: true })
    return () => {
      window.removeEventListener('scroll', check)
      window.removeEventListener('resize', check)
    }
  }, [opts.enabled, opts.threshold, opts.onTrigger, opts])
}
