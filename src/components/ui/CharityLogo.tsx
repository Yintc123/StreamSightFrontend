'use client'
import { useState } from 'react'
import { getCharityInitial } from './charity-initial'

type CharityLogoProps = {
  name: string
  logoUrl?: string
}

/**
 * Spec 003e4 §4.3 — charity logo with initial-letter fallback.
 *
 * Used by donation/item detail pages' `<CharityChip>` and (in the future)
 * could replace the inline logic in [003e1 CharityCard](./CharityCard.tsx)
 * / [003e1 charity Hero](../../app/charities/[id]/page.tsx).
 *
 * Renders just the content (img or initial text) — the caller owns the
 * outer container (size, bg, flex centering). This keeps the component
 * reusable across charity card (64×64) / chip (40×40) / hero (96×96)
 * without re-encoding their distinct styling.
 *
 * Fallback rule = `getCharityInitial(name)` (AC / 財 / 🌱) per
 * [003e1 §3.1](../../../docs/specs/003e1-charity-card.md#31-logo--fallback-dom).
 */
export function CharityLogo({ name, logoUrl }: CharityLogoProps) {
  const [imgFailed, setImgFailed] = useState(false)
  const hasLogo = !!logoUrl && !imgFailed
  if (hasLogo) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        data-component="CharityLogo"
        src={logoUrl}
        alt=""
        loading="lazy"
        decoding="async"
        onError={() => setImgFailed(true)}
        className="w-full h-full object-cover"
      />
    )
  }
  return <>{getCharityInitial(name)}</>
}
