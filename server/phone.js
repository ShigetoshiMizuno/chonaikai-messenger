// 電話番号正規化ユーティリティ
// 日本の携帯番号を統一形式に正規化する

/**
 * 電話番号から記号・スペースを除去し、先頭0を+81に変換
 * 入力例: "090-1234-5678", "090 1234 5678", "+819012345678"
 * 出力: "09012345678" (国内統一形式)
 */
function normalizePhone(phone) {
  if (!phone) return '';
  let cleaned = phone.replace(/[-\s()]/g, '');

  // +81 → 0 に変換（国内統一形式で保存）
  if (cleaned.startsWith('+81')) {
    cleaned = '0' + cleaned.slice(3);
  } else if (cleaned.startsWith('81') && cleaned.length === 12) {
    cleaned = '0' + cleaned.slice(2);
  }

  return cleaned;
}

/**
 * 日本の携帯電話番号として妥当かチェック
 */
function isValidPhone(phone) {
  const normalized = normalizePhone(phone);
  return /^0[789]0\d{8}$/.test(normalized);
}

module.exports = { normalizePhone, isValidPhone };
