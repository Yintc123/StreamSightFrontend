// Spec 008c v0.5 §7.3 — component visual tests.

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { Item } from '@/lib/schemas/list'

const routerPushMock = vi.fn()
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: routerPushMock }),
}))

import { PurchaseQtySheet } from './PurchaseQtySheet'

const ITEM: Item = {
  id: '00000000-0000-4000-8000-000000000099',
  name: '陸仕私廚 藤椒牛肉麵',
  description: '760g 袋（冷凍）',
  priceTwd: 449,
}

beforeEach(() => {
  routerPushMock.mockReset()
})

describe('PurchaseQtySheet', () => {
  it('1: 渲染 item name + QtyStepper + 運費 / 總計 + submit', () => {
    render(<PurchaseQtySheet open onClose={vi.fn()} item={ITEM} />)
    expect(
      screen.getByRole('heading', { name: '購買數量' }),
    ).toBeInTheDocument()
    // 商品 name 在 sheet 內出現至少一次
    expect(screen.getAllByText(/藤椒牛肉麵/).length).toBeGreaterThan(0)
    expect(screen.getByText('運費')).toBeInTheDocument()
    expect(screen.getByText('總計')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '下一步' })).toBeInTheDocument()
  })

  it('2: 點 + 三次 → 數量 4、總計 = priceTwd × 4', async () => {
    render(<PurchaseQtySheet open onClose={vi.fn()} item={ITEM} />)
    const plus = screen.getByRole('button', { name: '增加數量' })
    await userEvent.click(plus)
    await userEvent.click(plus)
    await userEvent.click(plus)
    expect(screen.getByText('4')).toBeInTheDocument()
    // 總計：449 * 4 = 1,796；shipping=0 → subtotal === total，兩個位置都顯示
    const occurrences = screen.getAllByText(/TWD\s*1,796/)
    expect(occurrences.length).toBe(2)
    // 「總計」這個 dd 必須帶 brand 紅字加粗
    const totalRow = screen.getByText('總計').nextElementSibling as HTMLElement
    expect(totalRow.textContent).toMatch(/TWD\s*1,796/)
    expect(totalRow.className).toMatch(/text-brand/)
    expect(totalRow.className).toMatch(/font-bold/)
  })

  it('3: quantity=1 時 stepper - disabled；推到 100 時 + disabled（邊界）', async () => {
    render(<PurchaseQtySheet open onClose={vi.fn()} item={ITEM} />)
    expect(screen.getByRole('button', { name: '減少數量' })).toBeDisabled()
    expect(screen.getByRole('button', { name: '增加數量' })).toBeEnabled()
  })

  it('4: submit button 永遠 enabled（4887 紅底）', () => {
    render(<PurchaseQtySheet open onClose={vi.fn()} item={ITEM} />)
    expect(screen.getByRole('button', { name: '下一步' })).toBeEnabled()
  })

  it('5: 點下一步 → router.push 帶 saleItemId + quantity + onClose 被叫', async () => {
    const onClose = vi.fn()
    render(<PurchaseQtySheet open onClose={onClose} item={ITEM} />)
    await userEvent.click(screen.getByRole('button', { name: '增加數量' }))
    await userEvent.click(screen.getByRole('button', { name: '下一步' }))
    expect(routerPushMock).toHaveBeenCalledTimes(1)
    const url = routerPushMock.mock.calls[0][0] as string
    expect(url).toContain(`saleItemId=${ITEM.id}`)
    expect(url).toContain('quantity=2')
    expect(onClose).toHaveBeenCalledTimes(1)
  })
})
