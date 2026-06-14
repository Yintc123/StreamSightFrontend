import { notFound } from 'next/navigation'
import Link from 'next/link'
import type { Metadata } from 'next'
import { TopNav } from '@/components/ui/TopNav'
import { CATEGORY_LABELS } from '@/lib/schemas/categories'
import { findDonationById } from '@/lib/mock/find-by-id'

type PageProps = { params: Promise<{ id: string }> }

export async function generateMetadata({
  params,
}: PageProps): Promise<Metadata> {
  const { id } = await params
  const d = findDonationById(id)
  return {
    title: d ? `${d.name} | JKODonation` : '捐款專案介紹 | JKODonation',
  }
}

/**
 * Spec 004b — 捐款專案介紹頁 preview
 *
 * 對齊 IMG_4882。本 preview 用 list fixture (Donation) 顯示已有欄位；
 * raisingApprovalNo / reliefApprovalNo / content 等 detail-only 欄位
 * fixture 沒有，先用 placeholder。
 */
export default async function Page({ params }: PageProps) {
  const { id } = await params
  const donation = findDonationById(id)
  if (!donation) notFound()

  return (
    <div className="flex flex-col min-h-dvh bg-surface-page">
      <TopNav title="捐款專案介紹" />
      <Cover
        coverImageUrl={donation.coverImageUrl}
        alt={donation.name}
      />
      <div className="mx-3 -mt-4 bg-surface-card rounded-2xl shadow-sm relative z-10 p-5 space-y-4">
        <h1 className="text-base font-semibold text-ink-AAA leading-7">
          {donation.name}
        </h1>
        <ApprovalNoList />
        <CharityChip
          charityId={donation.charityId}
          charityName={donation.charityName}
        />
        {donation.categories && donation.categories.length > 0 && (
          <CategoryTags categories={donation.categories} />
        )}
      </div>
      <section className="flex-1 px-5 py-6">
        <h2 className="text-base font-medium text-ink-AAA mb-3">專案內容</h2>
        <p className="text-sm leading-6 text-ink-AAA whitespace-pre-line">
          {donation.description}
          {'\n\n'}
          ※ 這是 preview placeholder。spec 002 §6 + spec 017 BFF 接上後，
          這裡會顯示後端回傳的 `content` 長文。
        </p>
      </section>
      <DonateCta />
    </div>
  )
}

function Cover({ coverImageUrl, alt }: { coverImageUrl?: string; alt: string }) {
  if (!coverImageUrl) {
    return (
      <div
        aria-hidden
        className="w-full aspect-[4/3] bg-black/5 flex items-center justify-center text-ink-A"
      >
        <span className="text-sm">無封面圖片</span>
      </div>
    )
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={coverImageUrl}
      alt={alt}
      className="w-full aspect-[4/3] object-cover"
    />
  )
}

function ApprovalNoList() {
  // Preview placeholder
  return (
    <dl className="grid grid-cols-[8em_1fr] gap-y-1 text-xs text-ink-A">
      <dt>勸募立案核准字號</dt>
      <dd>衛部救字第 1151346163 號</dd>
    </dl>
  )
}

function CharityChip({
  charityId,
  charityName,
}: {
  charityId: string
  charityName: string
}) {
  return (
    <Link
      href={`/charities/${charityId}`}
      className="flex items-center justify-between gap-3 p-3 bg-black/5 rounded-xl
                 hover:bg-black/10
                 focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand"
    >
      <div className="flex items-center gap-3 min-w-0">
        <div
          aria-hidden
          className="w-10 h-10 rounded-md bg-brand/10 text-brand
                     flex items-center justify-center text-sm font-medium shrink-0"
        >
          {charityName[0]}
        </div>
        <div className="text-sm text-ink-AAA line-clamp-1">{charityName}</div>
      </div>
      <span className="text-sm text-ink-link shrink-0">查看團體 ›</span>
    </Link>
  )
}

function CategoryTags({ categories }: { categories: readonly string[] }) {
  return (
    <ul className="flex flex-wrap gap-2">
      {categories.map((key) => (
        <li
          key={key}
          className="inline-flex items-center px-3 py-1 rounded-full
                     bg-black/5 text-xs leading-5 text-ink-AA"
        >
          {CATEGORY_LABELS[key as keyof typeof CATEGORY_LABELS] ?? key}
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
