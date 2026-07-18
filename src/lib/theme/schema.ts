import { z } from 'zod'

export const THEME_COOKIE = 'theme'
export const THEME_COOKIE_MAX_AGE = 31_536_000 // 1 year in seconds

export const themeSchema = z.enum(['light', 'dark'])
export type Theme = z.infer<typeof themeSchema>

/** 未知 / 缺省值收斂到 'dark'（spec 014a §3.2） */
export function parseTheme(raw: unknown): Theme {
  const result = themeSchema.safeParse(raw)
  return result.success ? result.data : 'dark'
}

/**
 * 組裝 document.cookie 字串（spec 014a §3.4）。
 * 純函式：抽出以便單元測試 Max-Age / Path / SameSite 等屬性，
 * 不依賴 DOM 或 next/headers。
 */
export function buildThemeCookieString(theme: Theme, isProd: boolean): string {
  const secure = isProd ? '; Secure' : ''
  return `${THEME_COOKIE}=${theme}; Max-Age=${THEME_COOKIE_MAX_AGE}; Path=/; SameSite=Lax${secure}`
}
