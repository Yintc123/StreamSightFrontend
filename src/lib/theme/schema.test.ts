import { describe, it, expect } from 'vitest'
import {
  themeSchema,
  parseTheme,
  buildThemeCookieString,
  THEME_COOKIE,
  THEME_COOKIE_MAX_AGE,
} from './schema'

describe('themeSchema', () => {
  it('happy：light 通過', () => {
    expect(themeSchema.parse('light')).toBe('light')
  })

  it('happy：dark 通過', () => {
    expect(themeSchema.parse('dark')).toBe('dark')
  })

  it('edge：未知字串拋 ZodError', () => {
    expect(() => themeSchema.parse('blue')).toThrow()
  })

  it('edge：undefined 拋 ZodError', () => {
    expect(() => themeSchema.parse(undefined)).toThrow()
  })

  it('edge：空字串拋 ZodError', () => {
    expect(() => themeSchema.parse('')).toThrow()
  })
})

describe('parseTheme', () => {
  it('happy：light → "light"', () => {
    expect(parseTheme('light')).toBe('light')
  })

  it('happy：dark → "dark"', () => {
    expect(parseTheme('dark')).toBe('dark')
  })

  it('edge：未知字串 "blue" → "dark"', () => {
    expect(parseTheme('blue')).toBe('dark')
  })

  it('edge：undefined → "dark"', () => {
    expect(parseTheme(undefined)).toBe('dark')
  })

  it('edge：空字串 → "dark"', () => {
    expect(parseTheme('')).toBe('dark')
  })

  it('edge：null → "dark"', () => {
    expect(parseTheme(null)).toBe('dark')
  })

  it('edge：數字 → "dark"', () => {
    expect(parseTheme(42)).toBe('dark')
  })
})

describe('buildThemeCookieString', () => {
  it('包含 theme=light', () => {
    expect(buildThemeCookieString('light', false)).toContain('theme=light')
  })

  it('包含 Max-Age=' + THEME_COOKIE_MAX_AGE, () => {
    expect(buildThemeCookieString('light', false)).toContain(
      `Max-Age=${THEME_COOKIE_MAX_AGE}`,
    )
  })

  it('包含 Path=/', () => {
    expect(buildThemeCookieString('light', false)).toContain('Path=/')
  })

  it('包含 SameSite=Lax', () => {
    expect(buildThemeCookieString('light', false)).toContain('SameSite=Lax')
  })

  it('isProd=false → 不含 Secure', () => {
    expect(buildThemeCookieString('light', false)).not.toContain('Secure')
  })

  it('isProd=true → 含 Secure', () => {
    expect(buildThemeCookieString('light', true)).toContain('Secure')
  })
})

describe('常數', () => {
  it('THEME_COOKIE 值為 "theme"', () => {
    expect(THEME_COOKIE).toBe('theme')
  })

  it('THEME_COOKIE_MAX_AGE 為一年秒數（31536000）', () => {
    expect(THEME_COOKIE_MAX_AGE).toBe(31_536_000)
  })
})
