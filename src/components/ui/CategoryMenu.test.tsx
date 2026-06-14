import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen } from '@testing-library/react'
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
})
