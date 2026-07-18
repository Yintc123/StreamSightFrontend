import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ThemeToggle } from './ThemeToggle'
import type { Theme } from '@/lib/theme/schema'

// 014b §6 — 測試時 mock useTheme，不依賴 ThemeProvider 實作（014a）
const mockToggle = vi.fn()
vi.mock('@/lib/theme/ThemeProvider', () => ({
  useTheme: () => ({ theme: mockTheme, toggle: mockToggle, setTheme: vi.fn() }),
}))

// 模組 scope 外無法直接改 let，改用 getter 讓每次 useTheme() 呼叫取到最新值
let mockTheme: Theme = 'dark'

beforeEach(() => {
  mockTheme = 'dark'
  mockToggle.mockClear()
})

describe('ThemeToggle', () => {
  describe('初始狀態（dark）', () => {
    it('aria-label 為「切換為淺色」', () => {
      render(<ThemeToggle />)
      expect(screen.getByRole('button', { name: '切換為淺色' })).toBeInTheDocument()
    })

    it('aria-pressed=false（light 尚未啟用）', () => {
      render(<ThemeToggle />)
      expect(screen.getByRole('button', { name: '切換為淺色' })).toHaveAttribute(
        'aria-pressed',
        'false',
      )
    })
  })

  describe('初始狀態（light）', () => {
    beforeEach(() => {
      mockTheme = 'light'
    })

    it('aria-label 為「切換為深色」', () => {
      render(<ThemeToggle />)
      expect(screen.getByRole('button', { name: '切換為深色' })).toBeInTheDocument()
    })

    it('aria-pressed=true（light 已啟用）', () => {
      render(<ThemeToggle />)
      expect(screen.getByRole('button', { name: '切換為深色' })).toHaveAttribute(
        'aria-pressed',
        'true',
      )
    })
  })

  describe('互動', () => {
    it('點擊 → 呼叫 toggle()', async () => {
      const user = userEvent.setup()
      render(<ThemeToggle />)
      await user.click(screen.getByRole('button'))
      expect(mockToggle).toHaveBeenCalledTimes(1)
    })

    it('鍵盤 Enter → 呼叫 toggle()', async () => {
      const user = userEvent.setup()
      render(<ThemeToggle />)
      screen.getByRole('button').focus()
      await user.keyboard('{Enter}')
      expect(mockToggle).toHaveBeenCalledTimes(1)
    })

    it('鍵盤 Space → 呼叫 toggle()', async () => {
      const user = userEvent.setup()
      render(<ThemeToggle />)
      screen.getByRole('button').focus()
      await user.keyboard(' ')
      expect(mockToggle).toHaveBeenCalledTimes(1)
    })
  })

  describe('元素結構', () => {
    it('type="button"（不觸發表單送出）', () => {
      render(<ThemeToggle />)
      expect(screen.getByRole('button')).toHaveAttribute('type', 'button')
    })

    it('包含 SVG（inline 圖示）', () => {
      const { container } = render(<ThemeToggle />)
      expect(container.querySelector('svg')).toBeInTheDocument()
    })

    it('SVG 有 aria-hidden（不讓 SR 讀圖示）', () => {
      const { container } = render(<ThemeToggle />)
      const svg = container.querySelector('svg')
      expect(svg).toHaveAttribute('aria-hidden', 'true')
    })
  })
})
