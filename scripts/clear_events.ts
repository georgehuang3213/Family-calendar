// ⚠️ 危險操作：刪除 events 集合裡的「所有」行程。
// 用 firebase-admin（服務帳戶），需要 FIREBASE_SERVICE_ACCOUNT_KEY 環境變數（可放在 .env）。
// 安全機制：必須加上 --yes 參數才會真的刪除，避免誤觸把全家行程清空。
import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

function getDb() {
  const serviceAccountKey = process.env.FIREBASE_SERVICE_ACCOUNT_KEY;
  if (!serviceAccountKey) {
    throw new Error('缺少 FIREBASE_SERVICE_ACCOUNT_KEY 環境變數（請在 .env 設定服務帳戶 JSON）。');
  }
  let databaseId = '(default)';
  const configPath = path.join(process.cwd(), 'firebase-applet-config.json');
  if (fs.existsSync(configPath)) {
    const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    if (config.firestoreDatabaseId) databaseId = config.firestoreDatabaseId;
  }
  if (getApps().length === 0) {
    initializeApp({ credential: cert(JSON.parse(serviceAccountKey)) });
  }
  return getFirestore(databaseId);
}

async function clearEvents() {
  const db = getDb();
  const snapshot = await db.collection('events').get();

  if (!process.argv.includes('--yes')) {
    console.log(`⚠️ 這會刪除 events 集合中全部 ${snapshot.size} 筆行程，且無法復原。`);
    console.log('若確定要執行，請重新執行並加上 --yes 參數：');
    console.log('   npx tsx scripts/clear_events.ts --yes');
    return;
  }

  let deleted = 0;
  for (const document of snapshot.docs) {
    await document.ref.delete();
    deleted++;
    console.log(`Deleted: ${document.id}`);
  }
  console.log(`Events cleared. (${deleted} 筆)`);
}

clearEvents().catch((err) => {
  console.error('Error clearing events:', err);
  process.exit(1);
});
