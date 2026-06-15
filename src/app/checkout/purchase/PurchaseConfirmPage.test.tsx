// Spec 009b v0.4 §9.3 — PurchaseConfirmPage integration tests.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ItemDetail } from '@/lib/schemas/detail'

const toastSuccessMock = vi.fn()
vi.mock('sonner', () => ({
  toast: {
    success: (...args: unknown[]) => toastSuccessMock(...args),
    error: vi.fn(),
  },
}))

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: vi.fn(),
    back: vi.fn(),
    replace: vi.fn(),    // v0.5 — hook router.replace 導回 entry detail
  }),
  usePathname: () => '/checkout/purchase',
}))

import { PurchaseConfirmPage } from './PurchaseConfirmPage'

const ITEM_ID = '00000000-0000-4000-8000-000000000099'

const ITEM: ItemDetail = {
  id: ITEM_ID,
  name: '陸仕私廚 藤椒牛肉麵 760g',
  description: '760g 袋',
  content: '',
  priceTwd: 449,
  charity: { id: 'cha-1', name: '財團法人台灣紅絲帶基金會' },
  categories: [],
}

const fetchMock = vi.fn<typeof fetch>()
beforeEach(() => {
  toastSuccessMock.mockReset()
  fetchMock.mockReset().mockResolvedValue(
    new Response(
      JSON.stringify({ data: { orderId: 'ord-1', status: 'PENDING' } }),
      { status: 200 },
    ),
  )
  vi.stubGlobal('fetch', fetchMock)
})
afterEach(() => {
  vi.unstubAllGlobals()
})

describe('PurchaseConfirmPage', () => {
  it('1: 三個 panel（購買明細 / 捐款人基本資料 disclaimer / 收據資訊）+ sticky CTA', () => {
    render(
      <PurchaseConfirmPage
        query={{ saleItemId: ITEM_ID, quantity: 2 }}
        item={ITEM}
      />,
    )
    expect(screen.getByText('購買明細')).toBeInTheDocument()
    expect(screen.getByText('捐款人基本資料')).toBeInTheDocument()
    expect(screen.getByText('收據資訊')).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: '確認送出' }),
    ).toBeInTheDocument()
  })

  it('2: 總計 = priceTwd × quantity（brand 紅字）', () => {
    render(
      <PurchaseConfirmPage
        query={{ saleItemId: ITEM_ID, quantity: 2 }}
        item={ITEM}
      />,
    )
    // 449 * 2 = 898；subtotal/total 因 shipping=0 都顯示
    const total = screen.getByText('總計').nextElementSibling as HTMLElement
    expect(total.textContent).toMatch(/TWD\s*898/)
    expect(total.className).toMatch(/text-brand/)
    expect(total.className).toMatch(/font-bold/)
  })

  it('3: 商品名 / 主辦團體名顯示', () => {
    render(
      <PurchaseConfirmPage
        query={{ saleItemId: ITEM_ID, quantity: 1 }}
        item={ITEM}
      />,
    )
    expect(
      screen.getAllByText(/藤椒牛肉麵/).length,
    ).toBeGreaterThan(0)
    expect(
      screen.getByText('財團法人台灣紅絲帶基金會'),
    ).toBeInTheDocument()
  })

  it('4: 姓名 input 打字 → submit 從 disabled 變 enabled', async () => {
    render(
      <PurchaseConfirmPage
        query={{ saleItemId: ITEM_ID, quantity: 1 }}
        item={ITEM}
      />,
    )
    const submit = screen.getByRole('button', { name: '確認送出' })
    expect(submit).toBeDisabled()
    await userEvent.type(screen.getByLabelText(/捐款人姓名/), 'Alice')
    expect(submit).toBeEnabled()
  })

  it('5: 勾匿名 checkbox → state 翻轉、submit 仍可（不影響 isValid）', async () => {
    render(
      <PurchaseConfirmPage
        query={{ saleItemId: ITEM_ID, quantity: 1 }}
        item={ITEM}
      />,
    )
    const checkbox = screen.getByRole('checkbox', { name: /匿名捐款/ })
    expect(checkbox).not.toBeChecked()
    await userEvent.click(checkbox)
    expect(checkbox).toBeChecked()
  })

  it('6: 填齊後送出 → toast.success', async () => {
    render(
      <PurchaseConfirmPage
        query={{ saleItemId: ITEM_ID, quantity: 1 }}
        item={ITEM}
      />,
    )
    await userEvent.type(screen.getByLabelText(/捐款人姓名/), 'Alice')
    await userEvent.click(screen.getByRole('button', { name: '確認送出' }))
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/checkout/purchase',
      expect.objectContaining({ method: 'POST' }),
    )
    expect(toastSuccessMock).toHaveBeenCalledTimes(1)
  })
})
