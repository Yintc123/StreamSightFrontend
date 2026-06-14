import { describe, it, expect } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { CharityCard } from './CharityCard'
import type { Charity } from '@/lib/schemas/list'

const UUID = '00000000-0000-4000-8000-000000000001'

function makeCharity(overrides: Partial<Charity> = {}): Charity {
  return {
    id: UUID,
    name: 'ACC 中華耆幼關懷協會',
    description: '你身上有光，能照亮不確定的黑暗',
    ...overrides,
  }
}

describe('CharityCard', () => {
  it('渲染 name 為 h2', () => {
    render(<CharityCard item={makeCharity()} />)
    const h2 = screen.getByRole('heading', { level: 2 })
    expect(h2).toHaveTextContent('ACC 中華耆幼關懷協會')
  })

  it('渲染 description 為 p', () => {
    render(<CharityCard item={makeCharity()} />)
    expect(screen.getByText('你身上有光，能照亮不確定的黑暗')).toBeInTheDocument()
  })

  it('description undefined → 不渲染 p', () => {
    const { container } = render(
      <CharityCard item={makeCharity({ description: '' })} />,
    )
    expect(container.querySelector('p')).toBeNull()
  })

  it('logoUrl 有效 → 渲染 <img src=> 而非 fallback', () => {
    const { container } = render(
      <CharityCard
        item={makeCharity({ logoUrl: 'https://example.com/logo.png' })}
      />,
    )
    const img = container.querySelector('img')
    expect(img?.getAttribute('src')).toBe('https://example.com/logo.png')
    expect(img?.getAttribute('alt')).toBe('')
  })

  it('logoUrl undefined → 渲染 fallback <div aria-hidden> 含縮寫', () => {
    const { container } = render(<CharityCard item={makeCharity()} />)
    expect(container.querySelector('img')).toBeNull()
    const fallback = container.querySelector('[aria-hidden]') as HTMLElement
    expect(fallback).toBeTruthy()
    expect(fallback.textContent).toBe('AC')
  })

  it('<img> onError → 切到首字母 fallback', () => {
    const { container } = render(
      <CharityCard
        item={makeCharity({ logoUrl: 'https://broken.example/x.png' })}
      />,
    )
    const img = container.querySelector('img')!
    fireEvent.error(img)
    expect(container.querySelector('img')).toBeNull()
    expect(container.querySelector('[aria-hidden]')?.textContent).toBe('AC')
  })

  it('整卡為 <a href="/charities/{id}">', () => {
    render(<CharityCard item={makeCharity()} />)
    const link = screen.getByRole('link')
    expect(link.getAttribute('href')).toBe(`/charities/${UUID}`)
  })

  it('卡片唯一 h2（無其他 heading）', () => {
    render(<CharityCard item={makeCharity()} />)
    const headings = screen.getAllByRole('heading')
    expect(headings.length).toBe(1)
  })

  it('name 含 line-clamp-1 樣式', () => {
    render(<CharityCard item={makeCharity()} />)
    const h2 = screen.getByRole('heading', { level: 2 })
    expect(h2.className).toMatch(/line-clamp-1/)
  })
})

// getCharityInitial 測試已搬至 charity-initial.test.ts
