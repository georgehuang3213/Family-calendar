// 用 firebase-admin（服務帳戶）讀取 events，與後端 server.ts 一致。
// 需要環境變數 FIREBASE_SERVICE_ACCOUNT_KEY（可放在 .env）。
import 'dotenv/config';
import { getDb } from '../lib/firebaseAdmin.js';

async function checkData() {
  const db = getDb();
  if (!db) {
    throw new Error('缺少 FIREBASE_SERVICE_ACCOUNT_KEY 環境變數（請在 .env 設定服務帳戶 JSON）。');
  }
  const snapshot = await db.collection('events').get();
  console.log(`Found ${snapshot.size} documents in 'events' collection.`);
  if (snapshot.size > 0) {
    console.log('Sample data:', snapshot.docs[0].data());
  }
}

checkData().catch((err) => {
  console.error('Error checking data:', err);
  process.exit(1);
});
