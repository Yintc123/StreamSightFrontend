import 'server-only'
import { cookies } from 'next/headers'
import { parseTheme, THEME_COOKIE, type Theme } from './schema'

/** 從 Request cookie 讀取主題偏好，缺省或未知值收斂到 'dark'（spec 014a §3.3） */
export async function readThemeCookie(): Promise<Theme> {
  const store = await cookies()
  return parseTheme(store.get(THEME_COOKIE)?.value)
}
