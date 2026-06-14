import { notFound } from 'next/navigation'
import Link from 'next/link'
import type { Metadata } from 'next'
import { TopNav } from '@/components/ui/TopNav'
import { CATEGORY_LABELS } from '@/lib/schemas/categories'
import { findCharityById } from '@/lib/mock/find-by-id'
import { getCharityInitial } from '@/components/ui/charity-initial'

type PageProps = { params: Promise<{ id: string }> }

export async function generateMetadata({
  params,
}: PageProps): Promise<Metadata> {
  const { id } = await params
  const c = findCharityById(id)
  return {
    title: c ? `${c.name} | JKODonation` : '公益團體介紹 | JKODonation',
  }
}

/**
 * Spec 004a — 公益團體介紹頁 preview
 *
 * 對齊 IMG_4881。本 preview 用 list fixture (Charity) 顯示已有欄位；
 * spec 004 §5 定義的 detail 欄位（聯絡電話 / 信箱 / 官方網站 / 核准字號）
 * fixture 沒有，先用 placeholder。spec 002 §6 + 017 BFF 接上後改 fetch。
 */
export default async function Page({ params }: PageProps) {
  const { id } = await params
  const charity = findCharityById(id)
  if (!charity) notFound()

  return (
    <div className="flex flex-col min-h-dvh bg-surface-page">
      <TopNav title="公益團體介紹" />
      <Hero name={charity.name} logoUrl={charity.logoUrl} />
      <div className="-mt-6 mx-3 bg-surface-card rounded-2xl shadow-sm relative z-10 p-5 space-y-5">
        <ContactInfo />
        <Description text={charity.description} />
        {charity.categories && charity.categories.length > 0 && (
          <CategoryTags categories={charity.categories} />
        )}
      </div>
      <div className="flex-1 px-5 py-6">
        <RelatedSectionPlaceholder />
      </div>
      <DirectDonateCta />
    </div>
  )
}

function Hero({ name, logoUrl }: { name: string; logoUrl?: string }) {
  return (
    <section className="bg-brand pb-10 pt-8 px-5 flex flex-col items-center gap-4">
      <div className="w-24 h-24 rounded-full bg-white border-4 border-white shadow-md flex items-center justify-center overflow-hidden">
        {logoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={logoUrl}
            alt=""
            width={96}
            height={96}
            className="w-full h-full object-cover"
          />
        ) : (
          <span aria-hidden className="text-brand text-3xl font-bold select-none">
            {getCharityInitial(name)}
          </span>
        )}
      </div>
      <h1 className="text-white text-lg font-bold text-center leading-7">
        {name}
      </h1>
    </section>
  )
}

function ContactInfo() {
  // Preview placeholder：spec 004 §5 CharityDetail 欄位未在 fixture 內
  return (
    <section aria-labelledby="contact-info-h">
      <h2 id="contact-info-h" className="text-base font-medium text-ink-AAA mb-3">
        基本資料
      </h2>
      <dl className="grid grid-cols-[6em_1fr] gap-y-2 text-sm">
        <dt className="text-ink-AA">聯絡電話</dt>
        <dd>
          <a className="text-ink-link" href="tel:0266040024">
            02-66040024
          </a>
        </dd>
        <dt className="text-ink-AA">聯絡信箱</dt>
        <dd>
          <a className="text-ink-link" href="mailto:contact@example.org">
            contact@example.org
          </a>
        </dd>
        <dt className="text-ink-AA">官方網站</dt>
        <dd>
          <a
            className="text-ink-link break-all"
            href="https://example.org"
            target="_blank"
            rel="noreferrer noopener"
          >
            https://example.org
          </a>
        </dd>
        <dt className="text-ink-AA">核准字號</dt>
        <dd className="text-ink-AAA">台內團字第 1110295700 號</dd>
      </dl>
    </section>
  )
}

function Description({ text }: { text: string }) {
  return (
    <section>
      <p className="text-sm leading-6 text-ink-AAA">{text}</p>
    </section>
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

function RelatedSectionPlaceholder() {
  return (
    <section>
      <h2 className="text-base font-medium text-ink-AAA mb-3">捐款專案</h2>
      <p className="text-sm text-ink-A">
        spec 002 §6 + spec 017 BFF 完成後，這裡將列出此團體的進行中專案。
      </p>
      <Link
        href="/donation?tab=donation"
        className="inline-block mt-2 text-sm text-ink-link"
      >
        先去看全部捐款專案 →
      </Link>
    </section>
  )
}

function DirectDonateCta() {
  return (
    <div className="sticky bottom-0 inset-x-0 bg-surface-card border-t border-line px-5 py-3 pb-[env(safe-area-inset-bottom)]">
      <button
        type="button"
        className="w-full h-12 rounded-full bg-brand text-white text-base font-semibold
                   focus-visible:outline focus-visible:outline-2
                   focus-visible:outline-offset-2 focus-visible:outline-brand"
      >
        直接捐款給團體
      </button>
    </div>
  )
}
