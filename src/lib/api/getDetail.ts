// Spec 004 — RSC-side detail fetchers.
//
// Detail pages are server components. They call backendFetch directly
// rather than going through their own BFF route (`/api/<r>/<id>`) — same
// process, no extra hop, but identical Zod validation + error mapping.
// The matching BFF route still exists for client-side use cases (future
// "refresh after CTA", revalidation, etc.).
//
// `headers()` is awaited to pull the inbound `Accept-Language` so backend
// i18n sees the user's locale just like the BFF route does.
//
// 404 propagation: backendFetch throws `NotFoundError` on upstream 404;
// each helper lets it escape so the calling RSC can pair it with
// `notFound()`.

import 'server-only'

import { headers } from 'next/headers'

import { ContractViolationError } from '@/lib/errors/ContractViolationError'
import {
  BackendCharityDetail,
  BackendDonationDetail,
  BackendItemDetail,
  type CharityDetail,
  type DonationDetail,
  type ItemDetail,
  toClientCharityDetail,
  toClientDonationDetail,
  toClientItemDetail,
} from '@/lib/schemas/detail'

import { backendFetch } from './backend'

async function languageHeader(): Promise<Record<string, string> | undefined> {
  const h = await headers()
  const lang = h.get('accept-language')
  return lang ? { 'accept-language': lang } : undefined
}

export async function fetchCharityDetail(id: string): Promise<CharityDetail> {
  const { data } = await backendFetch<unknown>(
    `/user/v1/donation/charities/${id}`,
    { headers: await languageHeader() },
  )
  const parsed = BackendCharityDetail.safeParse(data)
  if (!parsed.success) {
    throw new ContractViolationError(
      `Charity detail schema mismatch: ${parsed.error.message}`,
    )
  }
  return toClientCharityDetail(parsed.data)
}

export async function fetchDonationDetail(id: string): Promise<DonationDetail> {
  const { data } = await backendFetch<unknown>(
    `/user/v1/donation/donation-projects/${id}`,
    { headers: await languageHeader() },
  )
  const parsed = BackendDonationDetail.safeParse(data)
  if (!parsed.success) {
    throw new ContractViolationError(
      `Donation detail schema mismatch: ${parsed.error.message}`,
    )
  }
  return toClientDonationDetail(parsed.data)
}

export async function fetchItemDetail(id: string): Promise<ItemDetail> {
  const { data } = await backendFetch<unknown>(
    `/user/v1/donation/sale-items/${id}`,
    { headers: await languageHeader() },
  )
  const parsed = BackendItemDetail.safeParse(data)
  if (!parsed.success) {
    throw new ContractViolationError(
      `Item detail schema mismatch: ${parsed.error.message}`,
    )
  }
  return toClientItemDetail(parsed.data)
}
