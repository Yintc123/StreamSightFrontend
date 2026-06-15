import { notFound } from 'next/navigation'
import Link from 'next/link'
import type { Metadata } from 'next'
import { CharityLogo } from '@/components/ui/CharityLogo'
import { FallbackImage } from '@/components/ui/FallbackImage'
import { TopNav } from '@/components/ui/TopNav'
import { fetchItemDetail } from '@/lib/api/getDetail'
import { NotFoundError } from '@/lib/errors/NotFoundError'
import { pickFallbackImage } from '@/lib/mock/fallback-images'
import type { ItemDetail } from '@/lib/schemas/detail'

type PageProps = { params: Promise<{ id: string }> }

const priceFmt = new Intl.NumberFormat('zh-TW')

async function safeFetch(id: string): Promise<ItemDetail | null> {
  try {
    return await fetchItemDetail(id)
  } catch (e) {
    if (e instanceof NotFoundError) return null
    throw e
  }
}

export async function generateMetadata({
  params,
}: PageProps): Promise<Metadata> {
  const { id } = await params
  const i = await safeFetch(id)
  return {
    title: i ? `${i.name} | JKODonation` : '義賣商品 | JKODonation',
  }
}

/**
 * Spec 004c — 義賣商品介紹頁
 *
 * RSC fetches backend via `fetchItemDetail`. Detail-only fields (content
 * / approvalNos / nested charity) render conditionally.
 */
export default async function Page({ params }: PageProps) {
  const { id } = await params
  const item = await safeFetch(id)
  if (!item) notFound()

  return (
    <div className="flex flex-col min-h-dvh bg-surface-page">
      <TopNav title="義賣商品" />
      <CoverWithRibbon
        coverImageUrl={item.coverImageUrl}
        fallback={pickFallbackImage('item', item.id)}
        alt={item.name}
      />
      <div className="px-5 py-5 space-y-4 bg-surface-card">
        <div>
          <h1 className="text-base font-semibold text-ink-AAA leading-7">
            {item.name}
          </h1>
          <p className="text-2xl font-bold text-brand mt-1 leading-8">
            TWD {priceFmt.format(item.priceTwd)}
          </p>
        </div>
        <ApprovalNoList
          raisingApprovalNo={item.raisingApprovalNo}
          reliefApprovalNo={item.reliefApprovalNo}
        />
        <CharityChip charity={item.charity} />
        {item.categories.length > 0 && (
          <CategoryTags categories={item.categories} />
        )}
      </div>
      <section className="flex-1 px-5 py-6 bg-surface-page">
        <h2 className="text-base font-medium text-ink-AAA mb-3">商品說明</h2>
        <p className="text-sm leading-6 text-ink-AAA whitespace-pre-line">
          {item.content || item.description}
        </p>
      </section>
      <DonateCta />
    </div>
  )
}

function CoverWithRibbon({
  coverImageUrl,
  fallback,
  alt,
}: {
  coverImageUrl?: string
  fallback: string
  alt: string
}) {
  return (
    <div className="relative w-full aspect-square">
      <FallbackImage
        primary={coverImageUrl}
        fallback={fallback}
        alt={alt}
        className="w-full h-full object-cover"
      />
      {/* spec 004c — detail ribbon (雙語版): */}
      <div className="absolute top-3 left-0 px-3 py-1 bg-brand text-white rounded-r-md shadow">
        <div className="text-sm font-semibold leading-tight">公益義賣</div>
        <div className="text-[10px] tracking-wider leading-tight">
          SHOP FOR CHANGE
        </div>
      </div>
    </div>
  )
}

function ApprovalNoList({
  raisingApprovalNo,
  reliefApprovalNo,
}: {
  raisingApprovalNo?: string
  reliefApprovalNo?: string
}) {
  if (!raisingApprovalNo && !reliefApprovalNo) return null
  return (
    <dl className="grid grid-cols-[8em_1fr] gap-y-1 text-xs text-ink-A">
      {raisingApprovalNo && (
        <>
          <dt>勸募立案核准字號</dt>
          <dd>{raisingApprovalNo}</dd>
        </>
      )}
      {reliefApprovalNo && (
        <>
          <dt>衛部救字號</dt>
          <dd>{reliefApprovalNo}</dd>
        </>
      )}
    </dl>
  )
}

function CharityChip({
  charity,
}: {
  charity: { id: string; name: string; logoUrl?: string }
}) {
  return (
    // replace（非 push）：spec 004 §「橫向關聯導航」— 詳情頁之間切換不堆 history
    <Link
      href={`/charities/${charity.id}`}
      replace
      className="flex items-center justify-between gap-3 p-3 bg-black/5 rounded-xl
                 hover:bg-black/10
                 focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand"
    >
      <div className="flex items-center gap-3 min-w-0">
        <div
          aria-hidden
          className="w-10 h-10 rounded-md bg-brand/10 text-brand
                     flex items-center justify-center text-sm font-medium shrink-0 overflow-hidden"
        >
          <CharityLogo name={charity.name} logoUrl={charity.logoUrl} />
        </div>
        <div className="text-sm text-ink-AAA line-clamp-1">{charity.name}</div>
      </div>
      <span className="text-sm text-ink-link shrink-0">查看團體 ›</span>
    </Link>
  )
}

function CategoryTags({
  categories,
}: {
  categories: { id: string; displayName: string }[]
}) {
  return (
    <ul className="flex flex-wrap gap-2">
      {categories.map((c) => (
        <li
          key={c.id}
          className="inline-flex items-center px-3 py-1 rounded-full
                     bg-black/5 text-xs leading-5 text-ink-AA"
        >
          {c.displayName}
        </li>
      ))}
    </ul>
  )
}

function DonateCta() {
  return (
    <div className="sticky bottom-0 inset-x-0 bg-surface-card border-t border-line px-5 py-3 pb-[env(safe-area-inset-bottom)]">
      <button
        type="button"
        className="w-full h-12 rounded-full bg-brand text-white text-base font-semibold
                   focus-visible:outline focus-visible:outline-2
                   focus-visible:outline-offset-2 focus-visible:outline-brand"
      >
        立即捐款
      </button>
    </div>
  )
}
