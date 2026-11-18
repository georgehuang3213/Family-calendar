import fs from 'fs';
import path from 'path';
import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getFirestore, FieldValue, type Firestore } from 'firebase-admin/firestore';

let dbInstance: Firestore | null = null;

function readDatabaseId(): string {
  try {
    const configPath = path.join(process.cwd(), 'firebase-applet-config.json');
    if (fs.existsSync(configPath)) {
      const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
      if (config.firestoreDatabaseId) {
        return config.firestoreDatabaseId;
      }
    }
  } catch (e) {
    console.warn('⚠️ Could not read firebase-applet-config.json for database ID');
  }
  return '(default)';
}

/** Lazy-initialize and return the shared Firebase Admin Firestore instance. */
export function getDb(): Firestore | null {
  if (dbInstance) return dbInstance;

  const serviceAccountKey = process.env.FIREBASE_SERVICE_ACCOUNT_KEY;
  if (!serviceAccountKey) {
    return null;
  }

  try {
    const databaseId = readDatabaseId();
    if (getApps().length === 0) {
      initializeApp({
        credential: cert(JSON.parse(serviceAccountKey)),
      });
    }
    dbInstance = getFirestore(databaseId);
    console.log(`✅ Firestore initialized with DB ID: ${databaseId}`);
    return dbInstance;
  } catch (e) {
    console.error('❌ Failed to initialize Firebase Admin:', e);
    return null;
  }
}

// 短時間內快取 rev 值：多個家庭成員同時輪詢時，同一 TTL 窗口內只讀一次 Firestore。
let revCache: { rev: number; ts: number } | null = null;
const REV_CACHE_TTL = 5000;

export function invalidateRevCache(): void {
  revCache = null;
}

export async function getEventsRev(database: Firestore): Promise<number> {
  const now = Date.now();
  if (revCache && now - revCache.ts < REV_CACHE_TTL) {
    return revCache.rev;
  }
  let rev = 0;
  try {
    const metaSnap = await database.collection('system_config').doc('events_meta').get();
    const data = metaSnap.data();
    if (metaSnap.exists && typeof data?.rev === 'number') {
      rev = data.rev;
    }
  } catch (e) {
    console.warn('讀取 events_meta 失敗，改為回傳完整清單。', e);
  }
  revCache = { rev, ts: now };
  return rev;
}

/** 事件版本號 +1，讓前端用低成本輪詢偵測行程變更並立即使 revCache 失效。 */
export async function bumpEventsRev(database: Firestore): Promise<void> {
  try {
    await database.collection('system_config').doc('events_meta').set(
      { rev: FieldValue.increment(1), updatedAt: FieldValue.serverTimestamp() },
      { merge: true }
    );
  } catch (e) {
    console.error('bumpEventsRev failed:', e);
  } finally {
    revCache = null;
  }
}
