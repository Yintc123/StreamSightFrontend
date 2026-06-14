// Spec 016 §6.2 — categories dictionary mock.
//
// Builds the response from the same `CATEGORY_KEYS` + `CATEGORY_LABELS`
// the UI uses for static lookups. No filtering or paging — the endpoint
// returns the entire 16-row dictionary.

import 'server-only'

import { CATEGORY_KEYS, CATEGORY_LABELS } from '@/lib/schemas/categories'
import type { MockHandler } from './dispatch'

const ITEMS = CATEGORY_KEYS.map((key, idx) => ({
  id: `cat-${key}`,
  key,
  displayName: CATEGORY_LABELS[key],
  displayOrder: (idx + 1) * 10,
}))

export const categoriesListHandler: MockHandler = () => ({ items: ITEMS })
