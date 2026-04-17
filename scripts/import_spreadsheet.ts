import { initializeApp } from 'firebase/app';
import { getFirestore, collection, addDoc } from 'firebase/firestore';
import { google } from 'googleapis';
import firebaseConfig from '../firebase-applet-config.json';

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);

// Google Sheets configuration (using environment variables)
// These should be configured in the environment settings
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
  try {
    console.log('Fetching data from Google Sheets...');
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range: 'Sheet1!A:J', // Adjust range as needed
    });

    const rows = response.data.values;
    if (!rows || rows.length === 0) {
      console.log('No data found.');
      return;
    }

    // Assuming first row is header
    const headers = rows[0];
    const dataRows = rows.slice(1);

    console.log(`Found ${dataRows.length} rows to import.`);

    for (const row of dataRows) {
      // Map row to Event structure
      // Adjust indices based on your actual sheet structure
      const event = {
        title: row[0] || '無標題',
        description: row[1] || '',
        start_date: row[2] || '',
        end_date: row[3] || '',
        time: row[4] || '',
        member_name: row[5] || '全家',
        color: row[6] || '#4F46E5',
        companions: row[7] || '',
        is_important: row[8] === 'true' || false,
      };

      await addDoc(collection(db, 'events'), event);
      console.log(`Imported: ${event.title}`);
    }

    console.log('Import completed successfully.');
  } catch (error) {
    console.error('Import failed:', error);
  }
}

importData();
