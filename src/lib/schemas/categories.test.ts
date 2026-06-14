import { describe, it, expect } from 'vitest'
import {
  CATEGORY_KEYS,
  CATEGORY_LABELS,
  CategoryKeyEnum,
  getCategoryLabel,
  type CategoryKey,
} from './categories'

describe('categories', () => {
  it('CATEGORY_KEYS 含 16 個 key', () => {
    expect(CATEGORY_KEYS.length).toBe(16)
  })

  it('CATEGORY_KEYS 順序對齊 IMG_4877 截圖（child_care 為首）', () => {
    expect(CATEGORY_KEYS[0]).toBe('child_care')
    expect(CATEGORY_KEYS[1]).toBe('animal_protection')
    expect(CATEGORY_KEYS[CATEGORY_KEYS.length - 1]).toBe('international_aid')
  })

  it('CATEGORY_LABELS 對應每個 key 都有中文 label', () => {
    for (const key of CATEGORY_KEYS) {
      expect(CATEGORY_LABELS[key]).toBeTruthy()
      expect(typeof CATEGORY_LABELS[key]).toBe('string')
    }
  })

  it('CATEGORY_LABELS 對應 IMG_4877：animal_protection → 動物保護', () => {
    expect(CATEGORY_LABELS.animal_protection).toBe('動物保護')
    expect(CATEGORY_LABELS.disability_service).toBe('身心障礙服務')
    expect(CATEGORY_LABELS.poverty_relief).toBe('弱勢扶貧')
  })

  it('CategoryKeyEnum 接受所有 16 個 key', () => {
    for (const key of CATEGORY_KEYS) {
      expect(() => CategoryKeyEnum.parse(key)).not.toThrow()
    }
  })

  it('CategoryKeyEnum 拒絕不在白名單的字串', () => {
    expect(() => CategoryKeyEnum.parse('animal')).toThrow()
    expect(() => CategoryKeyEnum.parse('')).toThrow()
    expect(() => CategoryKeyEnum.parse('UNKNOWN')).toThrow()
  })

  it('getCategoryLabel(null) → 「全部」', () => {
    expect(getCategoryLabel(null)).toBe('全部')
  })

  it('getCategoryLabel(key) → 對應 label', () => {
    expect(getCategoryLabel('animal_protection')).toBe('動物保護')
    expect(getCategoryLabel('international_aid')).toBe('國際救援')
  })

  it('型別安全：CategoryKey 只能是 16 個之一', () => {
    // 編譯期測試 — 純型別檢查（執行時不會 throw）
    const valid: CategoryKey = 'animal_protection'
    expect(valid).toBe('animal_protection')
  })
})
