import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import { google } from "googleapis";
import dotenv from "dotenv";
import axios from "axios";
import { v4 as uuidv4 } from 'uuid';

dotenv.config();

let db_local: any = null;

// Google Sheets setup (Direct API)
const hasSheetsCredentials = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL && process.env.GOOGLE_PRIVATE_KEY;
let sheets: any = null;
if (hasSheetsCredentials) {
  const auth = new google.auth.JWT({
    email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
    key: process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, "\n"),
    scopes: ["https://www.googleapis.com/auth/spreadsheets"],
  });
  sheets = google.sheets({ version: "v4", auth });
}
const SPREADSHEET_ID = process.env.GOOGLE_SHEET_ID;
let MAIN_SHEET_NAME = "Sheet1"; // Default, will be updated in initializeSheet
let RANGE = `${MAIN_SHEET_NAME}!A:G`; 
const LEAVES_SHEET_NAME = "假表紀錄";
let LEAVES_RANGE = `${LEAVES_SHEET_NAME}!A:G`;

// Google Apps Script URL (Alternative)
const APPS_SCRIPT_URL = process.env.GOOGLE_APPS_SCRIPT_URL || "https://script.google.com/macros/s/AKfycbz2nCVfE4Vkrci6UZAPVbHPwgirim60bbRFbokPBVg-UYvUwavew720sq5PJ40dyQvwEg/exec";

async function initializeSheet() {
  if (!SPREADSHEET_ID || !sheets) return;
  try {
    const spreadsheet = await sheets.spreadsheets.get({ spreadsheetId: SPREADSHEET_ID });
    const sheetsList = spreadsheet.data.sheets || [];
    const sheetNames = sheetsList.map(s => s.properties?.title) || [];

    // Detect Main Sheet (use the first one if Sheet1 doesn't exist)
    if (sheetNames.length > 0) {
      if (sheetNames.includes("Sheet1")) {
        MAIN_SHEET_NAME = "Sheet1";
      } else if (sheetNames.includes("工作表1")) {
        MAIN_SHEET_NAME = "工作表1";
      } else {
        MAIN_SHEET_NAME = sheetNames[0] || "Sheet1";
      }
      RANGE = `${MAIN_SHEET_NAME}!A:G`;
      console.log(`📌 使用主分頁: ${MAIN_SHEET_NAME}`);
    }

    // Initialize Main Sheet Headers
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range: `${MAIN_SHEET_NAME}!A1:G1`,
    });
    const rows = response.data.values;
    if (!rows || rows.length === 0 || rows[0].length === 0) {
      await sheets.spreadsheets.values.update({
        spreadsheetId: SPREADSHEET_ID,
        range: `${MAIN_SHEET_NAME}!A1:G1`,
        valueInputOption: "RAW",
        requestBody: {
          values: [["title", "description", "start_date", "end_date", "time", "member_name", "color"]],
        },
      });
      console.log(`✅ 主試算表 (${MAIN_SHEET_NAME}) 欄位已自動建立`);
    }

    // Initialize Leaves Sheet
    if (!sheetNames.includes(LEAVES_SHEET_NAME)) {
      await sheets.spreadsheets.batchUpdate({
        spreadsheetId: SPREADSHEET_ID,
        requestBody: {
          requests: [{ addSheet: { properties: { title: LEAVES_SHEET_NAME } } }]
        }
      });
      await sheets.spreadsheets.values.update({
        spreadsheetId: SPREADSHEET_ID,
        range: `${LEAVES_SHEET_NAME}!A1:G1`,
        valueInputOption: "RAW",
        requestBody: {
          values: [["title", "description", "start_date", "end_date", "time", "member_name", "color"]],
        },
      });
      console.log("✅ 假表紀錄分頁已自動建立");
    }
  } catch (error: any) {
    console.error("❌ 試算表初始化失敗:", error.message);
  }
}

async function startServer() {
  const app = express();
  const PORT = 3000;

  // Initialize SQLite (Optional)
  try {
    const Database = (await import("better-sqlite3")).default;
    db_local = new Database("family_sync.db");
    db_local.exec(`
      CREATE TABLE IF NOT EXISTS events (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        title TEXT NOT NULL,
        description TEXT,
        start_date TEXT NOT NULL,
        end_date TEXT NOT NULL,
        member_name TEXT NOT NULL,
        color TEXT NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Migration: Add 'time' column if it doesn't exist
    try {
      db_local.exec("ALTER TABLE events ADD COLUMN time TEXT");
      console.log("✅ SQLite 'time' 欄位已成功新增");
    } catch (error: any) {
      if (!error.message.includes("duplicate column name")) {
        console.error("❌ SQLite 遷移失敗 (time):", error.message);
      }
    }

    // Migration: Add 'uuid' column if it doesn't exist
    try {
      db_local.exec("ALTER TABLE events ADD COLUMN uuid TEXT");
      console.log("✅ SQLite 'uuid' 欄位已成功新增");
    } catch (error: any) {
      if (!error.message.includes("duplicate column name")) {
        console.error("❌ SQLite 遷移失敗 (uuid):", error.message);
      }
    }

    // Migration: Add 'companions' column if it doesn't exist
    try {
      db_local.exec("ALTER TABLE events ADD COLUMN companions TEXT");
      console.log("✅ SQLite 'companions' 欄位已成功新增");
    } catch (error: any) {
      if (!error.message.includes("duplicate column name")) {
        console.error("❌ SQLite 遷移失敗 (companions):", error.message);
      }
    }
  } catch (e) {
    console.warn("⚠️ SQLite (better-sqlite3) 不可用，將僅使用 Google Sheets。");
  }

  app.use(express.json());

  // Initialize sheet on start
  await initializeSheet();

  // API Routes
  app.get("/api/debug", (req, res) => {
    res.json({
      env: {
        NODE_ENV: process.env.NODE_ENV,
        VERCEL: process.env.VERCEL,
        HAS_SHEET_ID: !!process.env.GOOGLE_SHEET_ID,
        HAS_SERVICE_ACCOUNT: !!process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
        HAS_PRIVATE_KEY: !!process.env.GOOGLE_PRIVATE_KEY,
        HAS_APPS_SCRIPT: !!process.env.GOOGLE_APPS_SCRIPT_URL,
      },
      config: {
        SPREADSHEET_ID,
        APPS_SCRIPT_URL,
        RANGE,
        LEAVES_RANGE
      }
    });
  });

  app.get("/api/config-status", (req, res) => {
    res.json({
      hasSheetId: !!SPREADSHEET_ID,
      serviceAccountEmail: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL || "未設定",
      hasPrivateKey: !!process.env.GOOGLE_PRIVATE_KEY,
      hasAppsScript: !!APPS_SCRIPT_URL
    });
  });

  app.get("/api/events", async (req, res) => {
    let events: any[] = [];
    let source = "local";

    // Priority 1: Google Apps Script
    if (APPS_SCRIPT_URL) {
      try {
        const response = await axios.get(APPS_SCRIPT_URL);
        
        if (typeof response.data === 'string' && response.data.includes('<!DOCTYPE html>')) {
          throw new Error("Apps Script 發生錯誤，請檢查 Apps Script 內的試算表 ID 是否正確設定。");
        }
        
        if (Array.isArray(response.data)) {
          return res.json({ events: response.data, source: "google_apps_script" });
        }
      } catch (error: any) {
        console.error("Apps Script Fetch Error:", error.message);
        var appsScriptWarning = error.message;
      }
    }

    // Priority 2: Direct Google Sheets API
    if (SPREADSHEET_ID && sheets) {
      try {
        // Fetch Main Sheet
        const mainResponse = await sheets.spreadsheets.values.get({
          spreadsheetId: SPREADSHEET_ID,
          range: RANGE,
        });
        
        // Fetch Leaves Sheet (Optional)
        let leavesRows: any[][] = [];
        try {
          const leavesResponse = await sheets.spreadsheets.values.get({
            spreadsheetId: SPREADSHEET_ID,
            range: LEAVES_RANGE,
          });
          leavesRows = leavesResponse.data.values || [];
        } catch (e: any) {
          console.warn("Leaves sheet not found or inaccessible, skipping:", e.message);
        }

        const mainRows = mainResponse.data.values || [];

        const processRows = (rows: any[][], sheetName: string) => {
          if (!rows || rows.length <= 1) return [];
          const rawHeaders = rows[0];
          // Normalize headers: lowercase, trim, and remove underscores/spaces for matching
          const headers = rawHeaders.map(h => String(h).toLowerCase().trim().replace(/[_\s]/g, ''));
          
          return rows.slice(1).map((row, index) => {
            const event: any = { 
              id: `${sheetName}-${index + 1}`,
              _sheet: sheetName,
              _index: index + 1 
            };
            
            rawHeaders.forEach((rawHeader, i) => {
              const normalized = String(rawHeader).toLowerCase().trim().replace(/[_\s]/g, '');
              const value = row[i] || "";
              
              // Map normalized headers to our expected keys
              if (normalized === 'id') event.id = value;
              else if (normalized === 'title') event.title = value;
              else if (normalized === 'description') event.description = value;
              else if (normalized === 'startdate') event.start_date = value;
              else if (normalized === 'enddate') event.end_date = value;
              else if (normalized === 'time') event.time = value;
              else if (normalized === 'membername') event.member_name = value;
              else if (normalized === 'color') event.color = value;
              // Also keep original for compatibility
              event[rawHeader] = value;
            });
            
            // Fallback if no ID column exists
            if (!event.id || event.id === `${sheetName}-${index + 1}`) {
              event.id = `${sheetName}-${index + 1}`;
            }
            
            // Defaults and Fallbacks
            if (!event.title) event.title = "無標題";
            if (!event.start_date) event.start_date = new Date().toISOString().split('T')[0];
            if (!event.end_date) event.end_date = event.start_date;
            if (!event.member_name) event.member_name = "全家";
            if (!event.color) event.color = "#4F46E5";
            
            return event;
          });
        };

        const mainEvents = processRows(mainRows, MAIN_SHEET_NAME);
        const leaveEvents = processRows(leavesRows, LEAVES_SHEET_NAME);
        
        events = [...mainEvents, ...leaveEvents];
        return res.json({ events, source: "google_sheets_api" });
      } catch (error: any) {
        console.error("Google Sheets API Fetch Error:", error.message);
        // Try fallback on error
        try {
          if (db_local) {
            const fallbackRows = db_local.prepare("SELECT * FROM events ORDER BY start_date DESC").all();
            return res.json({ 
              events: fallbackRows, 
              source: "local_fallback", 
              warning: `Google Sheets 同步失敗: ${error.message}` 
            });
          } else {
            throw new Error(`Google Sheets 同步失敗: ${error.message}，且本地資料庫不可用。`);
          }
        } catch (e: any) {
          return res.status(500).json({ error: e.message || "Failed to fetch events" });
        }
      }
    }

    // Fallback: SQLite (if SPREADSHEET_ID is not set)
    try {
      if (db_local) {
        const rows = db_local.prepare("SELECT * FROM events ORDER BY start_date DESC").all();
        
        let warningMsg = undefined;
        if (typeof appsScriptWarning !== 'undefined') warningMsg = appsScriptWarning;
        
        res.json({ events: rows, source: "local", warning: warningMsg });
      } else {
        res.status(500).json({ 
          error: "無法取得活動資料。請確認環境變數 (GOOGLE_SHEET_ID 或 GOOGLE_APPS_SCRIPT_URL) 已正確設定。",
          warning: appsScriptWarning
        });
      }
    } catch (error: any) {
      res.status(500).json({ error: "Failed to fetch events from local database" });
    }
  });

  app.post("/api/events", async (req, res) => {
    const eventData = req.body;
    const { title, description, start_date, end_date, time, member_name, color, companions } = eventData;
    const eventId = uuidv4(); // Generate a unique ID

    const leaveKeywords = ['請假', '排休', '特休', '補休', '公休', '休假'];
    const isLeave = leaveKeywords.some(kw => title.includes(kw));

    // Priority 1: Google Apps Script
    if (APPS_SCRIPT_URL) {
      try {
        console.log("Sending event to Apps Script, payload:", {
          ...eventData,
          action: eventData.action || 'create',
          id: eventId,
          isLeave: isLeave,
          targetSheet: isLeave ? LEAVES_SHEET_NAME : MAIN_SHEET_NAME
        });

        const response = await axios.post(APPS_SCRIPT_URL, {
          ...eventData,
          action: eventData.action || 'create',
          id: eventId, // Pass the generated ID
          isLeave: isLeave,
          targetSheet: isLeave ? LEAVES_SHEET_NAME : MAIN_SHEET_NAME
        });
        
        // Check if response is actually JSON and not an HTML error page
        if (typeof response.data === 'string' && response.data.includes('<!DOCTYPE html>')) {
          throw new Error("Apps Script 發生錯誤，請檢查 Apps Script 內的試算表 ID 是否正確設定。");
        }
        
        if (response.data && response.data.error) {
          throw new Error(response.data.error);
        }
        
        let finalId = response.data?.id || eventId;
        
        // If Apps Script didn't return an ID, try to fetch it to get the SheetName-RowIndex ID
        if (!response.data?.id) {
          try {
            const getResponse = await axios.get(APPS_SCRIPT_URL);
            if (Array.isArray(getResponse.data)) {
              // Find the event we just created (search from the end since it was appended)
              const newEvent = [...getResponse.data].reverse().find((e: any) => 
                e.title === title && 
                e.start_date === start_date && 
                e.member_name === member_name
              );
              if (newEvent && newEvent.id) {
                finalId = newEvent.id;
              }
            }
          } catch (e) {
            console.error("Failed to fetch new ID from Apps Script:", e);
          }
        }
        
        // Update local SQLite as well to keep it in sync
        try {
          if (db_local) {
            const stmt = db_local.prepare(`
              INSERT INTO events (uuid, title, description, start_date, end_date, time, member_name, color, companions)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            `);
            stmt.run(finalId, title, description || "", start_date, end_date, time || "", member_name, color, companions || "");
          }
        } catch (e) {
          console.error("SQLite Insert Error (Sync):", e);
        }
        
        return res.json({ success: true, source: "google_apps_script", target: isLeave ? "leaves" : "main", id: finalId });
      } catch (error: any) {
        console.error("Apps Script Save Error:", error.message);
        return res.status(500).json({ error: error.message || "Failed to save event via Apps Script" });
      }
    }

    // Priority 2: Direct Google Sheets API
    if (SPREADSHEET_ID && sheets) {
      try {
        // Route to correct sheet
        const targetSheet = isLeave ? LEAVES_SHEET_NAME : MAIN_SHEET_NAME;
        const targetRange = isLeave ? LEAVES_RANGE : RANGE;
        
        // Fetch headers to ensure correct column mapping
        const headerResponse = await sheets.spreadsheets.values.get({
          spreadsheetId: SPREADSHEET_ID,
          range: `${targetSheet}!A1:Z1`,
        });
        
        const rawHeaders = headerResponse.data.values?.[0] || [];
        const normalizedHeaders = rawHeaders.map(h => String(h).toLowerCase().trim().replace(/[_\s]/g, ''));
        
        // Prepare row based on headers
        const newRow = normalizedHeaders.map(header => {
          if (header === 'id') return eventId;
          if (header === 'title') return title;
          if (header === 'description') return description || "";
          if (header === 'startdate') return start_date;
          if (header === 'enddate') return end_date;
          if (header === 'time') return time || "";
          if (header === 'membername') return member_name;
          if (header === 'color') return color;
          return "";
        });

        // If no headers found or mapping failed, use default order
        const finalRow = newRow.length > 0 ? newRow : [eventId, title, description, start_date, end_date, time || "", member_name, color];
        
        await sheets.spreadsheets.values.append({
          spreadsheetId: SPREADSHEET_ID,
          range: `${targetSheet}!A:A`, // Append to the sheet
          valueInputOption: "RAW",
          requestBody: {
            values: [finalRow],
          },
        });

        return res.json({ success: true, source: "google_sheets_api", target: isLeave ? "leaves" : "main", id: eventId });
      } catch (error: any) {
        console.error("Google Sheets API Save Error:", error.message);
        var sheetsWarning = error.message;
      }
    }

    // Fallback: SQLite
    try {
      if (db_local) {
        const stmt = db_local.prepare(`
          INSERT INTO events (uuid, title, description, start_date, end_date, time, member_name, color)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `);
        stmt.run(eventId, title, description || "", start_date, end_date, time || "", member_name, color);
        
        let warningMsg = undefined;
        if (typeof sheetsWarning !== 'undefined') warningMsg = sheetsWarning;
        
        return res.json({ success: true, source: "local", warning: warningMsg, id: eventId });
      } else {
        return res.status(500).json({ 
          error: "儲存失敗：Google 試算表未設定且本地資料庫不可用。",
          details: sheetsWarning 
        });
      }
    } catch (error: any) {
      console.error("SQLite Save Error:", error.message);
      return res.status(500).json({ 
        error: "儲存失敗：無法寫入本地資料庫或 Google 試算表。",
        details: error.message 
      });
    }
  });

  app.put("/api/events/:id", async (req, res) => {
    const { id } = req.params;
    const eventData = req.body;
    const { title, description, start_date, end_date, time, member_name, color, companions, original_title } = eventData;

    // Priority 1: Google Apps Script
    if (APPS_SCRIPT_URL) {
      try {
        let targetSheet = undefined;
        if (typeof id === 'string' && id.includes('-') && !id.match(/^[0-9a-f]{8}-[0-9a-f]{4}/i)) {
          const parts = id.split('-');
          const parsedRowIndex = parseInt(parts.pop() || "-1");
          if (!isNaN(parsedRowIndex) && parsedRowIndex > 0) {
            targetSheet = parts.join('-');
          }
        }
        
        if (!targetSheet) {
          const searchTitle = original_title || title;
          const leaveKeywords = ['請假', '排休', '特休', '補休', '公休', '休假'];
          const isLeave = leaveKeywords.some(kw => String(searchTitle).includes(kw));
          targetSheet = isLeave ? LEAVES_SHEET_NAME : MAIN_SHEET_NAME;
        }

        const updatePayload: any = {
          action: 'update',
          sheet: targetSheet,
          ...eventData
        };
        
        console.log("Sending update to Apps Script, payload:", updatePayload);
        
        const isUUID = typeof id === 'string' && id.match(/^[0-9a-f]{8}-[0-9a-f]{4}/i);
        
        if (id && id !== 'undefined' && !isUUID) {
          updatePayload.id = id;
        } else if (isUUID) {
          console.log(`ID is a UUID (${id}), skipping sending ID to Apps Script to prevent accidental row update.`);
          delete updatePayload.id; // Ensure it's not in ...eventData
        }

        let response = await axios.post(APPS_SCRIPT_URL, updatePayload);
        
        // Fallback 1: Try the other sheet
        if (response.data && response.data.error && response.data.error.includes('找不到 ID')) {
          const fallbackSheet = targetSheet === MAIN_SHEET_NAME ? LEAVES_SHEET_NAME : MAIN_SHEET_NAME;
          console.log(`ID not found in ${targetSheet}, retrying in ${fallbackSheet}`);
          updatePayload.sheet = fallbackSheet;
          response = await axios.post(APPS_SCRIPT_URL, updatePayload);
          
          // Fallback 2: Try with id = title (in case Apps Script assumes ID is in column A, which is actually title)
          if (response.data && response.data.error && response.data.error.includes('找不到 ID')) {
            console.log(`ID still not found, retrying with id = title in ${targetSheet}`);
            updatePayload.sheet = targetSheet;
            updatePayload.id = original_title || title;
            response = await axios.post(APPS_SCRIPT_URL, updatePayload);
            
            // Fallback 3: Try with id = title in the other sheet
            if (response.data && response.data.error && response.data.error.includes('找不到 ID')) {
              console.log(`ID still not found, retrying with id = title in ${fallbackSheet}`);
              updatePayload.sheet = fallbackSheet;
              response = await axios.post(APPS_SCRIPT_URL, updatePayload);
            }
          }
        }
        
        if (typeof response.data === 'string' && response.data.includes('<!DOCTYPE html>')) {
          throw new Error("Apps Script 發生錯誤，請檢查 Apps Script 內的試算表 ID 是否正確設定。");
        }
        
        if (response.data && response.data.error) {
          throw new Error(response.data.error);
        }
        
        // Update local SQLite as well to keep it in sync
        try {
          if (db_local) {
            const stmt = db_local.prepare(`
              UPDATE events 
              SET title = ?, description = ?, start_date = ?, end_date = ?, time = ?, member_name = ?, color = ?, companions = ?
              WHERE uuid = ? OR id = ?
            `);
            stmt.run(title, description || "", start_date, end_date, time || "", member_name, color, companions || "", id, id);
          }
        } catch (e) {
          console.error("SQLite Update Error (Sync):", e);
        }
        
        return res.json({ success: true, source: "google_apps_script" });
      } catch (error: any) {
        console.error("Apps Script Update Error:", error.message);
        return res.status(500).json({ error: error.message || "Failed to update event via Apps Script" });
      }
    }

    // Priority 2: Google Sheets API
    if (SPREADSHEET_ID && sheets) {
      try {
        let targetSheet = MAIN_SHEET_NAME;
        let rowIndex = -1;

        // Search for the row by ID
        const allSheets = [MAIN_SHEET_NAME, LEAVES_SHEET_NAME];
        console.log(`Searching for ID: ${id} in sheets: ${allSheets.join(', ')}`);
        for (const sheet of allSheets) {
          const response = await sheets.spreadsheets.values.get({
            spreadsheetId: SPREADSHEET_ID,
            range: `${sheet}!A:Z`,
          });
          const rows = response.data.values;
          if (rows && rows.length > 0) {
            const headers = rows[0].map(h => String(h).toLowerCase().trim().replace(/[_\s]/g, ''));
            let idIndex = headers.indexOf('id');
            let titleIndex = headers.indexOf('title');
            
            const possibleTitleHeaders = ['標題', '活動名稱', '名稱', 'title', 'name'];
            const possibleStartDateHeaders = ['開始日期', '日期', 'startdate', 'date'];
            const possibleMemberHeaders = ['成員', '人員', 'membername', 'member'];
            
            if (titleIndex === -1) {
              titleIndex = headers.findIndex(h => possibleTitleHeaders.some(pt => h.includes(pt)));
            }
            const startDateIndex = headers.findIndex(h => possibleStartDateHeaders.some(pt => h.includes(pt)));
            const memberIndex = headers.findIndex(h => possibleMemberHeaders.some(pt => h.includes(pt)));
            
            if (idIndex !== -1) {
              const foundIndex = rows.findIndex((row, index) => index > 0 && String(row[idIndex]) === String(id));
              if (foundIndex !== -1) {
                targetSheet = sheet;
                rowIndex = foundIndex + 1;
                console.log(`Found ID ${id} in ${sheet} at row ${rowIndex}`);
              }
            }
            
            // Fallback: search by title, start_date, and member_name if ID not found
            if (rowIndex === -1 && titleIndex !== -1) {
              const searchTitle = original_title || title;
              const foundIndex = rows.findIndex((row, index) => {
                if (index === 0) return false;
                const matchTitle = String(row[titleIndex]) === String(searchTitle);
                const matchStartDate = startDateIndex !== -1 && start_date ? row[startDateIndex] === start_date : true;
                const matchMember = memberIndex !== -1 && member_name ? row[memberIndex] === member_name : true;
                return matchTitle && matchStartDate && matchMember;
              });
              
              if (foundIndex !== -1) {
                targetSheet = sheet;
                rowIndex = foundIndex + 1;
                console.log(`Found row by fallback in ${sheet} at row ${rowIndex}`);
              }
            }
          }
          if (rowIndex !== -1) break;
        }

        // Fallback to parsing ID if it's a row-based ID
        if (rowIndex === -1 && typeof id === 'string' && id.includes('-')) {
          const parts = id.split('-');
          rowIndex = parseInt(parts.pop() || "-1");
          targetSheet = parts.join('-');
        }

        if (rowIndex !== -1) {
          // Fetch headers to ensure correct column mapping
          const headerResponse = await sheets.spreadsheets.values.get({
            spreadsheetId: SPREADSHEET_ID,
            range: `${targetSheet}!A1:Z1`,
          });
          
          const rawHeaders = headerResponse.data.values?.[0] || [];
          const normalizedHeaders = rawHeaders.map(h => String(h).toLowerCase().trim().replace(/[_\s]/g, ''));
          
          // Prepare row based on headers
          const updatedRow = normalizedHeaders.map(header => {
            if (header === 'id') return id;
            if (header === 'title') return title;
            if (header === 'description') return description || "";
            if (header === 'startdate') return start_date;
            if (header === 'enddate') return end_date;
            if (header === 'time') return time || "";
            if (header === 'membername') return member_name;
            if (header === 'color') return color;
            return "";
          });

          // If mapping failed, use default order
          const finalRow = updatedRow.length > 0 ? updatedRow : [id, title, description, start_date, end_date, time || "", member_name, color];

          await sheets.spreadsheets.values.update({
            spreadsheetId: SPREADSHEET_ID,
            range: `${targetSheet}!A${rowIndex}:Z${rowIndex}`,
            valueInputOption: "RAW",
            requestBody: {
              values: [finalRow],
            },
          });
          return res.json({ success: true, source: "google_sheets_api", sheet: targetSheet });
        }
      } catch (error: any) {
        console.error("Google Sheets API Update Error:", error.message);
      }
    }

    // Fallback: SQLite
    try {
      if (db_local) {
        const stmt = db_local.prepare(`
          UPDATE events 
          SET title = ?, description = ?, start_date = ?, end_date = ?, time = ?, member_name = ?, color = ?
          WHERE uuid = ? OR id = ?
        `);
        const result = stmt.run(title, description || "", start_date, end_date, time || "", member_name, color, id, id);
        if (result.changes > 0) {
          res.json({ success: true, source: "local" });
        } else {
          res.status(404).json({ error: "Event not found" });
        }
      } else {
        res.status(500).json({ error: "更新失敗：Google 試算表未設定且本地資料庫不可用。" });
      }
    } catch (error: any) {
      console.error("SQLite Update Error:", error.message);
      res.status(500).json({ error: "Failed to update event locally" });
    }
  });

  app.delete("/api/events/:id", async (req, res) => {
    const { id } = req.params;
    const { title } = req.query;
    console.log(`[DELETE] Request received for id: ${id}, title: ${title}`);
    const results: any = { sqlite: null, gas: null, sheets: null };
    let eventDetails: any = null;

    // 1. Try to find event details first
    // Try SQLite
    try {
      if (db_local) {
        const stmt = db_local.prepare("SELECT * FROM events WHERE uuid = ? OR id = ?");
        eventDetails = stmt.get(id, id);
        if (eventDetails) {
          results.sqlite_found = true;
        }
      }
    } catch (error: any) {
      console.error("SQLite Fetch Error:", error.message);
    }

    // Try Google Sheets if not found in SQLite
    if (!eventDetails && SPREADSHEET_ID && sheets) {
      try {
        let targetSheet = MAIN_SHEET_NAME;
        let rowIndex = -1;

        // Search for the row by ID
        const allSheets = [MAIN_SHEET_NAME, LEAVES_SHEET_NAME];
        for (const sheet of allSheets) {
          const response = await sheets.spreadsheets.values.get({
            spreadsheetId: SPREADSHEET_ID,
            range: `${sheet}!A:Z`,
          });
          const rows = response.data.values;
          if (rows && rows.length > 0) {
            const headers = rows[0].map(h => String(h).toLowerCase().trim().replace(/[_\s]/g, ''));
            const idIndex = headers.indexOf('id');
            
            for (let i = 1; i < rows.length; i++) {
              if (idIndex !== -1 && rows[i][idIndex] === id) {
                targetSheet = sheet;
                rowIndex = i + 1;
                break;
              }
            }
          }
          if (rowIndex !== -1) break;
        }

        // Fallback to parsing ID if it's a row-based ID
        if (rowIndex === -1 && typeof id === 'string' && id.includes('-')) {
          const parts = id.split('-');
          rowIndex = parseInt(parts.pop() || "-1");
          targetSheet = parts.join('-');
        }

        if (rowIndex !== -1) {
          const response = await sheets.spreadsheets.values.get({
            spreadsheetId: SPREADSHEET_ID,
            range: `${targetSheet}!A${rowIndex}:Z${rowIndex}`,
          });
          const row = response.data.values?.[0] || [];
          
          // Fetch headers to map row data
          const headerResponse = await sheets.spreadsheets.values.get({
            spreadsheetId: SPREADSHEET_ID,
            range: `${targetSheet}!A1:Z1`,
          });
          const rawHeaders = headerResponse.data.values?.[0] || [];
          const normalizedHeaders = rawHeaders.map(h => String(h).toLowerCase().trim().replace(/[_\s]/g, ''));
          
          const eventData: any = {};
          normalizedHeaders.forEach((header, index) => {
            eventData[header] = row[index];
          });

          if (row.length > 0) {
            eventDetails = {
              _sheet: targetSheet,
              _index: rowIndex,
              title: eventData.title,
              start_date: eventData.startdate,
              member_name: eventData.membername,
              time: eventData.time
            };
            results.sheets_found = true;
          }
        }
      } catch (error: any) {
        console.error("Google Sheets API Fetch Error:", error.message);
      }
    }

    // 2. Attempt deletion
    if (!eventDetails && !APPS_SCRIPT_URL && !SPREADSHEET_ID) {
      return res.status(404).json({ error: `刪除失敗: 找不到活動 (ID: ${id})` });
    }

    // SQLite Deletion
    try {
      if (db_local) {
        const stmt = db_local.prepare("DELETE FROM events WHERE uuid = ? OR id = ?");
        const result = stmt.run(id, id);
        results.sqlite = { success: result.changes > 0 };
      } else {
        results.sqlite = { success: false, error: "SQLite is not available" };
      }
    } catch (error: any) {
      results.sqlite = { success: false, error: error.message };
    }

    // Google Apps Script Deletion
    if (APPS_SCRIPT_URL) {
      try {
        let targetSheet = eventDetails?._sheet;
        const eventTitle = eventDetails?.title || title;
        if (!targetSheet && eventTitle) {
          const leaveKeywords = ['請假', '排休', '特休', '補休', '公休', '休假'];
          const isLeave = leaveKeywords.some(kw => String(eventTitle).includes(kw));
          targetSheet = isLeave ? LEAVES_SHEET_NAME : MAIN_SHEET_NAME;
        }
        
        // Always override targetSheet if ID explicitly contains it (e.g., Sheet1-3)
        if (typeof id === 'string' && id.includes('-') && !id.match(/^[0-9a-f]{8}-[0-9a-f]{4}/i)) {
          const parts = id.split('-');
          const parsedRowIndex = parseInt(parts.pop() || "-1");
          if (!isNaN(parsedRowIndex) && parsedRowIndex > 0) {
            targetSheet = parts.join('-');
          }
        }

        // If we still don't have a target sheet, default to MAIN_SHEET_NAME
        if (!targetSheet) {
           targetSheet = MAIN_SHEET_NAME;
        }

        const deletePayload: any = {
          action: 'delete',
          title: eventTitle,
          start_date: eventDetails?.start_date,
          member_name: eventDetails?.member_name,
          time: eventDetails?.time,
          sheet: targetSheet
        };
        
        const isUUID = typeof id === 'string' && id.match(/^[0-9a-f]{8}-[0-9a-f]{4}/i);
        
        if (id && id !== 'undefined' && !isUUID) {
          deletePayload.id = id;
        } else if (isUUID) {
          console.log(`ID is a UUID (${id}), skipping sending ID to Apps Script to prevent accidental row deletion.`);
        }

        console.log("Sending delete request to Apps Script:", deletePayload);

        let response = await axios.post(APPS_SCRIPT_URL, deletePayload);
        
        // Fallback 1: Try the other sheet
        if (response.data && response.data.error && response.data.error.includes('找不到 ID')) {
          const fallbackSheet = targetSheet === MAIN_SHEET_NAME ? LEAVES_SHEET_NAME : MAIN_SHEET_NAME;
          console.log(`ID not found in ${targetSheet}, retrying delete in ${fallbackSheet}`);
          deletePayload.sheet = fallbackSheet;
          response = await axios.post(APPS_SCRIPT_URL, deletePayload);
          
          // Fallback 2: Try with id = title (in case Apps Script assumes ID is in column A, which is actually title)
          if (response.data && response.data.error && response.data.error.includes('找不到 ID')) {
            console.log(`ID still not found, retrying with id = title in ${targetSheet}`);
            deletePayload.sheet = targetSheet;
            deletePayload.id = eventTitle;
            response = await axios.post(APPS_SCRIPT_URL, deletePayload);
            
            // Fallback 3: Try with id = title in the other sheet
            if (response.data && response.data.error && response.data.error.includes('找不到 ID')) {
              console.log(`ID still not found, retrying with id = title in ${fallbackSheet}`);
              deletePayload.sheet = fallbackSheet;
              response = await axios.post(APPS_SCRIPT_URL, deletePayload);
            }
          }
        }
        
        if (typeof response.data === 'string' && response.data.includes('<!DOCTYPE html>')) {
          throw new Error("Apps Script 發生錯誤，請檢查 Apps Script 內的試算表 ID 是否正確設定。");
        }
        
        if (response.data && response.data.error) {
          throw new Error(response.data.error);
        }
        
        results.gas = { success: true };
      } catch (error: any) {
        console.error("Apps Script Delete Error:", error.message);
        results.gas = { success: false, error: error.message };
        // Do not return 500 here, allow fallback to Google Sheets API
      }
    }

    // Google Sheets API Deletion
    if (SPREADSHEET_ID) {
      try {
        let targetSheet = eventDetails?._sheet;
        let targetRowIndex = eventDetails?._index !== undefined ? eventDetails._index : -1;
        const eventTitle = eventDetails?.title || title;

        // Always try to parse sheet and row index from ID if it's in the format SheetName-RowIndex
        if (typeof id === 'string' && id.includes('-') && !id.match(/^[0-9a-f]{8}-[0-9a-f]{4}/i)) {
          const parts = id.split('-');
          const parsedRowIndex = parseInt(parts.pop() || "-1");
          if (!isNaN(parsedRowIndex) && parsedRowIndex > 0) {
            targetRowIndex = parsedRowIndex;
            if (!targetSheet) {
              targetSheet = parts.join('-');
            }
          }
        }

        if (targetRowIndex === -1) {
          // Search for the row by ID
          const allSheets = targetSheet ? [targetSheet] : [MAIN_SHEET_NAME, LEAVES_SHEET_NAME];
          for (const sheet of allSheets) {
            const response = await sheets.spreadsheets.values.get({
              spreadsheetId: SPREADSHEET_ID,
              range: `${sheet}!A:Z`,
            });
            const rows = response.data.values;
            if (rows && rows.length > 0) {
              const headers = rows[0].map(h => String(h).toLowerCase().trim().replace(/[_\s]/g, ''));
              let idIndex = headers.indexOf('id');
              let titleIndex = headers.indexOf('title');
              
              const possibleTitleHeaders = ['標題', '活動名稱', '名稱', 'title', 'name'];
              const possibleStartDateHeaders = ['開始日期', '日期', 'startdate', 'date'];
              const possibleMemberHeaders = ['成員', '人員', 'membername', 'member'];
              
              if (titleIndex === -1) {
                titleIndex = headers.findIndex(h => possibleTitleHeaders.some(pt => h.includes(pt)));
              }
              const startDateIndex = headers.findIndex(h => possibleStartDateHeaders.some(pt => h.includes(pt)));
              const memberIndex = headers.findIndex(h => possibleMemberHeaders.some(pt => h.includes(pt)));
              
              if (idIndex !== -1) {
                const rowIndex = rows.findIndex((row, index) => index > 0 && row[idIndex] === id);
                if (rowIndex !== -1) {
                  targetSheet = sheet;
                  targetRowIndex = rowIndex + 1; // 1-based index for API
                  break;
                }
              }
              
              // Fallback: search by title, start_date, and member_name if ID not found
              if (targetRowIndex === -1 && titleIndex !== -1 && eventTitle) {
                const rowIndex = rows.findIndex((row, index) => {
                  if (index === 0) return false;
                  const matchTitle = row[titleIndex] === eventTitle;
                  const matchStartDate = startDateIndex !== -1 && eventDetails?.start_date ? row[startDateIndex] === eventDetails.start_date : true;
                  const matchMember = memberIndex !== -1 && eventDetails?.member_name ? row[memberIndex] === eventDetails.member_name : true;
                  return matchTitle && matchStartDate && matchMember;
                });
                
                if (rowIndex !== -1) {
                  targetSheet = sheet;
                  targetRowIndex = rowIndex + 1;
                  break;
                }
              }
            }
          }
        }

        if (targetSheet && typeof targetRowIndex === 'number' && targetRowIndex > 0) {
          const spreadsheet = await sheets.spreadsheets.get({ spreadsheetId: SPREADSHEET_ID });
          const sheet = spreadsheet.data.sheets?.find(s => s.properties?.title === targetSheet);
          const sheetId = sheet?.properties?.sheetId;

          await sheets.spreadsheets.batchUpdate({
            spreadsheetId: SPREADSHEET_ID,
            requestBody: {
              requests: [{
                deleteDimension: {
                  range: {
                    sheetId: sheetId,
                    dimension: "ROWS",
                    startIndex: targetRowIndex - 1,
                    endIndex: targetRowIndex,
                  }
                }
              }]
            }
          });
          results.sheets = { success: true, sheet: targetSheet, rowIndex: targetRowIndex };
        } else {
          results.sheets = { success: false, error: "無法確定要刪除的試算表或行號" };
        }
      } catch (error: any) {
        results.sheets = { success: false, error: error.message };
      }
    }

    // Check if both failed
    if (APPS_SCRIPT_URL && results.gas?.success === false && SPREADSHEET_ID && results.sheets?.success === false) {
      return res.status(500).json({ error: `刪除失敗: Apps Script (${results.gas.error}), Sheets API (${results.sheets.error})` });
    } else if (APPS_SCRIPT_URL && results.gas?.success === false && !SPREADSHEET_ID) {
      return res.status(500).json({ error: `Apps Script 刪除失敗: ${results.gas.error}` });
    } else if (SPREADSHEET_ID && results.sheets?.success === false && !APPS_SCRIPT_URL) {
      return res.status(500).json({ error: `Google Sheets API 刪除失敗: ${results.sheets.error}` });
    }

    res.json({ success: true, results });
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  if (process.env.NODE_ENV !== "production" || !process.env.VERCEL) {
    app.listen(PORT, "0.0.0.0", () => {
      console.log(`Server running on http://localhost:${PORT}`);
    });
  }
  
  return app;
}

export const appPromise = startServer();
