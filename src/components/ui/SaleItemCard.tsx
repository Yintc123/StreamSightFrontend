'use client'
import { useState } from 'react'
import Link from 'next/link'
import type { Item } from '@/lib/schemas/list'

type SaleItemCardProps = { item: Item }

const priceFmt = new Intl.NumberFormat('zh-TW')

export function SaleItemCard({ item }: SaleItemCardProps) {
  const [imgFailed, setImgFailed] = useState(false)
  const hasCover = !!item.coverImageUrl && !imgFailed

  return (
    <article className="bg-surface-card rounded-xl overflow-hidden border border-line">
      <Link
        href={`/sale-items/${item.id}`}
        className="flex flex-col w-full hover:shadow-md
                   focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand
                   rounded-xl"
      >
        <div className="relative w-full aspect-square">
          {hasCover ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={item.coverImageUrl}
              alt=""
              loading="lazy"
              decoding="async"
              onError={() => setImgFailed(true)}
              className="w-full h-full object-cover"
            />
          ) : (
            <div
              aria-hidden
              className="absolute inset-0 bg-black/5 flex items-center justify-center text-ink-A"
            />
          )}
          <div
            className="absolute top-2 left-0 px-2 py-[2px] bg-brand text-white
                       text-[11px] leading-4 rounded-r-md shadow-sm"
          >
            公益標籤
          </div>
        </div>
        <div className="flex flex-col gap-1 px-2 py-2">
          <h2
            className="text-[13px] font-medium text-ink-AAA leading-[18px]
                       line-clamp-2 min-h-[36px]"
          >
            {item.name}
          </h2>
          <p className="text-[11px] leading-4 text-ink-AA line-clamp-1">
            {item.charityName}
          </p>
          <p className="text-base font-bold text-brand leading-6">
            TWD {priceFmt.format(item.priceTwd)}
          </p>
        </div>
      </Link>
    </article>
  )
}
