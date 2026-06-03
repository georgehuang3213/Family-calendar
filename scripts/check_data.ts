// 用 firebase-admin（服務帳戶）讀取 events，與後端 server.ts 一致。
// 需要環境變數 FIREBASE_SERVICE_ACCOUNT_KEY（可放在 .env）。
// 註：前端用的 client SDK 已被鎖死的 Firestore 規則擋住，故這裡改用 admin SDK。
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

async function checkData() {
  const db = getDb();
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
