import { describe, it, expect } from 'vitest'
import jwt from 'jsonwebtoken'
import webpush from 'web-push'

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

// ============================================
// JWT トークン テスト
// ============================================
describe('JWT トークン', () => {
  const secret = 'test-secret'

  it('ペイロードを正しくエンコード・デコードする', () => {
    const payload = { phone: '09012345678', name: '田中太郎', role: 'member' }
    const token = jwt.sign(payload, secret, { expiresIn: '7d' })
    const decoded = jwt.verify(token, secret)
    expect(decoded.phone).toBe('09012345678')
    expect(decoded.name).toBe('田中太郎')
    expect(decoded.role).toBe('member')
  })

  it('不正なシークレットで検証に失敗する', () => {
    const token = jwt.sign({ phone: '09012345678' }, secret)
    expect(() => jwt.verify(token, 'wrong-secret')).toThrow()
  })

  it('有効期限切れトークンを拒否する', () => {
    const token = jwt.sign({ phone: '09012345678' }, secret, { expiresIn: '-1s' })
    expect(() => jwt.verify(token, secret)).toThrow(/expired/)
  })
})

// ============================================
// VAPID キー テスト
// ============================================
describe('VAPID キー生成', () => {
  it('publicKey と privateKey のペアを生成する', () => {
    const keys = webpush.generateVAPIDKeys()
    expect(keys).toHaveProperty('publicKey')
    expect(keys).toHaveProperty('privateKey')
    expect(typeof keys.publicKey).toBe('string')
    expect(typeof keys.privateKey).toBe('string')
  })

  it('Base64url形式の文字列を生成する', () => {
    const keys = webpush.generateVAPIDKeys()
    // Base64url: alphanumeric + - _ (no + / =)
    expect(keys.publicKey).toMatch(/^[A-Za-z0-9_-]+$/)
    expect(keys.privateKey).toMatch(/^[A-Za-z0-9_-]+$/)
  })

  it('毎回異なるキーペアを生成する', () => {
    const keys1 = webpush.generateVAPIDKeys()
    const keys2 = webpush.generateVAPIDKeys()
    expect(keys1.publicKey).not.toBe(keys2.publicKey)
  })
})
