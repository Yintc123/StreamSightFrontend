import { notFound } from 'next/navigation'
import type { Metadata } from 'next'
import { CtaIsland } from '@/app/checkout/CtaIsland'
import { ExpandableText } from '@/components/ui/ExpandableText'
import { ShareIconButton } from '@/components/ui/ShareIconButton'
import { TopNav } from '@/components/ui/TopNav'
import { fetchCharityDetail } from '@/lib/api/getDetail'
import { NotFoundError } from '@/lib/errors/NotFoundError'
import type { CharityDetail } from '@/lib/schemas/detail'
import { getCharityInitial } from '@/components/ui/charity-initial'
import { RelatedProjects } from './RelatedProjects'

type PageProps = { params: Promise<{ id: string }> }

async function safeFetch(id: string): Promise<CharityDetail | null> {
  try {
    return await fetchCharityDetail(id)
  } catch (e) {
    if (e instanceof NotFoundError) return null
    throw e
  }
}

export async function generateMetadata({
  params,
}: PageProps): Promise<Metadata> {
  const { id } = await params
  const c = await safeFetch(id)
  return {
    title: c ? `${c.name} | JKODonation` : '公益團體介紹 | JKODonation',
  }
}

/**
 * Spec 004a v0.2 — 公益團體介紹頁，對齊 Figma IMG_4881。
 *
 * Layout：紅 hero → 白色 panel（基本資料 + 描述 + 分類 + CTA in-card）
 *        → 底部「捐款專案」cross-link 區。
 *
 * 跟 v0.1 相比的差異（v0.2）：
 *  - 描述用 <ExpandableText>（line-clamp-3 + 更多）
 *  - 「直接捐款給團體」CTA 從 sticky 改為 in-card（Figma 設計如此）
 *  - 「捐款專案」從文字 + link 改成真實 <DonationProjectCard> 列表
 *  - TopNav 加 <ShareIconButton> accessory（v0.3 — Web Share API + clipboard fallback）
 *  - CTA 透過 <CtaIsland> 開啟 DonationSettingsSheet（spec 008 §4，sticky=false in-card）
 */
export default async function Page({ params }: PageProps) {
  const { id } = await params
  const charity = await safeFetch(id)
  if (!charity) notFound()

  return (
    <div data-component="CharityDetailPage" className="flex flex-col min-h-dvh bg-surface-page">
      <TopNav
        title="公益團體介紹"
        accessory={<ShareIconButton title={charity.name} />}
      />
      <Hero name={charity.name} logoUrl={charity.logoUrl} />
      <div className="-mt-6 mx-3 bg-surface-card rounded-2xl shadow-[0_0_40px_8px_rgba(255,255,255,0.9)] ring-1 ring-black/5 relative z-10 p-5 space-y-5">
        <ContactInfo
          contactPhone={charity.contactPhone}
          contactEmail={charity.contactEmail}
          officialWebsite={charity.officialWebsite}
          approvalNo={charity.approvalNo}
        />
        <ExpandableText text={charity.description} />
        {charity.categories.length > 0 && (
          <CategoryTags categories={charity.categories} />
        )}
        <CtaIsland
          kind="donation"
          target={{ type: 'CHARITY', detail: charity }}
          label="直接捐款給團體"
        />
      </div>
      <div className="flex-1">
        <RelatedProjects charityId={charity.id} />
      </div>
    </div>
  )
}

function Hero({ name, logoUrl }: { name: string; logoUrl?: string }) {
  return (
    <section data-component="Hero" className="bg-brand pb-10 pt-8 px-5 flex flex-col items-center gap-4">
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

function ContactInfo({
  contactPhone,
  contactEmail,
  officialWebsite,
  approvalNo,
}: {
  contactPhone?: string
  contactEmail?: string
  officialWebsite?: string
  approvalNo?: string
}) {
  // Suppress the whole section if backend returned nothing — avoids
  // an empty "基本資料" header above zero rows.
  if (!contactPhone && !contactEmail && !officialWebsite && !approvalNo) {
    return null
  }
  return (
    <section data-component="ContactInfo" aria-labelledby="contact-info-h">
      <h2 id="contact-info-h" className="text-base font-medium text-ink-AAA mb-3">
        基本資料
      </h2>
      <dl className="grid grid-cols-[6em_1fr] gap-y-2 text-sm">
        {contactPhone && (
          <>
            <dt className="text-ink-AA">聯絡電話</dt>
            <dd>
              <a className="text-ink-link" href={`tel:${contactPhone}`}>
                {contactPhone}
              </a>
            </dd>
          </>
        )}
        {contactEmail && (
          <>
            <dt className="text-ink-AA">聯絡信箱</dt>
            <dd>
              <a className="text-ink-link" href={`mailto:${contactEmail}`}>
                {contactEmail}
              </a>
            </dd>
          </>
        )}
        {officialWebsite && (
          <>
            <dt className="text-ink-AA">官方網站</dt>
            <dd>
              <a
                className="text-ink-link break-all"
                href={officialWebsite}
                target="_blank"
                rel="noreferrer noopener"
              >
                {officialWebsite}
              </a>
            </dd>
          </>
        )}
        {approvalNo && (
          <>
            <dt className="text-ink-AA">核准字號</dt>
            <dd className="text-ink-AAA">{approvalNo}</dd>
          </>
        )}
      </dl>
    </section>
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

