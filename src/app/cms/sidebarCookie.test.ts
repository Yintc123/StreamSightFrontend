import { describe, it, expect } from 'vitest'

import {
  extractSidebarWidthRaw,
  parseSidebarWidthCookie,
  buildSidebarWidthCookieString,
  SIDEBAR_COOKIE,
  SIDEBAR_COOKIE_MAX_AGE,
} from './sidebarCookie'

describe('extractSidebarWidthRaw（抽出 sidebar_width 原始值，供快照）', () => {
  it('happy：單一 cookie → 抽出值字串', () => {
    expect(extractSidebarWidthRaw('sidebar_width=320')).toBe('320')
  })

  it('happy：多 cookie 夾雜（前後有 theme 等）→ 仍抽出正確值', () => {
    expect(
      extractSidebarWidthRaw('theme=dark; sidebar_width=480; other=1'),
    ).toBe('480')
  })

  it('edge：缺 key → null', () => {
    expect(extractSidebarWidthRaw('theme=dark')).toBeNull()
  })

  it('edge：空字串 → null', () => {
    expect(extractSidebarWidthRaw('')).toBeNull()
  })

  it('edge：非整數值 "320.5" 不部分匹配 → null', () => {
    expect(extractSidebarWidthRaw('sidebar_width=320.5')).toBeNull()
  })

  it('edge：非數字值 "abc" → null', () => {
    expect(extractSidebarWidthRaw('sidebar_width=abc')).toBeNull()
  })
})

describe('parseSidebarWidthCookie（抽值 → 整數 → 值域檢查）', () => {
  it('happy：sidebar_width=320 → 320', () => {
    expect(parseSidebarWidthCookie('sidebar_width=320')).toBe(320)
  })

  it('happy：多 cookie 中取值', () => {
    expect(parseSidebarWidthCookie('theme=dark; sidebar_width=256')).toBe(256)
  })

  it('邊界：200 / 600 通過', () => {
    expect(parseSidebarWidthCookie('sidebar_width=200')).toBe(200)
    expect(parseSidebarWidthCookie('sidebar_width=600')).toBe(600)
  })

  it('edge：越界 199 / 601 → null（不 clamp，交由退路鏈）', () => {
    expect(parseSidebarWidthCookie('sidebar_width=199')).toBeNull()
    expect(parseSidebarWidthCookie('sidebar_width=601')).toBeNull()
  })

  it('edge：缺 key → null', () => {
    expect(parseSidebarWidthCookie('theme=light')).toBeNull()
  })

  it('edge：空字串 → null', () => {
    expect(parseSidebarWidthCookie('')).toBeNull()
  })

  it('edge：非數字 → null', () => {
    expect(parseSidebarWidthCookie('sidebar_width=abc')).toBeNull()
  })
})

describe('buildSidebarWidthCookieString（對齊 buildThemeCookieString 形狀）', () => {
  it('包含 sidebar_width=<n>', () => {
    expect(buildSidebarWidthCookieString(320, false)).toContain(
      'sidebar_width=320',
    )
  })

  it('包含 Max-Age=' + SIDEBAR_COOKIE_MAX_AGE, () => {
    expect(buildSidebarWidthCookieString(320, false)).toContain(
      `Max-Age=${SIDEBAR_COOKIE_MAX_AGE}`,
    )
  })

  it('包含 Path=/', () => {
    expect(buildSidebarWidthCookieString(320, false)).toContain('Path=/')
  })

  it('包含 SameSite=Lax', () => {
    expect(buildSidebarWidthCookieString(320, false)).toContain('SameSite=Lax')
  })

  it('isProd=false → 不含 Secure', () => {
    expect(buildSidebarWidthCookieString(320, false)).not.toContain('Secure')
  })

  it('isProd=true → 含 Secure', () => {
    expect(buildSidebarWidthCookieString(320, true)).toContain('Secure')
  })
})

describe('常數（跨 repo cookie 契約 §3.1）', () => {
  it('SIDEBAR_COOKIE 值為 "sidebar_width"', () => {
    expect(SIDEBAR_COOKIE).toBe('sidebar_width')
  })

  it('SIDEBAR_COOKIE_MAX_AGE 為一年秒數（31536000）', () => {
    expect(SIDEBAR_COOKIE_MAX_AGE).toBe(31_536_000)
  })
})
