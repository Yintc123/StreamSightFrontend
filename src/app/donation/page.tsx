import type { Metadata } from 'next'
import { PreviewShell } from './PreviewShell'
import { RESOURCE_KEYS, type ResourceKey } from '@/lib/schemas/list'
import { CATEGORY_KEYS, type CategoryKey } from '@/lib/schemas/categories'

export const metadata: Metadata = {
  title: '所有捐款項目 | JKODonation',
  description: '捐款項目列表：公益團體 / 捐款專案 / 義賣商品',
}

type SearchParams = Promise<{
  q?: string
  tab?: string
  category?: string
}>

function parseTab(raw?: string): ResourceKey {
  return RESOURCE_KEYS.includes(raw as ResourceKey)
    ? (raw as ResourceKey)
    : 'charity'
}

function parseCategory(raw?: string): CategoryKey | null {
  return CATEGORY_KEYS.includes(raw as CategoryKey)
    ? (raw as CategoryKey)
    : null
}

/**
 * Spec 002 §5 RSC pattern — 從 searchParams 解出 initial state，
 * 交給 PreviewShell hydrate（PreviewShell 之後會被 spec 003i CharityListShell 取代）。
 *
 * 用 URL 持久化 tab/q/category 是「記住上一頁狀態」的核心機制：
 *  - 卡片點擊 → router push 詳情頁，本頁 URL+scrollY 寫進 history entry
 *  - 詳情頁返回 → URL 還原 → page.tsx 重新解析 searchParams
 *  - PreviewShell 拿到對應 initialTab → 渲染同一個 tab
 *  - browser 自動還原 scrollY 到當時位置
 */
export default async function DonationListPage({
  searchParams,
}: {
  searchParams: SearchParams
}) {
  const sp = await searchParams
  return (
    <PreviewShell
      initialQ={sp.q ?? ''}
      initialTab={parseTab(sp.tab)}
      initialCategory={parseCategory(sp.category)}
    />
  )
}
