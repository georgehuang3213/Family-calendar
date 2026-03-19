import express from "express";
import path from "path";
import { google } from "googleapis";
import dotenv from "dotenv";
import axios from "axios";
import { v4 as uuidv4 } from 'uuid';

dotenv.config();

let db_local: any = null;

// Google Sheets setup (Lazy Initialization)
let sheetsInstance: any = null;
const SPREADSHEET_ID = process.env.GOOGLE_SHEET_ID;
let MAIN_SHEET_NAME = "Sheet1";
let RANGE = `${MAIN_SHEET_NAME}!A:G`;
const LEAVES_SHEET_NAME = "假表紀錄";
let LEAVES_RANGE = `${LEAVES_SHEET_NAME}!A:G`;

async function getSheets() {
  if (sheetsInstance) return sheetsInstance;
  
  const email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
  let key = process.env.GOOGLE_PRIVATE_KEY;
  
  // 如果缺少任何一個，就回傳 null 而不是拋出錯誤
  if (!email || !key || !SPREADSHEET_ID || email === "undefined" || key === "undefined" || key === "null" || SPREADSHEET_ID === "undefined") {
    return null;
  }
  
  try {
    if (key.includes('\\n')) {
      key = key.replace(/\\n/g, '\n');
    }
    
    const auth = new google.auth.JWT({
      email,
      key,
      scopes: ["https://www.googleapis.com/auth/spreadsheets"],
    });
    
    sheetsInstance = google.sheets({ version: "v4", auth });
    return sheetsInstance;
  } catch (err: any) {
    console.error("Google Auth Error:", err.message);
    return null;
  }
}

let sheetInitStatus = { success: false, error: null as string | null, initialized: false };

async function initializeSheet() {
  if (sheetInitStatus.initialized) return;
  
  const email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
  const key = process.env.GOOGLE_PRIVATE_KEY;
  
  // 如果沒有設定憑證，直接標記為初始化完成但失敗，不執行後續邏輯
  if (!email || !key || !SPREADSHEET_ID || email === "undefined" || key === "undefined" || key === "null" || SPREADSHEET_ID === "undefined") {
    console.log("ℹ️ 未偵測到 Google Sheets 憑證，將跳過直接連線模式。");
    sheetInitStatus = { success: false, error: "缺少憑證", initialized: true };
    return;
  }
  
  try {
    const sheets = await getSheets();
    if (!sheets) {
      sheetInitStatus = { success: false, error: "無法建立 Sheets 實例", initialized: true };
      return;
    }
    
    const spreadsheet = await sheets.spreadsheets.get({ spreadsheetId: SPREADSHEET_ID });
    const sheetsList = spreadsheet.data.sheets || [];
    const sheetNames = sheetsList.map((s: any) => s.properties?.title) || [];

    if (sheetNames.length > 0) {
      if (sheetNames.includes("Sheet1")) {
        MAIN_SHEET_NAME = "Sheet1";
      } else if (sheetNames.includes("工作表1")) {
        MAIN_SHEET_NAME = "工作表1";
      } else {
        MAIN_SHEET_NAME = sheetNames[0] || "Sheet1";
      }
      RANGE = `${MAIN_SHEET_NAME}!A:G`;
    }

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
    }
    
    sheetInitStatus = { success: true, error: null, initialized: true };
  } catch (error: any) {
    console.error("❌ 試算表初始化失敗:", error.message);
    sheetInitStatus = { success: false, error: error.message, initialized: true };
  }
}

async function startServer() {
  const app = express();
  const PORT = 3000;

  // Initialize SQLite (Optional)
  if (!process.env.VERCEL) {
    try {
      const sqliteModuleName = "better-sqlite3";
      const Database = (await import(/* @vite-ignore */ sqliteModuleName)).default;
      const dbPath = "family_sync.db";
      db_local = new Database(dbPath);
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
  } else {
    console.log("ℹ️ Vercel 環境：略過 SQLite 初始化以避免 native 模組錯誤。");
  }

  app.use(express.json());

  // API Routes
  app.get("/api/debug", (req, res) => {
    const APPS_SCRIPT_URL = process.env.GOOGLE_APPS_SCRIPT_URL;
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
    const APPS_SCRIPT_URL = process.env.GOOGLE_APPS_SCRIPT_URL;
    res.json({
      hasSheetId: !!SPREADSHEET_ID,
      serviceAccountEmail: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL || "未設定",
      hasPrivateKey: !!process.env.GOOGLE_PRIVATE_KEY,
      hasAppsScript: !!APPS_SCRIPT_URL,
      sheetInit: sheetInitStatus,
      sqliteAvailable: !!db_local,
      env: {
        NODE_ENV: process.env.NODE_ENV,
        VERCEL: !!process.env.VERCEL,
      }
    });
  });

  app.get("/api/events", async (req, res) => {
    // Ensure sheet is initialized on first request
    await initializeSheet();
    
    let events: any[] = [];
    const APPS_SCRIPT_URL = process.env.GOOGLE_APPS_SCRIPT_URL;
    let appsScriptWarning: string | undefined = undefined;

    // Priority 1: Google Apps Script
    if (APPS_SCRIPT_URL) {
      try {
        console.log("Fetching events from Apps Script...");
        const response = await axios.get(APPS_SCRIPT_URL, { timeout: 10000 });
        
        if (typeof response.data === 'string' && response.data.includes('<!DOCTYPE html>')) {
          throw new Error("Apps Script 傳回了 HTML 而非 JSON，請檢查 Apps Script 是否已正確部署為「網頁應用程式」並設定為「任何人」皆可存取。");
        }
        
        if (Array.isArray(response.data)) {
          return res.json({ events: response.data, source: "google_apps_script" });
        } else if (response.data && Array.isArray(response.data.events)) {
          return res.json({ events: response.data.events, source: "google_apps_script" });
        } else if (response.data && response.data.error) {
          throw new Error(response.data.error);
        } else {
          console.warn("Apps Script returned unexpected format:", typeof response.data === 'string' ? response.data.substring(0, 100) : response.data);
          throw new Error("Apps Script 傳回的資料格式不符合預期。");
        }
      } catch (error: any) {
        console.error("Apps Script Fetch Error:", error.message);
        appsScriptWarning = error.message;
      }
    }

    // Priority 2: Direct Google Sheets API (Only if initialized successfully)
    if (sheetInitStatus.success) {
      try {
        const sheets = await getSheets();
        if (!sheets) throw new Error("Sheets instance not available");
        
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
          error: typeof appsScriptWarning !== 'undefined'
            ? `Apps Script 讀取失敗且無 Sheets API 備援: ${appsScriptWarning}`
            : "無法取得活動資料。請確認環境變數 (GOOGLE_SHEET_ID 或 GOOGLE_APPS_SCRIPT_URL) 已正確設定。",
          warning: typeof appsScriptWarning !== 'undefined' ? appsScriptWarning : undefined
        });
      }
    } catch (error: any) {
      res.status(500).json({ error: "Failed to fetch events from local database" });
    }
  });

  app.post("/api/events", async (req, res) => {
    await initializeSheet();
    const eventData = req.body;
    const { title, description, start_date, end_date, time, member_name, color, companions } = eventData;
    const eventId = uuidv4(); 
    const APPS_SCRIPT_URL = process.env.GOOGLE_APPS_SCRIPT_URL;

    if (!APPS_SCRIPT_URL && !sheetInitStatus.success) {
      return res.status(400).json({ 
        error: "儲存失敗：未設定 Google Apps Script URL 且 Google Sheets API 憑證無效或缺失。",
        debug: { sheetInitStatus }
      });
    }

    const leaveKeywords = ['請假', '排休', '特休', '補休', '公休', '休假'];
    const isLeave = leaveKeywords.some(kw => title.includes(kw));

    // Priority 1: Google Apps Script
    if (APPS_SCRIPT_URL) {
      try {
        console.log("Saving event to Apps Script...");
        const response = await axios.post(APPS_SCRIPT_URL, {
          ...eventData,
          action: eventData.action || 'create',
          id: eventId,
          isLeave: isLeave,
          targetSheet: isLeave ? LEAVES_SHEET_NAME : MAIN_SHEET_NAME
        }, { timeout: 12000 });
        
        if (typeof response.data === 'string' && response.data.includes('<!DOCTYPE html>')) {
          throw new Error("Apps Script 傳回了 HTML 而非 JSON。");
        }
        
        if (response.data && response.data.error) {
          throw new Error(response.data.error);
        }
        
        return res.json({ success: true, source: "google_apps_script", id: response.data?.id || eventId });
      } catch (error: any) {
        console.error("Apps Script Save Error:", error.message);
        if (!sheetInitStatus.success) {
          return res.status(500).json({ error: "Apps Script 儲存失敗且無 Sheets API 備援: " + error.message });
        }
      }
    }

    // Priority 2: Direct Google Sheets API
    if (sheetInitStatus.success) {
      try {
        const sheets = await getSheets();
        if (!sheets) throw new Error("Sheets instance not available");
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
          if (header === 'companions') return companions || "";
          return "";
        });

        // If no headers found or mapping failed, use default order
        const finalRow = newRow.length > 0 ? newRow : [eventId, title, description, start_date, end_date, time || "", member_name, color, companions || ""];
        
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
          INSERT INTO events (uuid, title, description, start_date, end_date, time, member_name, color, companions)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);
        stmt.run(eventId, title, description || "", start_date, end_date, time || "", member_name, color, companions || "");
        
        let warningMsg = undefined;
        if (typeof sheetsWarning !== 'undefined') warningMsg = sheetsWarning;
        
        return res.json({ success: true, source: "local", warning: warningMsg, id: eventId });
      } else {
        return res.status(500).json({ 
          error: "儲存失敗：Google 試算表未設定且本地資料庫不可用。",
          details: typeof sheetsWarning !== 'undefined' ? sheetsWarning : undefined
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
    await initializeSheet();
    const { id } = req.params;
    const eventData = req.body;
    const { title, description, start_date, end_date, time, member_name, color, companions, original_title } = eventData;
    const APPS_SCRIPT_URL = process.env.GOOGLE_APPS_SCRIPT_URL;

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

        let response = await axios.post(APPS_SCRIPT_URL, updatePayload, { timeout: 8000 });
        
        // Fallback 1: Try the other sheet
        if (response.data && response.data.error && response.data.error.includes('找不到 ID')) {
          const fallbackSheet = targetSheet === MAIN_SHEET_NAME ? LEAVES_SHEET_NAME : MAIN_SHEET_NAME;
          console.log(`ID not found in ${targetSheet}, retrying in ${fallbackSheet}`);
          updatePayload.sheet = fallbackSheet;
          response = await axios.post(APPS_SCRIPT_URL, updatePayload, { timeout: 5000 });
          
          // Fallback 2: Try with id = title (in case Apps Script assumes ID is in column A, which is actually title)
          if (response.data && response.data.error && response.data.error.includes('找不到 ID')) {
            console.log(`ID still not found, retrying with id = title in ${targetSheet}`);
            updatePayload.sheet = targetSheet;
            updatePayload.id = original_title || title;
            response = await axios.post(APPS_SCRIPT_URL, updatePayload, { timeout: 5000 });
            
            // Fallback 3: Try with id = title in the other sheet
            if (response.data && response.data.error && response.data.error.includes('找不到 ID')) {
              console.log(`ID still not found, retrying with id = title in ${fallbackSheet}`);
              updatePayload.sheet = fallbackSheet;
              response = await axios.post(APPS_SCRIPT_URL, updatePayload, { timeout: 5000 });
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
        console.error("Apps Script Update Error, falling back to Sheets API:", error.message);
        var appsScriptUpdateWarning = error.message;
      }
    }

    // Priority 2: Direct Google Sheets API
    if (sheetInitStatus.success) {
      try {
        const sheets = await getSheets();
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
            if (header === 'companions') return companions || "";
            return "";
          });

          // If mapping failed, use default order
          const finalRow = updatedRow.length > 0 ? updatedRow : [id, title, description, start_date, end_date, time || "", member_name, color, companions || ""];

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
          SET title = ?, description = ?, start_date = ?, end_date = ?, time = ?, member_name = ?, color = ?, companions = ?
          WHERE uuid = ? OR id = ?
        `);
        const result = stmt.run(title, description || "", start_date, end_date, time || "", member_name, color, companions || "", id, id);
        if (result.changes > 0) {
          res.json({ success: true, source: "local", warning: typeof appsScriptUpdateWarning !== 'undefined' ? appsScriptUpdateWarning : undefined });
        } else {
          res.status(404).json({ error: "Event not found", warning: typeof appsScriptUpdateWarning !== 'undefined' ? appsScriptUpdateWarning : undefined });
        }
      } else {
        res.status(500).json({ 
          error: typeof appsScriptUpdateWarning !== 'undefined' 
            ? `Apps Script 更新失敗且無 Sheets API 備援: ${appsScriptUpdateWarning}` 
            : "更新失敗：Google 試算表未設定且本地資料庫不可用。",
          warning: typeof appsScriptUpdateWarning !== 'undefined' ? appsScriptUpdateWarning : undefined 
        });
      }
    } catch (error: any) {
      console.error("SQLite Update Error:", error.message);
      res.status(500).json({ error: "Failed to update event locally", warning: appsScriptUpdateWarning });
    }
  });

  app.delete("/api/events/:id", async (req, res) => {
    await initializeSheet();
    const { id } = req.params;
    const { title } = req.query;
    const APPS_SCRIPT_URL = process.env.GOOGLE_APPS_SCRIPT_URL;
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
    if (!eventDetails && sheetInitStatus.success) {
      try {
        const sheets = await getSheets();
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

        let response = await axios.post(APPS_SCRIPT_URL, deletePayload, { timeout: 8000 });
        
        // Fallback 1: Try the other sheet
        if (response.data && response.data.error && response.data.error.includes('找不到 ID')) {
          const fallbackSheet = targetSheet === MAIN_SHEET_NAME ? LEAVES_SHEET_NAME : MAIN_SHEET_NAME;
          console.log(`ID not found in ${targetSheet}, retrying delete in ${fallbackSheet}`);
          deletePayload.sheet = fallbackSheet;
          response = await axios.post(APPS_SCRIPT_URL, deletePayload, { timeout: 5000 });
          
          // Fallback 2: Try with id = title (in case Apps Script assumes ID is in column A, which is actually title)
          if (response.data && response.data.error && response.data.error.includes('找不到 ID')) {
            console.log(`ID still not found, retrying with id = title in ${targetSheet}`);
            deletePayload.sheet = targetSheet;
            deletePayload.id = eventTitle;
            response = await axios.post(APPS_SCRIPT_URL, deletePayload, { timeout: 5000 });
            
            // Fallback 3: Try with id = title in the other sheet
            if (response.data && response.data.error && response.data.error.includes('找不到 ID')) {
              console.log(`ID still not found, retrying with id = title in ${fallbackSheet}`);
              deletePayload.sheet = fallbackSheet;
              response = await axios.post(APPS_SCRIPT_URL, deletePayload, { timeout: 5000 });
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
    if (sheetInitStatus.success) {
      try {
        const sheets = await getSheets();
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
    const gasFailed = APPS_SCRIPT_URL && results.gas?.success === false;
    const sheetsFailed = SPREADSHEET_ID && (results.sheets?.success === false || (!sheetInitStatus.success && !results.sheets));
    
    if (gasFailed && sheetsFailed) {
      return res.status(500).json({ error: `刪除失敗: Apps Script (${results.gas?.error}), Sheets API (${results.sheets?.error || '未初始化'})` });
    } else if (gasFailed && !SPREADSHEET_ID) {
      return res.status(500).json({ error: `Apps Script 刪除失敗: ${results.gas?.error}` });
    } else if (sheetsFailed && !APPS_SCRIPT_URL) {
      return res.status(500).json({ error: `Google Sheets API 刪除失敗: ${results.sheets?.error || '未初始化'}` });
    } else if (gasFailed && !sheetInitStatus.success) {
      return res.status(500).json({ error: `Apps Script 刪除失敗且無 Sheets API 備援: ${results.gas?.error}` });
    }

    res.json({ success: true, results });
  });

  // Global error handler
  app.use((err: any, req: any, res: any, next: any) => {
    console.error("Unhandled Error:", err);
    res.status(500).json({
      error: "伺服器發生未預期錯誤",
      details: err.message || String(err)
    });
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production" && !process.env.VERCEL) {
    try {
      const { createServer: createViteServer } = await import("vite");
      const vite = await createViteServer({
        server: { middlewareMode: true },
        appType: "spa",
      });
      app.use(vite.middlewares);
    } catch (e) {
      console.error("Vite initialization failed:", e);
    }
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
