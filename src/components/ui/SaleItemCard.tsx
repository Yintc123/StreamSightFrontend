'use client'
import Link from 'next/link'
import type { Item } from '@/lib/schemas/list'
import { useImageWithFallback } from './useImageWithFallback'
import { pickFallbackImage } from '@/lib/mock/fallback-images'

type SaleItemCardProps = { item: Item }

const priceFmt = new Intl.NumberFormat('zh-TW')

export function SaleItemCard({ item }: SaleItemCardProps) {
  const { src, onError } = useImageWithFallback(
    item.coverImageUrl,
    pickFallbackImage('item', item.id),
  )

  return (
    <article className="bg-surface-card rounded-xl overflow-hidden border border-line">
      <Link
        href={`/sale-items/${item.id}`}
        className="flex flex-col w-full hover:shadow-md
                   focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand
                   rounded-xl"
      >
        <div className="relative w-full aspect-square">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={src}
            alt=""
            loading="lazy"
            decoding="async"
            onError={onError}
            className="w-full h-full object-cover"
          />
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
