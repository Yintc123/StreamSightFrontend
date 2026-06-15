// Spec 008c v0.5 §7.2 — hook integration tests for usePurchaseQtyForm.
// Pure logic is trivial (multiplication / clamp inside QtyStepper); no
// dedicated reducer test layer is needed.

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { act, renderHook } from '@testing-library/react'
import type { Item } from '@/lib/schemas/list'

const routerPushMock = vi.fn()
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: routerPushMock }),
}))

import { usePurchaseQtyForm } from './usePurchaseQtyForm'

const ITEM: Item = {
  id: '00000000-0000-4000-8000-000000000099',
  name: '陸仕私廚 藤椒牛肉麵',
  description: '760g 袋（冷凍）',
  priceTwd: 449,
}

beforeEach(() => {
  routerPushMock.mockReset()
})

describe('usePurchaseQtyForm', () => {
  it('H1: 初始 quantity=1、subtotal=priceTwd、shipping=0、total=subtotal', () => {
    const { result } = renderHook(() =>
      usePurchaseQtyForm({ open: true, item: ITEM, onClose: vi.fn() }),
    )
    expect(result.current.quantity).toBe(1)
    expect(result.current.subtotal).toBe(449)
    expect(result.current.shipping).toBe(0)
    expect(result.current.total).toBe(449)
  })

  it('H2: setQuantity(4) → quantity / subtotal / total 重算', () => {
    const { result } = renderHook(() =>
      usePurchaseQtyForm({ open: true, item: ITEM, onClose: vi.fn() }),
    )
    act(() => result.current.setQuantity(4))
    expect(result.current.quantity).toBe(4)
    expect(result.current.subtotal).toBe(449 * 4)
    expect(result.current.total).toBe(449 * 4)
  })

  it('H3: handleSubmit → router.push 帶 saleItemId / quantity + onClose 被叫', () => {
    const onClose = vi.fn()
    const { result } = renderHook(() =>
      usePurchaseQtyForm({ open: true, item: ITEM, onClose }),
    )
    act(() => result.current.setQuantity(3))
    act(() => result.current.handleSubmit())
    expect(routerPushMock).toHaveBeenCalledTimes(1)
    const url = routerPushMock.mock.calls[0][0] as string
    expect(url).toMatch(/^\/checkout\/purchase\?/)
    expect(url).toContain(`saleItemId=${ITEM.id}`)
    expect(url).toContain('quantity=3')
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('H4: opts.open false → true rerender → quantity 重置（先 setQuantity(5)）', () => {
    const { result, rerender } = renderHook(
      (props: { open: boolean }) =>
        usePurchaseQtyForm({
          open: props.open,
          item: ITEM,
          onClose: vi.fn(),
        }),
      { initialProps: { open: true } },
    )
    act(() => result.current.setQuantity(5))
    expect(result.current.quantity).toBe(5)

    rerender({ open: false })
    rerender({ open: true })
    expect(result.current.quantity).toBe(1)
  })
})
