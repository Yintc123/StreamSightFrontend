'use client'
import { useEffect, useState } from 'react'

/**
 * Spec 002 §1.3 v0.6 — viewport hint passed to BFF list endpoints so the
 * server picks per-tab limit (item: mobile 4 / tablet 6 / desktop 12).
 *
 * Breakpoints align with Tailwind:
 *   - mobile : < 768px        (no prefix)
 *   - tablet : 768 ~ 1023px   (`md:`)
 *   - desktop: ≥ 1024px       (`lg:`)
 *
 * SSR-safe: initial state is 'mobile' (server has no viewport). After
 * mount, two `matchMedia` queries decide the bucket. Non-mobile users may
 * see one extra fetch on initial visit when the hook upgrades the value.
 */
const TABLET_MIN_QUERY = '(min-width: 768px)'
const DESKTOP_MIN_QUERY = '(min-width: 1024px)'

export type Viewport = 'mobile' | 'tablet' | 'desktop'

function pick(isDesktop: boolean, isTabletOrUp: boolean): Viewport {
  if (isDesktop) return 'desktop'
  if (isTabletOrUp) return 'tablet'
  return 'mobile'
}

export function useViewport(): Viewport {
  const [viewport, setViewport] = useState<Viewport>('mobile')

  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return
    const desktopMql = window.matchMedia(DESKTOP_MIN_QUERY)
    const tabletMql = window.matchMedia(TABLET_MIN_QUERY)
    const apply = () =>
      setViewport(pick(desktopMql.matches, tabletMql.matches))
    apply()
    desktopMql.addEventListener('change', apply)
    tabletMql.addEventListener('change', apply)
    return () => {
      desktopMql.removeEventListener('change', apply)
      tabletMql.removeEventListener('change', apply)
    }
  }, [])

  return viewport
}
