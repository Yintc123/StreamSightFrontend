/**
 * Spec 002 §3.1 — Categories
 *
 * 對齊 backend 015 §7 + 截圖補件 IMG_4877 / IMG_4879 / IMG_4880
 * （categories 從 6 個擴為 16 個；key 順序對齊 CategoryMenu 3 欄 grid 視覺）。
 *
 * 三 tab 共用同一份白名單（backend 015 §7.2）。
 */
import { z } from 'zod'

/** 16 個 categories；順序對齊 IMG_4877 截圖（first row: child_care / animal_protection / ...） */
export const CATEGORY_KEYS = [
  'child_care',                // 兒少照護
  'animal_protection',         // 動物保護
  'special_medical',           // 特殊醫病
  'elderly_care',              // 老人照護
  'disability_service',        // 身心障礙服務
  'women_care',                // 婦女關懷
  'sports_development',        // 運動發展
  'education_advocacy',        // 教育議題提倡
  'environmental_protection',  // 環境保護
  'diversity',                 // 多元族群
  'media',                     // 媒體傳播
  'public_issue',              // 公共議題
  'arts_culture',              // 文教藝術
  'community_development',     // 社區發展
  'poverty_relief',            // 弱勢扶貧
  'international_aid',         // 國際救援
] as const

export type CategoryKey = (typeof CATEGORY_KEYS)[number]

export const CategoryKeyEnum = z.enum(CATEGORY_KEYS)

/** UI 顯示用中文 label。`null` key = 「全部」（未選擇）。 */
export const CATEGORY_LABELS: Record<CategoryKey, string> = {
  child_care:               '兒少照護',
  animal_protection:        '動物保護',
  special_medical:          '特殊醫病',
  elderly_care:             '老人照護',
  disability_service:       '身心障礙服務',
  women_care:               '婦女關懷',
  sports_development:       '運動發展',
  education_advocacy:       '教育議題提倡',
  environmental_protection: '環境保護',
  diversity:                '多元族群',
  media:                    '媒體傳播',
  public_issue:             '公共議題',
  arts_culture:             '文教藝術',
  community_development:    '社區發展',
  poverty_relief:           '弱勢扶貧',
  international_aid:        '國際救援',
}

export function getCategoryLabel(key: CategoryKey | null): string {
  return key === null ? '全部' : CATEGORY_LABELS[key]
}

// —— Backend /v1/donation/categories response shape (spec 016 §6.2) ——
//
// Used by the BFF `/api/categories` Route Handler to validate the upstream
// payload. Client receives the same shape (no transformation needed —
// `key` already drives the filter URL state and `displayName` already
// renders in the dropdown).

export const BackendCategoryItem = z.object({
  id: z.string(),
  key: CategoryKeyEnum,
  displayName: z.string(),
  displayOrder: z.number().int(),
})
export type BackendCategoryItem = z.infer<typeof BackendCategoryItem>

export const BackendCategoryListResponse = z.object({
  items: z.array(BackendCategoryItem),
})
export type BackendCategoryListResponse = z.infer<typeof BackendCategoryListResponse>
