'use client'
import { useCallback, useState } from 'react'

export type ImageWithFallback = {
  src: string
  onError: () => void
}

export function useImageWithFallback(
  primary: string | undefined,
  fallback: string,
): ImageWithFallback {
  const [prevPrimary, setPrevPrimary] = useState(primary)
  const [failed, setFailed] = useState(false)

  if (primary !== prevPrimary) {
    setPrevPrimary(primary)
    setFailed(false)
  }

  const onError = useCallback(() => setFailed(true), [])
  const usePrimary = !!primary && !failed
  return { src: usePrimary ? primary : fallback, onError }
}
