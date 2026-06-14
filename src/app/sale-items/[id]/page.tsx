import { notFound } from 'next/navigation'
import Link from 'next/link'
import type { Metadata } from 'next'
import { TopNav } from '@/components/ui/TopNav'
import { CATEGORY_LABELS } from '@/lib/schemas/categories'
import { findItemById } from '@/lib/mock/find-by-id'

type PageProps = { params: Promise<{ id: string }> }

const priceFmt = new Intl.NumberFormat('zh-TW')

export async function generateMetadata({
  params,
}: PageProps): Promise<Metadata> {
  const { id } = await params
  const i = findItemById(id)
  return {
    title: i ? `${i.name} | JKODonation` : '義賣商品 | JKODonation',
  }
}

/**
 * Spec 004c — 義賣商品介紹頁 preview
 *
 * 對齊 IMG_4883。Cover 上有「公益義賣 SHOP FOR CHANGE」絲帶
 * （詳情頁版本，比列表卡片的「公益標籤」緞帶完整）。
 */
export default async function Page({ params }: PageProps) {
  const { id } = await params
  const item = findItemById(id)
  if (!item) notFound()

  return (
    <div className="flex flex-col min-h-dvh bg-surface-page">
      <TopNav title="義賣商品" />
      <CoverWithRibbon
        coverImageUrl={item.coverImageUrl}
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
        <ApprovalNoList />
        <CharityChip
          charityId={item.charityId}
          charityName={item.charityName}
        />
        {item.categories && item.categories.length > 0 && (
          <CategoryTags categories={item.categories} />
        )}
      </div>
      <section className="flex-1 px-5 py-6 bg-surface-page">
        <h2 className="text-base font-medium text-ink-AAA mb-3">商品說明</h2>
        <p className="text-sm leading-6 text-ink-AAA whitespace-pre-line">
          {item.description}
          {'\n\n'}
          ※ 這是 preview placeholder。spec 002 §6 + spec 017 BFF 接上後，
          這裡會顯示後端回傳的 `content` 長文。
        </p>
      </section>
      <DonateCta />
    </div>
  )
}

function CoverWithRibbon({
  coverImageUrl,
  alt,
}: {
  coverImageUrl?: string
  alt: string
}) {
  return (
    <div className="relative w-full aspect-square">
      {coverImageUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={coverImageUrl}
          alt={alt}
          className="w-full h-full object-cover"
        />
      ) : (
        <div
          aria-hidden
          className="absolute inset-0 bg-black/5 flex items-center justify-center text-ink-A"
        >
          <span className="text-sm">無商品圖片</span>
        </div>
      )}
      {/* spec 004c：詳情頁絲帶為「公益義賣 SHOP FOR CHANGE」雙語版 */}
      <div className="absolute top-3 left-0 px-3 py-1 bg-brand text-white rounded-r-md shadow">
        <div className="text-sm font-semibold leading-tight">公益義賣</div>
        <div className="text-[10px] tracking-wider leading-tight">
          SHOP FOR CHANGE
        </div>
      </div>
    </div>
  )
}

function ApprovalNoList() {
  return (
    <dl className="grid grid-cols-[8em_1fr] gap-y-1 text-xs text-ink-A">
      <dt>勸募立案核准字號</dt>
      <dd>衛部救字第 1141364521 號</dd>
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
