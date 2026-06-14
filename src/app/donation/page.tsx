import type { Metadata } from 'next'
import { PreviewShell } from './PreviewShell'

export const metadata: Metadata = {
  title: '所有捐款項目 | JKODonation',
  description: '捐款項目列表：公益團體 / 捐款專案 / 義賣商品',
}

export default function CharitiesPage() {
  // Preview 階段：靜態 fixture + useState；spec 002 §5 完成後改為
  // RSC + prefetchInfiniteQuery + HydrationBoundary。
  return <PreviewShell />
}
