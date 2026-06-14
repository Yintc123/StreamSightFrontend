import { describe, it, expect } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { SaleItemCard } from './SaleItemCard'
import type { Item } from '@/lib/schemas/list'

const UUID = '00000000-0000-4000-8000-000000000021'
const CHARITY_UUID = '00000000-0000-4000-8000-000000000022'

function makeItem(overrides: Partial<Item> = {}): Item {
  return {
    id: UUID,
    name: '北歐天然｜貝比D - 液體維生素D3食品',
    description: '描述',
    charityId: CHARITY_UUID,
    charityName: '財團法人台灣紅絲帶基金會',
    priceTwd: 1000,
    ...overrides,
  }
}

describe('SaleItemCard', () => {
  it('渲染 h2 title', () => {
    render(<SaleItemCard item={makeItem()} />)
    const h2 = screen.getByRole('heading', { level: 2 })
    expect(h2).toHaveTextContent('北歐天然｜貝比D - 液體維生素D3食品')
  })

  it('渲染 charityName', () => {
    render(<SaleItemCard item={makeItem()} />)
    expect(screen.getByText('財團法人台灣紅絲帶基金會')).toBeInTheDocument()
  })

  it('渲染 cover image', () => {
    const { container } = render(
      <SaleItemCard
        item={makeItem({ coverImageUrl: 'https://example.com/p.jpg' })}
      />,
    )
    expect(container.querySelector('img')?.getAttribute('src')).toBe(
      'https://example.com/p.jpg',
    )
  })

  it('coverImageUrl 缺 → 渲染 mock fallback img（/mock-images/item/）', () => {
    const { container } = render(<SaleItemCard item={makeItem()} />)
    const img = container.querySelector('img')!
    expect(img.getAttribute('src')).toMatch(/^\/mock-images\/item\/[1-6]\.svg$/)
  })

  it('cover image onError → src 切到 mock fallback', () => {
    const { container } = render(
      <SaleItemCard
        item={makeItem({ coverImageUrl: 'https://broken/p.jpg' })}
      />,
    )
    const img = container.querySelector('img')!
    fireEvent.error(img)
    expect(img.getAttribute('src')).toMatch(/^\/mock-images\/item\/[1-6]\.svg$/)
  })

  it('ribbon 渲染「公益標籤」白字 brand 紅底', () => {
    render(<SaleItemCard item={makeItem()} />)
    const ribbon = screen.getByText('公益標籤')
    expect(ribbon.className).toMatch(/bg-brand/)
    expect(ribbon.className).toMatch(/text-white/)
  })

  it('價格千分位：priceTwd=1330 → TWD 1,330', () => {
    render(<SaleItemCard item={makeItem({ priceTwd: 1330 })} />)
    expect(screen.getByText('TWD 1,330')).toBeInTheDocument()
  })

  it('價格 0：priceTwd=0 → TWD 0', () => {
    render(<SaleItemCard item={makeItem({ priceTwd: 0 })} />)
    expect(screen.getByText('TWD 0')).toBeInTheDocument()
  })

  it('價格紅色（text-brand）', () => {
    render(<SaleItemCard item={makeItem({ priceTwd: 1000 })} />)
    const price = screen.getByText('TWD 1,000')
    expect(price.className).toMatch(/text-brand/)
  })

  it('整卡為 <a href="/sale-items/{id}">', () => {
    render(<SaleItemCard item={makeItem()} />)
    const link = screen.getByRole('link')
    expect(link.getAttribute('href')).toBe(`/sale-items/${UUID}`)
  })

  it('卡片唯一 h2', () => {
    render(<SaleItemCard item={makeItem()} />)
    expect(screen.getAllByRole('heading').length).toBe(1)
  })

  it('categories 不在卡片渲染（節省空間）', () => {
    const { container } = render(
      <SaleItemCard
        item={makeItem({ categories: ['animal_protection', 'poverty_relief'] })}
      />,
    )
    expect(container.querySelectorAll('ul').length).toBe(0)
  })
})
