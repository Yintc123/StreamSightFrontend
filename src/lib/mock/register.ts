// Spec 002 §4.3 / §4.5 — eager mock registration.
//
// Imported by `src/instrumentation.ts` on Node runtime when
// `process.env.USE_MOCK === '1'`. Side-effect: every `/v1/donation/*`
// path the BFF might hit becomes resolvable through `resolveMock` —
// the dev server now satisfies a list / detail call without a live
// backend, and the e2e tests run against a deterministic data set.

import 'server-only'

import {
  adaptCharityDetail,
  adaptCharityList,
  adaptDonationDetail,
  adaptDonationList,
  adaptItemDetail,
  adaptItemList,
} from './adapters'
import { categoriesListHandler } from './categories-mock'
import { CHARITY_FIXTURES } from './charity-fixtures'
import { registerMock } from './dispatch'
import { DONATION_FIXTURES } from './donation-fixtures'
import { findCharityById, findDonationById, findItemById } from './find-by-id'
import { ITEM_FIXTURES } from './item-fixtures'
import { makeDetailHandler } from './makeDetailHandler'
import { makeListHandler } from './makeListHandler'

// —— List endpoints ——
registerMock(
  '/v1/donation/charities',
  makeListHandler(CHARITY_FIXTURES, adaptCharityList),
)
registerMock(
  '/v1/donation/donation-projects',
  makeListHandler(DONATION_FIXTURES, adaptDonationList),
)
registerMock(
  '/v1/donation/sale-items',
  makeListHandler(ITEM_FIXTURES, adaptItemList),
)

// —— Categories dictionary ——
registerMock('/v1/donation/categories', categoriesListHandler)

// —— Detail endpoints ——
registerMock(
  '/v1/donation/charities/:id',
  makeDetailHandler(findCharityById, adaptCharityDetail, 'charity'),
)
registerMock(
  '/v1/donation/donation-projects/:id',
  makeDetailHandler(
    findDonationById,
    (d) => adaptDonationDetail(d, findCharityById(d.charityId)),
    'donation-project',
  ),
)
registerMock(
  '/v1/donation/sale-items/:id',
  makeDetailHandler(
    findItemById,
    (i) => adaptItemDetail(i, findCharityById(i.charityId)),
    'sale-item',
  ),
)
