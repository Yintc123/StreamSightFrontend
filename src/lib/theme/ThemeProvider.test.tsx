import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ThemeProvider, useTheme } from './ThemeProvider'
import { THEME_COOKIE } from './schema'

// cookie 字串格式（Max-Age / Path / SameSite）已由 schema.test.ts 的
// buildThemeCookieString 覆蓋，此處只驗 DOM 整合行為（dataset + cookie 值）。

beforeEach(() => {
  document.documentElement.removeAttribute('data-theme')
  document.documentElement.removeAttribute('data-theme-ready')
  // 清空 happy-dom cookie jar（避免跨 test 汙染）
  document.cookie = `${THEME_COOKIE}=; Max-Age=0; Path=/`
})

// --- 消費 context 的輔助元件 -------------------------------------------------
function Consumer() {
  const { theme, toggle } = useTheme()
  return (
    <div>
      <span data-testid="theme">{theme}</span>
      <button type="button" onClick={toggle}>
        toggle
      </button>
    </div>
  )
}

// -----------------------------------------------------------------------------

describe('ThemeProvider', () => {
  describe('initialTheme 決定初值', () => {
    it('initialTheme="dark" → context.theme = "dark"', () => {
      render(
        <ThemeProvider initialTheme="dark">
          <Consumer />
        </ThemeProvider>,
      )
      expect(screen.getByTestId('theme').textContent).toBe('dark')
    })

    it('initialTheme="light" → context.theme = "light"', () => {
      render(
        <ThemeProvider initialTheme="light">
          <Consumer />
        </ThemeProvider>,
      )
      expect(screen.getByTestId('theme').textContent).toBe('light')
    })

    it('省略 initialTheme → 預設 "dark"', () => {
      render(
        <ThemeProvider>
          <Consumer />
        </ThemeProvider>,
      )
      expect(screen.getByTestId('theme').textContent).toBe('dark')
    })
  })

  describe('toggle() 翻轉主題', () => {
    it('dark → light', async () => {
      const user = userEvent.setup()
      render(
        <ThemeProvider initialTheme="dark">
          <Consumer />
        </ThemeProvider>,
      )
      await user.click(screen.getByRole('button'))
      expect(screen.getByTestId('theme').textContent).toBe('light')
    })

    it('light → dark', async () => {
      const user = userEvent.setup()
      render(
        <ThemeProvider initialTheme="light">
          <Consumer />
        </ThemeProvider>,
      )
      await user.click(screen.getByRole('button'))
      expect(screen.getByTestId('theme').textContent).toBe('dark')
    })
  })

  describe('DOM 同步', () => {
    it('toggle 後 documentElement.dataset.theme 更新為 "light"', async () => {
      const user = userEvent.setup()
      render(
        <ThemeProvider initialTheme="dark">
          <Consumer />
        </ThemeProvider>,
      )
      await user.click(screen.getByRole('button'))
      expect(document.documentElement.dataset.theme).toBe('light')
    })

    it('mount 後掛 data-theme-ready（FOUC guard）', () => {
      render(
        <ThemeProvider initialTheme="dark">
          <Consumer />
        </ThemeProvider>,
      )
      expect(document.documentElement.hasAttribute('data-theme-ready')).toBe(true)
    })
  })

  describe('cookie 寫入', () => {
    it('toggle 後 document.cookie 含 theme=light', async () => {
      const user = userEvent.setup()
      render(
        <ThemeProvider initialTheme="dark">
          <Consumer />
        </ThemeProvider>,
      )
      await user.click(screen.getByRole('button'))
      // happy-dom cookie getter 只回 name=value 對
      expect(document.cookie).toContain(`${THEME_COOKIE}=light`)
    })

    it('toggle 回 dark 時 document.cookie 含 theme=dark', async () => {
      const user = userEvent.setup()
      render(
        <ThemeProvider initialTheme="light">
          <Consumer />
        </ThemeProvider>,
      )
      await user.click(screen.getByRole('button'))
      expect(document.cookie).toContain(`${THEME_COOKIE}=dark`)
    })
  })

  describe('useTheme 在 Provider 外拋錯', () => {
    it('沒有 ThemeProvider 包裹時拋 Error', () => {
      const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
      expect(() => render(<Consumer />)).toThrow('useTheme must be used inside ThemeProvider')
      spy.mockRestore()
    })
  })
})
