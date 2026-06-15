'use client'
import { useImageWithFallback } from './useImageWithFallback'

export type FallbackImageProps = {
  /** Primary src; undefined / empty → use fallback immediately. */
  primary: string | undefined
  /** Fallback src when primary is missing or `<img>` fires onError. */
  fallback: string
  /** Required alt text — UI image carrying meaning should describe it. */
  alt: string
  className?: string
  width?: number
  height?: number
}

/**
 * Spec 003e4 §4 — thin client wrapper letting RSC pages reuse the same
 * primary/fallback swap the list cards have. RSCs precompute `fallback`
 * (typically `pickFallbackImage(kind, id)`) so the picsum URL choice
 * stays in server code; this component only owns the failed-state flip.
 */
export function FallbackImage({
  primary,
  fallback,
  alt,
  className,
  width,
  height,
}: FallbackImageProps) {
  const { src, onError } = useImageWithFallback(primary, fallback)
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt={alt}
      onError={onError}
      loading="lazy"
      decoding="async"
      className={className}
      width={width}
      height={height}
    />
  )
}
