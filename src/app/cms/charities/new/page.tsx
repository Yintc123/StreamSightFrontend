// Spec 011a — /cms/charities/new create page.
// RSC fetches categories (candidate list for chips) + admin gate, then
// hands off to the client form.

import type { Metadata } from 'next'

import { fetchCategories } from '@/lib/api/getCategories'
import { requireAdminSession } from '@/lib/session/requireAdmin'

import { CharityForm } from '../CharityForm'

export const metadata: Metadata = {
  title: '新增公益團體 | JKODonation',
}

export default async function CharityCreatePage() {
  await requireAdminSession()
  const categories = await fetchCategories()
  return <CharityForm mode="create" categories={categories} />
}
