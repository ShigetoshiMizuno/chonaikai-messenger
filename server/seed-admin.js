#!/usr/bin/env node

// ============================================
// 初期管理者ブートストラップ
// Usage: node server/seed-admin.js --phone 09012345678 --name "管理者" --zodiac dragon
// ============================================

const { initDatabase } = require('./init-db');
const { adminRegisterMember, normalizeZodiac, ZODIAC_SIGNS } = require('./auth');
const { normalizePhone, isValidPhone } = require('./phone');

function parseArgs(args) {
  const result = {};
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--phone' && args[i + 1]) result.phone = args[++i];
    else if (args[i] === '--name' && args[i + 1]) result.name = args[++i];
    else if (args[i] === '--zodiac' && args[i + 1]) result.zodiac = args[++i];
  }
  return result;
}

const args = parseArgs(process.argv.slice(2));

if (!args.phone || !args.name || !args.zodiac) {
  console.error('Usage: node server/seed-admin.js --phone <電話番号> --name <名前> --zodiac <干支>');
  console.error('');
  console.error('干支一覧:');
  console.error('  rat(子) ox(丑) tiger(寅) rabbit(卯) dragon(辰) snake(巳)');
  console.error('  horse(午) sheep(未) monkey(申) rooster(酉) dog(戌) boar(亥)');
  process.exit(1);
}

const phone = normalizePhone(args.phone);
if (!phone || !isValidPhone(phone)) {
  console.error(`エラー: 無効な電話番号です: ${args.phone}`);
  process.exit(1);
}

const zodiac = normalizeZodiac(args.zodiac);
if (!zodiac) {
  console.error(`エラー: 無効な干支です: ${args.zodiac}`);
  console.error(`有効な干支: ${ZODIAC_SIGNS.join(', ')}`);
  process.exit(1);
}

const db = initDatabase();

try {
  const member = adminRegisterMember(db, phone, args.name, zodiac, 'admin');
  console.log('管理者を登録しました:');
  console.log(`  ID:     ${member.id}`);
  console.log(`  電話番号: ${member.phone}`);
  console.log(`  名前:   ${member.name}`);
  console.log(`  干支:   ${zodiac}`);
  console.log(`  役割:   ${member.role}`);
} catch (e) {
  console.error('エラー:', e.message);
  process.exit(1);
} finally {
  db.close();
}
