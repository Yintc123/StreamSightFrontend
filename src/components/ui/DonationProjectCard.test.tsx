import { describe, it, expect } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { DonationProjectCard } from './DonationProjectCard'
import type { Donation } from '@/lib/schemas/list'

const UUID = '00000000-0000-4000-8000-000000000011'
const CHARITY_UUID = '00000000-0000-4000-8000-000000000012'

function makeDonation(overrides: Partial<Donation> = {}): Donation {
  return {
    id: UUID,
    name: '【安居．專業．愛】── 守護身障弱勢',
    description: '共築安全專業家園勸募活動',
    charityId: CHARITY_UUID,
    charityName: '財團法人宜蘭縣私立柏拉圖復康之家',
    ...overrides,
  }
}

describe('DonationProjectCard', () => {
  it('渲染 h2 title', () => {
    render(<DonationProjectCard item={makeDonation()} />)
    const h2 = screen.getByRole('heading', { level: 2 })
    expect(h2).toHaveTextContent('【安居．專業．愛】── 守護身障弱勢')
  })

  it('渲染 description', () => {
    render(<DonationProjectCard item={makeDonation()} />)
    expect(screen.getByText('共築安全專業家園勸募活動')).toBeInTheDocument()
  })

  it('渲染 cover image 帶 src', () => {
    const { container } = render(
      <DonationProjectCard
        item={makeDonation({ coverImageUrl: 'https://example.com/c.jpg' })}
      />,
    )
    const img = container.querySelector('img')
    expect(img?.getAttribute('src')).toBe('https://example.com/c.jpg')
    expect(img?.getAttribute('alt')).toBe('')
  })

  it('coverImageUrl 缺 → 渲染 mock fallback img（/mock-images/donation/）', () => {
    const { container } = render(<DonationProjectCard item={makeDonation()} />)
    const img = container.querySelector('img')!
    expect(img.getAttribute('src')).toMatch(/^\/mock-images\/donation\/[1-6]\.svg$/)
  })

  it('cover image onError → src 切到 mock fallback', () => {
    const { container } = render(
      <DonationProjectCard
        item={makeDonation({ coverImageUrl: 'https://broken/c.jpg' })}
      />,
    )
    const img = container.querySelector('img')!
    fireEvent.error(img)
    expect(img.getAttribute('src')).toMatch(/^\/mock-images\/donation\/[1-6]\.svg$/)
  })

  it('charityName 渲染為紅色 overlay（圖片底部 brand-overlay）', () => {
    const { container } = render(
      <DonationProjectCard
        item={makeDonation({ coverImageUrl: 'https://example.com/c.jpg' })}
      />,
    )
    const overlay = screen.getByText('財團法人宜蘭縣私立柏拉圖復康之家')
    expect(overlay.className).toMatch(/bg-brand-overlay/)
    expect(overlay.className).toMatch(/text-white/)
    expect(overlay.className).toMatch(/truncate/)
    // overlay 與圖片同層 (absolute bottom-0)
    expect(overlay.className).toMatch(/absolute/)
    void container
  })

  it('categories 為 0 → 不渲染 <ul>', () => {
    const { container } = render(
      <DonationProjectCard item={makeDonation({ categories: [] })} />,
    )
    expect(container.querySelector('ul')).toBeNull()
  })

  it('categories undefined → 不渲染 <ul>', () => {
    const { container } = render(<DonationProjectCard item={makeDonation()} />)
    expect(container.querySelector('ul')).toBeNull()
  })

  it('categories=3 → 3 個 chip，無 +N', () => {
    render(
      <DonationProjectCard
        item={makeDonation({
          categories: ['disability_service', 'poverty_relief', 'environmental_protection'],
        })}
      />,
    )
    expect(screen.getByText('身心障礙服務')).toBeInTheDocument()
    expect(screen.getByText('弱勢扶貧')).toBeInTheDocument()
    expect(screen.getByText('環境保護')).toBeInTheDocument()
    expect(screen.queryByText(/^\+\d/)).toBeNull()
  })

  it('categories=5 → 3 個 chip + 1 個 +2 chip（共 4 個 <li>）', () => {
    const { container } = render(
      <DonationProjectCard
        item={makeDonation({
          categories: [
            'disability_service',
            'poverty_relief',
            'environmental_protection',
            'animal_protection',
            'child_care',
          ],
        })}
      />,
    )
    expect(container.querySelectorAll('li').length).toBe(4)
    expect(screen.getByText('+2')).toBeInTheDocument()
  })

  it('+N chip 文字純為 +{N}（無「個分類」尾綴）', () => {
    render(
      <DonationProjectCard
        item={makeDonation({
          categories: [
            'disability_service',
            'poverty_relief',
            'environmental_protection',
            'animal_protection',
            'child_care',
            'elderly_care',
          ],
        })}
      />,
    )
    const plusN = screen.getByText('+3')
    expect(plusN.textContent).toBe('+3')
  })

  it('整卡為 <a href="/donation-projects/{id}">', () => {
    render(<DonationProjectCard item={makeDonation()} />)
    const link = screen.getByRole('link')
    expect(link.getAttribute('href')).toBe(`/donation-projects/${UUID}`)
  })

  it('卡片唯一 h2', () => {
    render(<DonationProjectCard item={makeDonation()} />)
    expect(screen.getAllByRole('heading').length).toBe(1)
  })
})
