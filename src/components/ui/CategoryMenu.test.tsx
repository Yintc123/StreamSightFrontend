import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { act, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { CategoryMenu } from './CategoryMenu'

describe('CategoryMenu', () => {
  beforeEach(() => {
    // 清空 body inline style，避免測試彼此污染
    document.body.style.overflow = ''
  })

  afterEach(() => {
    document.body.style.overflow = ''
  })

  it('isOpen=false → 不渲染 dialog', () => {
    render(
      <CategoryMenu
        isOpen={false}
        selectedCategory={null}
        onSelect={() => {}}
        onClose={() => {}}
      />,
    )
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('isOpen=true → 渲染 17 個 option（全部 + 16 categories）', () => {
    render(
      <CategoryMenu
        isOpen={true}
        selectedCategory={null}
        onSelect={() => {}}
        onClose={() => {}}
      />,
    )
    const radios = screen.getAllByRole('radio')
    expect(radios.length).toBe(17)
    expect(screen.getByRole('radio', { name: '全部' })).toBeInTheDocument()
    expect(screen.getByRole('radio', { name: '動物保護' })).toBeInTheDocument()
    expect(screen.getByRole('radio', { name: '國際救援' })).toBeInTheDocument()
  })

  it('selectedCategory=null → 「全部」aria-checked=true 且帶 border-brand', () => {
    render(
      <CategoryMenu
        isOpen={true}
        selectedCategory={null}
        onSelect={() => {}}
        onClose={() => {}}
      />,
    )
    const all = screen.getByRole('radio', { name: '全部' })
    expect(all).toHaveAttribute('aria-checked', 'true')
    expect(all.className).toMatch(/border-brand/)
    expect(all.className).toMatch(/text-brand/)
  })

  it('selectedCategory=animal_protection → 「動物保護」aria-checked=true', () => {
    render(
      <CategoryMenu
        isOpen={true}
        selectedCategory="animal_protection"
        onSelect={() => {}}
        onClose={() => {}}
      />,
    )
    const target = screen.getByRole('radio', { name: '動物保護' })
    expect(target).toHaveAttribute('aria-checked', 'true')
    expect(target.className).toMatch(/border-brand/)
  })

  it('點 option → onSelect + onClose 各被呼叫一次', async () => {
    const onSelect = vi.fn()
    const onClose = vi.fn()
    render(
      <CategoryMenu
        isOpen={true}
        selectedCategory={null}
        onSelect={onSelect}
        onClose={onClose}
      />,
    )
    await userEvent.click(screen.getByRole('radio', { name: '動物保護' }))
    expect(onSelect).toHaveBeenCalledWith('animal_protection')
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('點「全部」→ onSelect(null) + onClose', async () => {
    const onSelect = vi.fn()
    const onClose = vi.fn()
    render(
      <CategoryMenu
        isOpen={true}
        selectedCategory="animal_protection"
        onSelect={onSelect}
        onClose={onClose}
      />,
    )
    await userEvent.click(screen.getByRole('radio', { name: '全部' }))
    expect(onSelect).toHaveBeenCalledWith(null)
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('點 X 關閉按鈕 → onClose；不觸 onSelect', async () => {
    const onSelect = vi.fn()
    const onClose = vi.fn()
    render(
      <CategoryMenu
        isOpen={true}
        selectedCategory={null}
        onSelect={onSelect}
        onClose={onClose}
      />,
    )
    await userEvent.click(screen.getByRole('button', { name: '關閉' }))
    expect(onClose).toHaveBeenCalledTimes(1)
    expect(onSelect).not.toHaveBeenCalled()
  })

  it('點 backdrop → onClose', async () => {
    const onClose = vi.fn()
    render(
      <CategoryMenu
        isOpen={true}
        selectedCategory={null}
        onSelect={() => {}}
        onClose={onClose}
      />,
    )
    await userEvent.click(screen.getByRole('button', { name: '關閉選單' }))
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('Esc → onClose', () => {
    const onClose = vi.fn()
    render(
      <CategoryMenu
        isOpen={true}
        selectedCategory={null}
        onSelect={() => {}}
        onClose={onClose}
      />,
    )
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('開啟時 body overflow="hidden"；關閉後 restore', () => {
    const { rerender } = render(
      <CategoryMenu
        isOpen={true}
        selectedCategory={null}
        onSelect={() => {}}
        onClose={() => {}}
      />,
    )
    expect(document.body.style.overflow).toBe('hidden')
    rerender(
      <CategoryMenu
        isOpen={false}
        selectedCategory={null}
        onSelect={() => {}}
        onClose={() => {}}
      />,
    )
    expect(document.body.style.overflow).toBe('')
  })

  it('ARIA：role="dialog" + aria-modal="true" + radiogroup', () => {
    render(
      <CategoryMenu
        isOpen={true}
        selectedCategory={null}
        onSelect={() => {}}
        onClose={() => {}}
      />,
    )
    const dialog = screen.getByRole('dialog')
    expect(dialog).toHaveAttribute('aria-modal', 'true')
    expect(screen.getByRole('radiogroup')).toBeInTheDocument()
  })

  it('動畫：sheet 套了 transition-transform、duration、motion-reduce 安全網', () => {
    render(
      <CategoryMenu
        isOpen={true}
        selectedCategory={null}
        onSelect={() => {}}
        onClose={() => {}}
      />,
    )
    const section = screen.getByRole('dialog').querySelector('section')!
    expect(section.className).toMatch(/transition-transform/)
    expect(section.className).toMatch(/duration-300/)
    expect(section.className).toMatch(/motion-reduce:transition-none/)
  })

  it('動畫：mount 後 rAF 觸發、sheet 從 translate-y-full → translate-y-0', async () => {
    render(
      <CategoryMenu
        isOpen={true}
        selectedCategory={null}
        onSelect={() => {}}
        onClose={() => {}}
      />,
    )
    const section = screen.getByRole('dialog').querySelector('section')!
    // initial render 仍在 translate-y-full（rAF 還沒 fire）
    expect(section.className).toMatch(/translate-y-full/)
    // rAF 觸發後切到 translate-y-0
    await waitFor(() => {
      expect(section.className).toMatch(/translate-y-0/)
    })
  })

  it('動畫：close 後 sheet 不立即 unmount，等動畫結束才 return null', async () => {
    vi.useFakeTimers()
    try {
      const { rerender } = render(
        <CategoryMenu
          isOpen={true}
          selectedCategory={null}
          onSelect={() => {}}
          onClose={() => {}}
        />,
      )
      expect(screen.getByRole('dialog')).toBeInTheDocument()

      rerender(
        <CategoryMenu
          isOpen={false}
          selectedCategory={null}
          onSelect={() => {}}
          onClose={() => {}}
        />,
      )

      // close 後立刻仍在 DOM（動畫進行中）
      expect(screen.queryByRole('dialog')).toBeInTheDocument()
      const section = screen.getByRole('dialog').querySelector('section')!
      expect(section.className).toMatch(/translate-y-full/)

      // 推進 ANIM_MS 後 setTimeout 觸發 setShouldRender(false)，需 act flush
      await act(async () => {
        vi.advanceTimersByTime(350)
      })
      expect(screen.queryByRole('dialog')).toBeNull()
    } finally {
      vi.useRealTimers()
    }
  })
})
