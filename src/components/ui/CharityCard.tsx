'use client'
import { useState } from 'react'
import Link from 'next/link'
import type { Charity } from '@/lib/schemas/list'
import { getCharityInitial } from './charity-initial'

type CharityCardProps = { item: Charity }

export function CharityCard({ item }: CharityCardProps) {
  const [imgFailed, setImgFailed] = useState(false)
  const hasLogo = !!item.logoUrl && !imgFailed

  return (
    <article data-component="CharityCard" className="bg-surface-card rounded-xl">
      <Link
        href={`/charities/${item.id}`}
        className="flex items-center gap-3 w-full max-w-[345px] mx-auto px-3 py-[9px]
                   hover:bg-black/5
                   focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand
                   rounded-xl"
      >
        {hasLogo ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={item.logoUrl}
            alt=""
            width={64}
            height={64}
            loading="lazy"
            decoding="async"
            onError={() => setImgFailed(true)}
            className="w-16 h-16 rounded-[9px] border border-line object-cover shrink-0"
          />
        ) : (
          <div
            aria-hidden
            className="w-16 h-16 rounded-[9px] border border-line shrink-0
                       bg-brand/10 text-brand font-medium text-xl
                       flex items-center justify-center select-none"
          >
            {getCharityInitial(item.name)}
          </div>
        )}
        <div className="flex-1 flex flex-col gap-[3px] min-w-0">
          <h2 className="text-base font-medium text-ink-AAA leading-6 line-clamp-1">
            {item.name}
          </h2>
          {item.description && (
            <p className="text-[13px] leading-5 text-ink-AA line-clamp-1">
              {item.description}
            </p>
          )}
        </div>
      </Link>
    </article>
  )
}
