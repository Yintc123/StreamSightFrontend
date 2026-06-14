'use client'
import Link from 'next/link'
import type { Donation } from '@/lib/schemas/list'
import { CATEGORY_LABELS } from '@/lib/schemas/categories'
import { useImageWithFallback } from './useImageWithFallback'
import { pickFallbackImage } from '@/lib/mock/fallback-images'

type DonationProjectCardProps = { item: Donation }

function HeartGlyph({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 20 20"
      fill="currentColor"
      aria-hidden
      className={className}
    >
      <path d="M10 17s-6-3.6-6-8.2A3.8 3.8 0 0 1 10 5a3.8 3.8 0 0 1 6 3.8C16 13.4 10 17 10 17z" />
    </svg>
  )
}

export function DonationProjectCard({ item }: DonationProjectCardProps) {
  const { src, onError } = useImageWithFallback(
    item.coverImageUrl,
    pickFallbackImage('donation', item.id),
  )
  const cats = item.categories ?? []
  const visibleCats = cats.slice(0, 3)
  const overflow = cats.length - visibleCats.length

  return (
    <article className="bg-surface-card rounded-xl overflow-hidden shadow-sm hover:shadow-md">
      <Link
        href={`/donation-projects/${item.id}`}
        className="flex flex-col w-full max-w-[345px] mx-auto
                   focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand
                   rounded-xl"
      >
        <div className="relative w-full aspect-[16/9]">
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
            className="absolute inset-x-0 bottom-0 bg-brand-overlay text-white
                       text-[13px] leading-5 px-3 py-1 truncate"
          >
            {item.charityName}
          </div>
        </div>
        <div className="flex flex-col gap-1 px-3 py-3">
          <h2 className="text-base font-semibold text-ink-AAA leading-6 line-clamp-1">
            {item.name}
          </h2>
          {item.description && (
            <p className="text-[13px] leading-5 text-ink-AA line-clamp-2">
              {item.description}
            </p>
          )}
          {cats.length > 0 && (
            <ul className="flex flex-wrap gap-2 mt-2">
              {visibleCats.map((key) => (
                <li
                  key={key}
                  className="inline-flex items-center gap-1 px-2 py-[2px] rounded-full
                             bg-black/5 text-[12px] leading-5 text-ink-AA"
                >
                  <HeartGlyph className="w-3 h-3 text-brand" />
                  {CATEGORY_LABELS[key]}
                </li>
              ))}
              {overflow > 0 && (
                <li
                  className="inline-flex items-center px-2 py-[2px] rounded-full
                             bg-black/5 text-[12px] leading-5 text-ink-A"
                >
                  +{overflow}
                </li>
              )}
            </ul>
          )}
        </div>
      </Link>
    </article>
  )
}
