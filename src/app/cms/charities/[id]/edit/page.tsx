// Spec 011a §5 — /cms/charities/[id]/edit
//
// RSC fetches the admin charity detail (BE 026 §5.1.2) plus the category
// dictionary, hydrates the reducer's initial state, and hands off to the
// shared CharityForm client component. 404 on missing id falls through
// to Next's notFound() so the global not-found page handles it.

import type { Metadata } from 'next'
import { notFound } from 'next/navigation'

import { fetchAdminCharityDetail } from '@/lib/api/getAdminCharityDetail'
import { fetchCategories } from '@/lib/api/getCategories'
import { NotFoundError } from '@/lib/errors/NotFoundError'
import {
  ensureAdminAccess,
  requireAdminSession,
} from '@/lib/session/requireAdmin'

import { CharityForm } from '../../CharityForm'
import { DEFAULT_FORM, type FormState } from '../../useCharityForm'

export const metadata: Metadata = {
  title: '編輯公益團體 | JKODonation',
}

export default async function CharityEditPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  await requireAdminSession()
  const { id } = await params

  // ensureAdminAccess takes 401/403 from BE → log out + redirect home.
  // NotFoundError stays in this layer so the page can flip to notFound().
  const charity = await ensureAdminAccess(async () => {
    try {
      return await fetchAdminCharityDetail(id)
    } catch (e) {
      if (e instanceof NotFoundError) notFound()
      throw e
    }
  })
  const categories = await ensureAdminAccess(fetchCategories)

  const initial: FormState = {
    ...DEFAULT_FORM,
    name: charity.name,
    description: charity.description,
    contactPhone: charity.contactPhone ?? '',
    contactEmail: charity.contactEmail ?? '',
    officialWebsite: charity.officialWebsite ?? '',
    approvalNo: charity.approvalNo ?? '',
    displayOrder: charity.displayOrder,
    publishStartAt: charity.publishStartAt ?? '',
    publishEndAt: charity.publishEndAt ?? '',
    categoryIds: charity.categories.map((c) => c.id),
  }

  return (
    <CharityForm
      mode="edit"
      id={id}
      initial={initial}
      categories={categories}
    />
  )
}
