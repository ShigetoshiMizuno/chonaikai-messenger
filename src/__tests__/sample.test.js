import { describe, it, expect } from 'vitest'

// 電話番号フォーマットのユーティリティ（将来切り出し予定）
function normalizePhone(phone) {
  return phone.replace(/[-\s]/g, '')
}

function isValidPhone(phone) {
  const normalized = normalizePhone(phone)
  return /^0[789]0\d{8}$/.test(normalized)
}

describe('電話番号バリデーション', () => {
  it('正しい携帯番号を受け入れる', () => {
    expect(isValidPhone('09012345678')).toBe(true)
    expect(isValidPhone('080-1234-5678')).toBe(true)
    expect(isValidPhone('070 1234 5678')).toBe(true)
  })

  it('不正な番号を拒否する', () => {
    expect(isValidPhone('0312345678')).toBe(false)   // 固定電話
    expect(isValidPhone('12345')).toBe(false)          // 短すぎ
    expect(isValidPhone('')).toBe(false)               // 空文字
  })
})

describe('電話番号正規化', () => {
  it('ハイフンとスペースを除去する', () => {
    expect(normalizePhone('090-1234-5678')).toBe('09012345678')
    expect(normalizePhone('090 1234 5678')).toBe('09012345678')
  })
})

// ID生成ユーティリティ（prototype-v2.jsx と同じロジック）
function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8)
}

describe('generateId', () => {
  it('文字列を返す', () => {
    expect(typeof generateId()).toBe('string')
  })

  it('呼び出すたびに異なるIDを生成する', () => {
    const id1 = generateId()
    const id2 = generateId()
    expect(id1).not.toBe(id2)
  })

  it('base36文字列で構成される', () => {
    const id = generateId()
    expect(id).toMatch(/^[0-9a-z]+$/)
  })
})
