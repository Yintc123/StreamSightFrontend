import { notFound } from 'next/navigation'
import Link from 'next/link'
import type { Metadata } from 'next'
import { CtaIsland } from '@/app/checkout/CtaIsland'
import { CharityLogo } from '@/components/ui/CharityLogo'
import { FallbackImage } from '@/components/ui/FallbackImage'
import { TopNav } from '@/components/ui/TopNav'
import { fetchDonationDetail } from '@/lib/api/getDetail'
import { NotFoundError } from '@/lib/errors/NotFoundError'
import { pickFallbackImage } from '@/lib/mock/fallback-images'
import type { DonationDetail } from '@/lib/schemas/detail'

type PageProps = { params: Promise<{ id: string }> }

async function safeFetch(id: string): Promise<DonationDetail | null> {
  try {
    return await fetchDonationDetail(id)
  } catch (e) {
    if (e instanceof NotFoundError) return null
    throw e
  }
}

export async function generateMetadata({
  params,
}: PageProps): Promise<Metadata> {
  const { id } = await params
  const d = await safeFetch(id)
  return {
    title: d ? `${d.name} | JKODonation` : '捐款專案介紹 | JKODonation',
  }
}

/**
 * Spec 004b — 捐款專案介紹頁
 *
 * RSC fetches backend via `fetchDonationDetail`. Detail-only fields
 * (content / approvalNos / nested charity) flow through the mapper —
 * empty optional values arrive as undefined and render conditionally.
 */
export default async function Page({ params }: PageProps) {
  const { id } = await params
  const donation = await safeFetch(id)
  if (!donation) notFound()

  return (
    <div data-component="DonationProjectDetailPage" className="flex flex-col min-h-dvh bg-surface-page">
      <TopNav title="捐款專案介紹" />
      <Cover
        coverImageUrl={donation.coverImageUrl}
        fallback={pickFallbackImage('donation', donation.id)}
        alt={donation.name}
      />
      <div data-component="InfoPanel" className="mx-3 -mt-4 bg-surface-card rounded-2xl shadow-sm relative z-10 p-5 space-y-4">
        <h1 className="text-base font-semibold text-ink-AAA leading-7">
          {donation.name}
        </h1>
        <ApprovalNoList
          raisingApprovalNo={donation.raisingApprovalNo}
          reliefApprovalNo={donation.reliefApprovalNo}
        />
        <CharityChip charity={donation.charity} />
        {donation.categories.length > 0 && (
          <CategoryTags categories={donation.categories} />
        )}
      </div>
      <div className="flex-1 mx-3 mt-3">
        <section data-component="ContentSection" className="bg-surface-card rounded-2xl shadow-sm p-5">
          <h2 className="text-base font-medium text-ink-AAA mb-3">專案內容</h2>
          <p className="text-sm leading-6 text-ink-AAA whitespace-pre-line">
            {donation.content || donation.description}
          </p>
        </section>
      </div>
      <CtaIsland
        kind="donation"
        target={{ type: 'DONATION_PROJECT', detail: donation }}
        label="立即捐款"
        sticky
      />
    </div>
  )
}

function Cover({
  coverImageUrl,
  fallback,
  alt,
}: {
  coverImageUrl?: string
  fallback: string
  alt: string
}) {
  return (
    <FallbackImage
      primary={coverImageUrl}
      fallback={fallback}
      alt={alt}
      className="w-full aspect-[4/3] object-cover"
    />
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
    <dl data-component="ApprovalNoList" className="grid grid-cols-[8em_1fr] gap-y-1 text-xs text-ink-A">
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
    // 預設 push（spec 004 §3.1 v0.3 撤回原本的 lateral nav `replace` 策略）：
    // 實測 UX「按 1 次返回卻跳過中間頁」反直覺，改回每點一次都堆一個 history entry。
    // 連鎖橫向導航的代價（A → 看團體 → B → 看團體 → C 要按 3 次返回）實際罕見。
    <Link
      data-component="CharityChip"
      href={`/charities/${charity.id}`}
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
    <ul data-component="CategoryTags" className="flex flex-wrap gap-2">
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

