// Spec 002 §5 / §6 — TanStack Query Provider boundary.
//
// Created once per browser tab (stable QueryClient via useState lazy init —
// strictMode double-render must not produce two clients).
//
// Defaults rationale:
//   - `staleTime: 30_000` — spec 002 §1.3. Within 30s, switching tabs back
//     to a previously-fetched resource hits cache (no network).
//   - `gcTime: 5 * 60_000` — keep inactive query data for 5 min so
//     navigating into a detail page and back is instant.
//   - `refetchOnWindowFocus: false` — list endpoints are no-store /
//     time-sensitive (backend spec 016 §11.1); window-focus refetches
//     would create surprise loading spinners without much benefit.
//   - `retry: 1` — single retry covers transient blips; more retries
//     would just delay surfacing the error UI (spec 003h InlineError).

'use client'

import {
  MutationCache,
  QueryCache,
  QueryClient,
  QueryClientProvider,
} from '@tanstack/react-query'
import { useState, type ReactNode } from 'react'
import { Toaster } from 'sonner'

import {
  handleGlobalQueryError,
  handleGlobalQuerySuccess,
} from '@/lib/errors/globalQueryError'
import { InAppNavProvider } from '@/lib/hooks/useInAppNav'
import { ThemeProvider, useTheme } from '@/lib/theme/ThemeProvider'
import type { Theme } from '@/lib/theme/schema'

// spec 014b §3.3 — 消費 useTheme 讓 Toaster 即時跟隨切換
function ThemedToaster() {
  const { theme } = useTheme()
  return <Toaster theme={theme} richColors position="top-center" closeButton />
}

export function Providers({
  initialTheme,
  children,
}: {
  initialTheme?: Theme
  children: ReactNode
}) {
  const [client] = useState(
    () =>
      new QueryClient({
        // Spec 006 — central error / success interception. 5xx → toast
        // (handler dedups by stable id); success path dismisses any
        // lingering "server 維修中" banner. Per-section <InlineError>
        // still owns the retry UX inside the failed list.
        queryCache: new QueryCache({
          onError: handleGlobalQueryError,
          onSuccess: handleGlobalQuerySuccess,
        }),
        mutationCache: new MutationCache({
          onError: handleGlobalQueryError,
          onSuccess: handleGlobalQuerySuccess,
        }),
        defaultOptions: {
          queries: {
            staleTime: 30_000,
            gcTime: 5 * 60_000,
            refetchOnWindowFocus: false,
            retry: 1,
          },
        },
      }),
  )
  return (
    // spec 014a: ThemeProvider 由 layout.tsx 傳 initialTheme（cookie SSR 值）
    // spec 014b §3.3: ThemedToaster 需在 ThemeProvider 內層才能消費 useTheme
    <ThemeProvider initialTheme={initialTheme}>
      <QueryClientProvider client={client}>
        {/* Spec 005 §4 — tracks in-app navigation so TopNav's smart back can
            decide between router.back() vs push(fallback). In-memory only;
            refresh resets on purpose. */}
        <InAppNavProvider>{children}</InAppNavProvider>
        {/* Spec 006 — sonner mount; toasts are upserted by stable id so
            concurrent 5xx requests collapse into one banner. closeButton
            gives the user an X to dismiss manually; per-toast duration
            (3s) handles the auto-dismiss path. Position uses sonner default
            (top-center, ~32px from top). */}
        <ThemedToaster />
      </QueryClientProvider>
    </ThemeProvider>
  )
}
