// 使用 firebase-admin（服務帳戶）寫入 Firestore，與後端 server.ts 一致。
import 'dotenv/config';
import { google } from 'googleapis';
import { FieldValue } from 'firebase-admin/firestore';
import { v4 as uuidv4 } from 'uuid';
import { getDb, bumpEventsRev } from '../lib/firebaseAdmin.js';
import { normalizeEventDate } from '../lib/taipeiTime.js';
import { FAMILY_MEMBERS, MEMBER_COLORS } from '../shared/constants.js';

const auth = new google.auth.GoogleAuth({
  credentials: {
    client_email: process.env.GOOGLE_SERVICE_ACCOUNT,
    private_key: process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
  },
  scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'],
});

const sheets = google.sheets({ version: 'v4', auth });
const SPREADSHEET_ID = '1CweJO5GUFtAP9jv5su5RVzMR2cMqHjxrnaugXhdjViM';

async function importData() {
  const db = getDb();
  if (!db) {
    throw new Error('缺少 FIREBASE_SERVICE_ACCOUNT_KEY 環境變數（請在 .env 設定服務帳戶 JSON）。');
  }

  console.log('Fetching data from Google Sheets...');
  const response = await sheets.spreadsheets.values.get({
    spreadsheetId: SPREADSHEET_ID,
    range: 'Sheet1!A:J',
  });

  const rows = response.data.values;
  if (!rows || rows.length <= 1) {
    console.log('No data found.');
    return;
  }

  const dataRows = rows.slice(1);
  console.log(`Found ${dataRows.length} rows to import.`);

  for (const row of dataRows) {
    const id = uuidv4();
    const rawMember = row[5] || '全家';
    const member_name = (FAMILY_MEMBERS as readonly string[]).includes(rawMember) ? rawMember : '全家';
    const start_date = String(normalizeEventDate(row[2] || '') || '');
    const end_date = String(normalizeEventDate(row[3] || row[2] || '') || start_date);

    const event = {
      id,
      title: row[0] || '無標題',
      description: row[1] || '',
      start_date,
      end_date,
      time: row[4] || '',
      member_name,
      color: row[6] || MEMBER_COLORS[member_name] || '#4F46E5',
      companions: row[7] || '',
      is_important: row[8] === 'true',
      createdAt: FieldValue.serverTimestamp(),
    };

    await db.collection('events').doc(id).set(event);
    console.log(`Imported: ${event.title}`);
  }

  await bumpEventsRev(db);
  console.log('Import completed successfully.');
}

importData().catch((error) => {
  console.error('Import failed:', error);
  process.exit(1);
});
