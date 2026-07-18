'use client'

import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from 'react'
import { buildThemeCookieString, type Theme } from './schema'

interface ThemeContextValue {
  theme: Theme
  toggle: () => void
  setTheme: (t: Theme) => void
}

const ThemeContext = createContext<ThemeContextValue | null>(null)

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext)
  if (!ctx) throw new Error('useTheme must be used inside ThemeProvider')
  return ctx
}

export function ThemeProvider({
  initialTheme = 'dark',
  children,
}: {
  initialTheme?: Theme
  children: ReactNode
}) {
  const [theme, setThemeState] = useState<Theme>(initialTheme)

  // spec 014b §I-5 / 014a §3.5 — mount 後掛 data-theme-ready，
  // 啟用 globals.css 的色彩 transition（首屏不動畫，只有使用者主動切換才有過渡）
  useEffect(() => {
    document.documentElement.setAttribute('data-theme-ready', '')
  }, [])

  const applyTheme = useCallback((next: Theme) => {
    // 即時更新 DOM（CSS cascade 立即重繪，color-scheme 同步跟隨）
    document.documentElement.dataset.theme = next

    // 寫入持久 cookie（client-writable；登出不清，spec 014a §3.2）
    // §I-1：不可 import server-only @/lib/config，用 process.env.NODE_ENV 判斷
    document.cookie = buildThemeCookieString(next, process.env.NODE_ENV === 'production')
  }, [])

  function toggle() {
    const next: Theme = theme === 'dark' ? 'light' : 'dark'
    setThemeState(next)
    applyTheme(next)
  }

  function setTheme(next: Theme) {
    setThemeState(next)
    applyTheme(next)
  }

  return (
    <ThemeContext.Provider value={{ theme, toggle, setTheme }}>
      {children}
    </ThemeContext.Provider>
  )
}
