import { describe, it, expect } from 'vitest'
import { render, fireEvent } from '@testing-library/react'
import { CharityLogo } from './CharityLogo'

describe('CharityLogo', () => {
  it('logoUrl 有效 → 渲染 <img src=>', () => {
    const { container } = render(
      <CharityLogo name="ACC 中華耆幼" logoUrl="https://example.com/x.png" />,
    )
    const img = container.querySelector('img')
    expect(img?.getAttribute('src')).toBe('https://example.com/x.png')
  })

  it('logoUrl 缺 → 渲染 getCharityInitial 文字', () => {
    const { container } = render(<CharityLogo name="ACC 中華耆幼" />)
    expect(container.querySelector('img')).toBeNull()
    expect(container.textContent).toBe('AC')
  })

  it('logoUrl 空字串 → 渲染 initial 文字', () => {
    const { container } = render(
      <CharityLogo name="財團法人台灣紅絲帶" logoUrl="" />,
    )
    expect(container.querySelector('img')).toBeNull()
    expect(container.textContent).toBe('財')
  })

  it('<img> onError → 切到 initial 文字', () => {
    const { container } = render(
      <CharityLogo
        name="ASGL 台灣霧後光聯盟"
        logoUrl="https://broken/x.png"
      />,
    )
    const img = container.querySelector('img')!
    fireEvent.error(img)
    expect(container.querySelector('img')).toBeNull()
    expect(container.textContent).toBe('AS')
  })

  it('emoji 開頭名稱 → 渲染單一 emoji grapheme', () => {
    const { container } = render(<CharityLogo name="🌱 環保協會" />)
    expect(container.textContent).toBe('🌱')
  })
})
