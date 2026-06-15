// Spec 009a v0.4 §8.3 — DonationConfirmPage visual/integration tests.
// useDonorInfoForm has its own pure + hook tests; this file pins composition:
// shell + detail panel + donor panel + sticky CTA.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { CharityDetail, DonationDetail } from '@/lib/schemas/detail'

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
  usePathname: () => '/checkout/donation',
}))

import { DonationConfirmPage } from './DonationConfirmPage'

const CHARITY_ID = '00000000-0000-4000-8000-000000000001'

const CHARITY: CharityDetail = {
  id: CHARITY_ID,
  name: 'ACC 中華耆幼關懷協會',
  description: 'desc',
  categories: [],
}

const PROJECT: DonationDetail = {
  id: CHARITY_ID,
  name: '偏鄉AI 數位學習計畫－給孩子一雙探索未來的雙手',
  description: 'd',
  content: 'long content',
  charity: {
    id: '00000000-0000-4000-8000-0000000000aa',
    name: '財團法人菩提社會福利慈善事業基金會',
  },
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

describe('DonationConfirmPage', () => {
  it('1: charity 直捐 RECURRING → 顯示「直接捐款給團體」+ 團體名 + 扣款週期 + 下次扣款日期 + TWD 金額', () => {
    render(
      <DonationConfirmPage
        query={{
          targetType: 'CHARITY',
          targetId: CHARITY_ID,
          donationFrequency: 'RECURRING',
          billingDay: 'DAY_16',
          amountTwd: 500,
        }}
        target={CHARITY}
      />,
    )
    expect(screen.getByText('直接捐款給團體')).toBeInTheDocument()
    expect(screen.getByText('ACC 中華耆幼關懷協會')).toBeInTheDocument()
    expect(screen.getByText('定期捐款')).toBeInTheDocument()
    expect(screen.getByText('每月 16 日')).toBeInTheDocument()
    expect(screen.getByText(/\d{4}\/\d{2}\/\d{2}/)).toBeInTheDocument()
    expect(screen.getByText(/TWD\s*500/)).toBeInTheDocument()
  })

  it('2: project 捐款 → 顯示專案名（捐款專案）+ 主辦團體名（捐款對象）', () => {
    render(
      <DonationConfirmPage
        query={{
          targetType: 'DONATION_PROJECT',
          targetId: CHARITY_ID,
          donationFrequency: 'RECURRING',
          billingDay: 'DAY_6',
          amountTwd: 100,
        }}
        target={PROJECT}
      />,
    )
    expect(
      screen.getByText('偏鄉AI 數位學習計畫－給孩子一雙探索未來的雙手'),
    ).toBeInTheDocument()
    expect(
      screen.getByText('財團法人菩提社會福利慈善事業基金會'),
    ).toBeInTheDocument()
  })

  it('3: ONE_TIME → 扣款週期 / 下次扣款日期 row 不渲染', () => {
    render(
      <DonationConfirmPage
        query={{
          targetType: 'CHARITY',
          targetId: CHARITY_ID,
          donationFrequency: 'ONE_TIME',
          amountTwd: 1000,
        }}
        target={CHARITY}
      />,
    )
    expect(screen.getByText('單次捐款')).toBeInTheDocument()
    expect(screen.queryByText('扣款週期')).toBeNull()
    expect(screen.queryByText('下次扣款日期')).toBeNull()
  })

  it('4: sticky CTA「確認送出」初始 disabled；填姓名後 enabled', async () => {
    render(
      <DonationConfirmPage
        query={{
          targetType: 'CHARITY',
          targetId: CHARITY_ID,
          donationFrequency: 'ONE_TIME',
          amountTwd: 100,
        }}
        target={CHARITY}
      />,
    )
    const submit = screen.getByRole('button', { name: '確認送出' })
    expect(submit).toBeDisabled()
    await userEvent.type(screen.getByLabelText(/捐款人姓名/), 'Alice')
    expect(submit).toBeEnabled()
  })

  it('5: 填齊後送出 → toast.success', async () => {
    render(
      <DonationConfirmPage
        query={{
          targetType: 'CHARITY',
          targetId: CHARITY_ID,
          donationFrequency: 'ONE_TIME',
          amountTwd: 100,
        }}
        target={CHARITY}
      />,
    )
    await userEvent.type(screen.getByLabelText(/捐款人姓名/), 'Alice')
    await userEvent.click(screen.getByRole('button', { name: '確認送出' }))
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/checkout/donation',
      expect.objectContaining({ method: 'POST' }),
    )
    expect(toastSuccessMock).toHaveBeenCalledTimes(1)
  })

  it('6: ReceiptOption 5 個值都出現在 <select> options', () => {
    render(
      <DonationConfirmPage
        query={{
          targetType: 'CHARITY',
          targetId: CHARITY_ID,
          donationFrequency: 'ONE_TIME',
          amountTwd: 100,
        }}
        target={CHARITY}
      />,
    )
    const select = screen.getByLabelText(/收據開立方式/) as HTMLSelectElement
    expect(select.options).toHaveLength(5)
    expect(Array.from(select.options).map((o) => o.value)).toEqual([
      'NONE',
      'INDIVIDUAL',
      'CORPORATE',
      'GOVERNMENT_DONATION',
      'DEFER',
    ])
  })
})
