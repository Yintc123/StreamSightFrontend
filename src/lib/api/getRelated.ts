// Spec 004a §3 — cross-link list fetcher (charity detail → related donations).
//
// Sister to `getDetail.ts` but for the embedded "捐款專案" section beneath
// a charity. Calls backend directly from RSC (no BFF round-trip; same
// process), validates the list-response envelope, projects to the
// client-facing `Donation` shape so `<DonationProjectCard>` can render it
// as-is.

import 'server-only'

import { headers } from 'next/headers'
import { z } from 'zod'

import { ContractViolationError } from '@/lib/errors/ContractViolationError'
import {
  BackendDonationListItem,
  type Donation,
  toClientDonation,
} from '@/lib/schemas/list'

import { backendFetch } from './backend'

const ResponseSchema = z.object({
  items: z.array(BackendDonationListItem),
  pageInfo: z.object({
    nextCursor: z.string().nullable(),
    hasMore: z.boolean(),
  }),
})

async function languageHeader(): Promise<Record<string, string> | undefined> {
  const h = await headers()
  const lang = h.get('accept-language')
  return lang ? { 'accept-language': lang } : undefined
}

export async function fetchDonationsByCharity(
  charityId: string,
  limit = 10,
): Promise<Donation[]> {
  const { data } = await backendFetch<unknown>(
    '/user/v1/donation/donation-projects',
    {
      query: { charityId, limit },
      headers: await languageHeader(),
    },
  )
  const parsed = ResponseSchema.safeParse(data)
  if (!parsed.success) {
    throw new ContractViolationError(
      `Related donations schema mismatch: ${parsed.error.message}`,
    )
  }
  return parsed.data.items.map(toClientDonation)
}
