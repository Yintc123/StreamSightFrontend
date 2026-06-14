import { describe, it, expect } from 'vitest'
import { getCharityInitial } from './charity-initial'

describe('getCharityInitial', () => {
  it('ASCII 開頭：取前 2 個英數，轉大寫', () => {
    expect(getCharityInitial('ACC 中華耆幼關懷協會')).toBe('AC')
    expect(getCharityInitial('ASGL 台灣霧後光聯盟')).toBe('AS')
  })

  it('中文開頭：取第 1 個字', () => {
    expect(getCharityInitial('財團法人宜蘭縣...')).toBe('財')
  })

  it('前置空白：trimStart 後再判斷', () => {
    expect(getCharityInitial('  財團法人...')).toBe('財')
  })

  it('emoji 開頭：取第 1 個 grapheme', () => {
    expect(getCharityInitial('🌱 環保協會')).toBe('🌱')
  })

  it('空字串 → 空字串', () => {
    expect(getCharityInitial('')).toBe('')
  })

  it('純空白 → 空字串', () => {
    expect(getCharityInitial('   ')).toBe('')
  })

  it('單字母 → 大寫', () => {
    expect(getCharityInitial('a')).toBe('A')
  })

  it('a-b → 去掉非英數後 AB', () => {
    expect(getCharityInitial('a-b')).toBe('AB')
  })
})
