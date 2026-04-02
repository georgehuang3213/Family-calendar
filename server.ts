import express from "express";
import path from "path";
import { google } from "googleapis";
import dotenv from "dotenv";
import axios from "axios";
import { v4 as uuidv4 } from 'uuid';
import { middleware, Client, WebhookEvent } from '@line/bot-sdk';

dotenv.config();

let db_local: any = null;

// Caching logic
let eventsCache: { data: any, timestamp: number } | null = null;
let taiwanCalendarCache: Record<string, { data: any, timestamp: number }> = {};
const CACHE_TTL = 15 * 1000; // 15 seconds (fresh)
const STALE_TTL = 60 * 1000; // 60 seconds (stale but usable)
const CALENDAR_CACHE_TTL = 24 * 60 * 60 * 1000; // 24 hours
let isFetchingInBackground = false;

function clearEventsCache() {
  console.log("🧹 Clearing events cache");
  eventsCache = null;
}

// Reusable fetch logic
let fetchEventsPromise: Promise<any> | null = null;

async function fetchEventsInternal() {
  if (fetchEventsPromise) {
    console.log("⏳ Joining existing fetch request to prevent stampede...");
    return fetchEventsPromise;
  }

  fetchEventsPromise = (async () => {
    try {
      let events: any[] = [];
      const APPS_SCRIPT_URL = process.env.GOOGLE_APPS_SCRIPT_URL;
      let source = "unknown";
      let appsScriptWarning: string | undefined = undefined;

      // Priority 1: Google Apps Script
      if (APPS_SCRIPT_URL) {
        try {
          console.log("📡 Fetching events from Apps Script...");
          const response = await axios.get(APPS_SCRIPT_URL, { timeout: 30000 });
          
          if (typeof response.data === 'string' && response.data.includes('<!DOCTYPE html>')) {
            throw new Error("Apps Script returned HTML instead of JSON.");
          }

          if (Array.isArray(response.data)) {
            events = response.data;
            source = "google_apps_script";
          } else if (response.data && Array.isArray(response.data.events)) {
            events = response.data.events;
            source = "google_apps_script";
          }
        } catch (e: any) {
          console.error("❌ Apps Script Fetch Error:", e.message);
          appsScriptWarning = e.message;
        }
      }

      // Priority 2: Direct Sheets API
      if (events.length === 0 && sheetInitStatus.success) {
        try {
          console.log("📡 Fetching events from Direct Sheets API...");
          const sheets = await getSheets();
          if (sheets) {
            const mainResponse = await sheets.spreadsheets.values.get({
              spreadsheetId: SPREADSHEET_ID,
              range: RANGE,
            });
            
            let leavesRows: any[][] = [];
            try {
              const leavesResponse = await sheets.spreadsheets.values.get({
                spreadsheetId: SPREADSHEET_ID,
                range: LEAVES_RANGE,
              });
              leavesRows = leavesResponse.data.values || [];
            } catch (e) {}

            const mainRows = mainResponse.data.values || [];

            const processRows = (rows: any[][], sheetName: string) => {
              if (!rows || rows.length <= 1) return [];
              const rawHeaders = rows[0];
              return rows.slice(1).map((row, index) => {
                const event: any = { id: `${sheetName}-${index + 1}` };
                rawHeaders.forEach((rawHeader, i) => {
                  const normalized = String(rawHeader).toLowerCase().trim().replace(/[_\s]/g, '');
                  const value = row[i] || "";
                  if (normalized === 'id') event.id = value;
                  else if (normalized === 'title') event.title = value;
                  else if (normalized === 'description') event.description = value;
                  else if (normalized === 'startdate') event.start_date = value;
                  else if (normalized === 'enddate') event.end_date = value;
                  else if (normalized === 'time') event.time = value;
                  else if (normalized === 'membername') event.member_name = value;
                  else if (normalized === 'color') event.color = value;
                  event[rawHeader] = value;
                });
                if (!event.title) event.title = "無標題";
                if (!event.start_date) event.start_date = new Date().toISOString().split('T')[0];
                if (!event.end_date) event.end_date = event.start_date;
                if (!event.member_name) event.member_name = "全家";
                if (!event.color) event.color = "#4F46E5";
                return event;
              });
            };

            events = [...processRows(mainRows, MAIN_SHEET_NAME), ...processRows(leavesRows, LEAVES_SHEET_NAME)];
            source = "google_sheets_api";
          }
        } catch (e: any) {
          console.error("❌ Sheets API Fetch Error:", e.message);
        }
      }

      // Priority 3: SQLite
      if (events.length === 0 && db_local) {
        try {
          console.log("📡 Fetching from local SQLite fallback...");
          const rows = db_local.prepare("SELECT * FROM events").all();
          events = rows.map((row: any) => ({ ...row, id: String(row.id) }));
          source = "sqlite_fallback";
        } catch (e: any) {
          console.error("❌ SQLite Fetch Error:", e.message);
        }
      }

      const result = {
        events,
        source,
        timestamp: new Date().toISOString(),
        warning: appsScriptWarning
      };

      eventsCache = { data: result, timestamp: Date.now() };
      return result;
    } finally {
      fetchEventsPromise = null;
    }
  })();

  return fetchEventsPromise;
}

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

// LINE Configuration
const lineConfig = {
  channelAccessToken: process.env.LINE_CHANNEL_ACCESS_TOKEN || '',
  channelSecret: process.env.LINE_CHANNEL_SECRET || '',
};

let lineClient: Client | null = null;
try {
  if (lineConfig.channelAccessToken && lineConfig.channelSecret) {
    lineClient = new Client(lineConfig);
  }
} catch (e: any) {
  console.error("⚠️ Failed to initialize LINE client:", e.message);
}

// Helper to send LINE notification
async function sendLineNotification(message: string) {
  const groupId = process.env.LINE_GROUP_ID;
  if (!lineClient || !groupId || !lineConfig.channelAccessToken || lineConfig.channelAccessToken === "YOUR_CHANNEL_ACCESS_TOKEN") {
    console.log("⚠️ LINE notification skipped: Missing Group ID or Access Token");
    return;
  }

  try {
    await lineClient.pushMessage(groupId, {
      type: 'text',
      text: message,
    });
    console.log("✅ LINE notification sent to group:", groupId);
  } catch (err: any) {
    console.error("❌ LINE notification failed:", err.message);
  }
}

async function startServer() {
  const app = express();
  const PORT = 3000;

  // Request Logger for debugging
  app.use((req, res, next) => {
    if (req.url.includes('line')) {
      console.log(`[${new Date().toISOString()}] ${req.method} ${req.url} - Headers: ${JSON.stringify(req.headers['x-line-signature'])}`);
    }
    next();
  });

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

  // LINE Webhook (Handle both with and without trailing slash)
  // We add a try-catch block around the middleware to handle the case where
  // LINE's "Verify" button sends a dummy request that might fail signature validation
  const safeLineMiddleware = lineConfig.channelSecret ? middleware(lineConfig) : (req: any, res: any, next: any) => {
    console.warn("⚠️ LINE Webhook called but channelSecret is missing.");
    // Always return 200 OK for LINE verification to pass, even if not fully configured yet
    res.status(200).send("LINE not configured yet, but endpoint is active");
  };

  app.post(['/api/line/webhook', '/api/line/webhook/'], (req, res, next) => {
    // If it's a test request from LINE (often empty or invalid signature during "Verify")
    // We just return 200 OK to pass the verification
    if (!req.headers['x-line-signature'] || req.body?.events?.length === 0 || (req.body?.events?.[0]?.replyToken === '00000000000000000000000000000000')) {
      console.log("⚠️ Received LINE Webhook verification request. Returning 200 OK.");
      return res.status(200).send("OK");
    }
    next();
  }, safeLineMiddleware, (req, res) => {
    console.log("📩 Received LINE Webhook event");
    Promise.all(req.body.events.map(handleLineEvent))
      .then(() => res.json({ success: true }))
      .catch((err) => {
        console.error("❌ LINE Webhook Error:", err);
        res.status(500).end();
      });
  });

  // GET route for simple verification check
  app.get(['/api/line/webhook', '/api/line/webhook/'], (req, res) => {
    res.send("LINE Webhook endpoint is active. Please use POST for actual events.");
  });

  app.use(express.json());

  async function handleLineEvent(event: WebhookEvent) {
    if (!lineClient) {
      console.warn("⚠️ Cannot reply because lineClient is not initialized.");
      return Promise.resolve(null);
    }

    // 當機器人被加入群組時
    if (event.type === 'join' && event.source.type === 'group') {
      const groupId = event.source.groupId;
      console.log("🤖 Bot joined group:", groupId);
      return lineClient.replyMessage(event.replyToken, {
        type: 'text',
        text: `大家好！本群組的 ID 是：\n${groupId}\n請將此 ID 填入系統設定中。`,
      });
    }

    // 當有人傳送文字訊息時 (方便隨時查詢 ID)
    if (event.type === 'message' && event.message.type === 'text') {
      const text = event.message.text.trim().toLowerCase();
      if (text === 'id' || text === '取得id') {
        if (event.source.type === 'group') {
          return lineClient.replyMessage(event.replyToken, {
            type: 'text',
            text: `本群組的 ID 是：\n${event.source.groupId}`,
          });
        } else if (event.source.type === 'user') {
          return lineClient.replyMessage(event.replyToken, {
            type: 'text',
            text: `您的個人 ID 是：\n${event.source.userId}\n\n(提示：若要推播到群組，請將我邀請至群組後，在群組內輸入 id)`,
          });
        }
      }
    }

    return Promise.resolve(null);
  }

  // Taiwan Government Calendar API
  app.get("/api/taiwan-calendar", async (req, res) => {
    const year = req.query.year || new Date().getFullYear();
    
    const cacheKey = String(year);
    // Check cache
    if (taiwanCalendarCache[cacheKey] && (Date.now() - taiwanCalendarCache[cacheKey].timestamp < CALENDAR_CACHE_TTL)) {
      return res.json(taiwanCalendarCache[cacheKey].data);
    }

    try {
      console.log(`📡 Fetching Taiwan Government Calendar for ${year}...`);
      
      let dataArray: any[] | null = null;
      
      try {
        // Primary source: ruyut/TaiwanCalendar (highly reliable open source JSON)
        const response = await axios.get(`https://cdn.jsdelivr.net/gh/ruyut/TaiwanCalendar/data/${year}.json`, { 
          timeout: 8000
        });
        
        if (Array.isArray(response.data)) {
          dataArray = response.data.map(item => {
            // Convert YYYYMMDD to YYYY-MM-DD
            const dateStr = item.date;
            const formattedDate = dateStr && dateStr.length === 8 
              ? `${dateStr.substring(0,4)}-${dateStr.substring(4,6)}-${dateStr.substring(6,8)}`
              : dateStr;
              
            return {
              date: formattedDate,
              isHoliday: item.isHoliday ? '是' : '否',
              description: item.description
            };
          });
          console.log(`✅ Successfully fetched from primary API (ruyut/TaiwanCalendar) for ${year}`);
        } else {
          throw new Error("Invalid data format from primary API");
        }
      } catch (primaryError: any) {
        console.log(`ℹ️ Primary calendar API failed for ${year}: ${primaryError.message}. Trying fallback...`);
        
        // Fallback source 1: New Taipei City Open Data
        try {
          const fallbackResponse = await axios.get(`https://data.ntpc.gov.tw/api/datasets/308DCD75-6434-45BC-A95F-5844F0B8430F/json?size=2000`, { 
            timeout: 8000,
            headers: { 
              'Accept': 'application/json',
              'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
            }
          });
          
          let rawData = fallbackResponse.data;
          
          if (typeof rawData === 'string') {
            if (rawData.trim().startsWith('<!DOCTYPE html>') || rawData.trim().startsWith('<html')) {
              throw new Error("Received HTML instead of JSON from government API");
            }
            try {
              rawData = JSON.parse(rawData.trim());
            } catch (e) {
              console.log("ℹ️ Failed to parse Taiwan Calendar response as JSON");
            }
          }

          dataArray = Array.isArray(rawData) ? rawData : (rawData?.data || rawData?.records || null);
          if (Array.isArray(dataArray)) {
            console.log("✅ Successfully fetched from fallback API 1 (New Taipei City)");
          } else {
            throw new Error("Invalid data format from fallback API 1");
          }
        } catch (fallback1Error: any) {
          console.log(`ℹ️ Fallback 1 calendar API failed: ${fallback1Error.message}. Trying fallback 2...`);
          
          // Fallback source 2: Nager.Date API
          try {
            const fallback2Response = await axios.get(`https://date.nager.at/api/v3/PublicHolidays/${year}/TW`, { timeout: 5000 });
            if (Array.isArray(fallback2Response.data)) {
              // Map Nager.Date format to our expected format
              dataArray = fallback2Response.data.map((h: any) => ({
                date: h.date,
                isHoliday: '是',
                description: h.localName || h.name
              }));
              console.log("✅ Successfully fetched from fallback API 2 (Nager.Date)");
            } else {
              throw new Error("Invalid data format from fallback API 2");
            }
          } catch (fallback2Error: any) {
            console.log("ℹ️ Fallback 2 calendar API also failed:", fallback2Error.message);
          }
        }
      }

      if (Array.isArray(dataArray)) {
        const holidays: Record<string, string> = {};
        const makeupWorkdays: Record<string, string> = {};

        dataArray.forEach((item: any) => {
          const dateStr = item.date || item.Date;
          if (!dateStr) return;

          const normalizedDate = dateStr.replace(/\//g, '-');
          const isHoliday = item.isHoliday === '是' || item.isHoliday === true;
          const description = item.description || item.holidayCategory || "";
          
          const dateObj = new Date(normalizedDate);
          if (isNaN(dateObj.getTime())) return;

          const dayOfWeek = dateObj.getDay();

          if (isHoliday) {
            if (description) {
              holidays[normalizedDate] = description;
            } else if (dayOfWeek !== 0 && dayOfWeek !== 6) {
              holidays[normalizedDate] = "放假";
            } else {
              holidays[normalizedDate] = ""; 
            }
          } else {
            if (dayOfWeek === 0 || dayOfWeek === 6) {
              makeupWorkdays[normalizedDate] = description || "補行上班";
            }
          }
        });

        const result = { holidays, makeupWorkdays };
        taiwanCalendarCache[cacheKey] = { data: result, timestamp: Date.now() };
        res.json(result);
      } else {
        console.warn(`⚠️ Could not retrieve calendar data for ${year} from any source. Returning empty data.`);
        const result = { holidays: {}, makeupWorkdays: {} };
        taiwanCalendarCache[cacheKey] = { data: result, timestamp: Date.now() };
        res.json(result);
      }
    } catch (e: any) {
      console.error("❌ Taiwan Calendar Fetch Error:", e.message);
      // Fallback to empty if API fails
      res.status(500).json({ error: "Failed to fetch government calendar", details: e.message });
    }
  });

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

  async function getTodayWeather() {
    try {
      // 台中市座標：緯度 24.1477, 經度 120.6736
      const url = 'https://api.open-meteo.com/v1/forecast?latitude=24.1477&longitude=120.6736&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max&timezone=Asia%2FTaipei&forecast_days=1';
      const response = await axios.get(url, { timeout: 8000 });
      const daily = response.data.daily;
      const code = daily.weather_code[0];
      const maxT = Math.round(daily.temperature_2m_max[0]);
      const minT = Math.round(daily.temperature_2m_min[0]);
      const pop = daily.precipitation_probability_max[0];

      let weatherDesc = "未知";
      let icon = "🌤️";
      if (code === 0) { weatherDesc = "晴天"; icon = "☀️"; }
      else if (code === 1 || code === 2) { weatherDesc = "多雲"; icon = "⛅"; }
      else if (code === 3) { weatherDesc = "陰天"; icon = "☁️"; }
      else if (code >= 45 && code <= 48) { weatherDesc = "起霧"; icon = "🌫️"; }
      else if (code >= 51 && code <= 57) { weatherDesc = "毛毛雨"; icon = "🌧️"; }
      else if (code >= 61 && code <= 67) { weatherDesc = "下雨"; icon = "☔"; }
      else if (code >= 71 && code <= 77) { weatherDesc = "下雪"; icon = "❄️"; }
      else if (code >= 80 && code <= 82) { weatherDesc = "陣雨"; icon = "🌦️"; }
      else if (code >= 85 && code <= 86) { weatherDesc = "陣雪"; icon = "❄️"; }
      else if (code >= 95 && code <= 99) { weatherDesc = "雷陣雨"; icon = "⛈️"; }

      return `${icon} ${weatherDesc} (${minT}°C - ${maxT}°C) | 降雨機率 ${pop}%`;
    } catch (e) {
      console.error("Weather fetch error:", e);
      return null;
    }
  }

  async function getTodayHoliday(year: number, dateStrYYYYMMDD: string) {
    try {
      const response = await axios.get(`https://cdn.jsdelivr.net/gh/ruyut/TaiwanCalendar/data/${year}.json`, { timeout: 8000 });
      const formattedDate = dateStrYYYYMMDD.replace(/-/g, '');
      const dayData = response.data.find((d: any) => d.date === formattedDate);
      
      if (dayData && dayData.isHoliday && dayData.description && !dayData.description.includes("星期")) {
        return dayData.description;
      }
      return null;
    } catch (e) {
      console.error("Holiday fetch error:", e);
      return null;
    }
  }

  app.get("/api/cron/daily-push", async (req, res) => {
    try {
      await initializeSheet();
      const result = await fetchEventsInternal();
      
      // Get today's date in YYYY-MM-DD format (Taiwan time)
      const today = new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Taipei" }));
      const yyyy = today.getFullYear();
      const mm = String(today.getMonth() + 1).padStart(2, '0');
      const dd = String(today.getDate()).padStart(2, '0');
      const todayStr = `${yyyy}-${mm}-${dd}`;

      const [weatherStr, holidayStr] = await Promise.all([
        getTodayWeather(),
        getTodayHoliday(yyyy, todayStr)
      ]);

      // Filter events that happen today
      const todayTime = new Date(yyyy, today.getMonth(), today.getDate()).getTime();
      
      const parseDateStr = (dStr: string) => {
        if (!dStr) return 0;
        const s = dStr.trim();
        if (s.includes('T')) {
          const d = new Date(s);
          if (!isNaN(d.getTime())) {
            const taipeiStr = d.toLocaleString("en-US", { timeZone: "Asia/Taipei" });
            const taipeiDate = new Date(taipeiStr);
            return new Date(taipeiDate.getFullYear(), taipeiDate.getMonth(), taipeiDate.getDate()).getTime();
          }
        }
        const parts = s.split(/[-/]/);
        if (parts.length === 3 && parts[0].length === 4) {
          return new Date(parseInt(parts[0], 10), parseInt(parts[1], 10) - 1, parseInt(parts[2], 10)).getTime();
        }
        const fallback = new Date(s);
        if (!isNaN(fallback.getTime())) {
           const taipeiStr = fallback.toLocaleString("en-US", { timeZone: "Asia/Taipei" });
           const taipeiDate = new Date(taipeiStr);
           return new Date(taipeiDate.getFullYear(), taipeiDate.getMonth(), taipeiDate.getDate()).getTime();
        }
        return 0;
      };

      const todaysEvents = result.events.filter((e: any) => {
        const startTime = parseDateStr(e.start_date);
        const endTime = e.end_date ? parseDateStr(e.end_date) : startTime;
        
        if (startTime > 0 && endTime > 0) {
          return todayTime >= startTime && todayTime <= endTime;
        }
        return false;
      });

      if (todaysEvents.length === 0 && !holidayStr) {
        console.log("📅 No events and no holiday today. Skipping LINE push.");
        return res.json({ success: true, message: "No events or holiday today" });
      }

      // Format the message
      let message = `📅 【今日家庭行事曆】 ${todayStr}\n`;
      if (holidayStr) message += `🎈 節日：${holidayStr}\n`;
      if (weatherStr) message += `⛅ 天氣：${weatherStr}\n`;
      message += `\n`;

      if (todaysEvents.length > 0) {
        todaysEvents.forEach((e: any, index: number) => {
          message += `📌 ${index + 1}. ${e.title}\n`;
          if (e.time) message += `⏰ 時間：${e.time}\n`;
          if (e.member_name) message += `👤 成員：${e.member_name}\n`;
          if (e.companions) message += `👥 同行：${e.companions}\n`;
          if (e.description) message += `📝 備註：${e.description}\n`;
          message += `\n`;
        });
      } else {
        message += `📌 今日無特別排程活動\n\n`;
      }
      
      message += `祝大家有美好的一天！✨`;

      await sendLineNotification(message.trim());
      return res.json({ success: true, message: "Daily push sent", count: todaysEvents.length });
    } catch (error: any) {
      console.error("❌ Daily Push Error:", error.message);
      return res.status(500).json({ error: "Failed to send daily push", details: error.message });
    }
  });

  app.get("/api/events", async (req, res) => {
    // Ensure sheet is initialized on first request
    await initializeSheet();
    
    const forceRefresh = req.query.refresh === 'true';
    const now = Date.now();
    
    // Check cache (Stale-While-Revalidate)
    if (!forceRefresh && eventsCache) {
      const age = now - eventsCache.timestamp;
      
      if (age < CACHE_TTL) {
        console.log("🚀 Serving events from cache (Fresh)");
        return res.json({ ...eventsCache.data, cached: true });
      } else if (age < STALE_TTL) {
        console.log("🚀 Serving events from cache (Stale) - Triggering background refresh");
        // Return stale data immediately
        res.json({ ...eventsCache.data, cached: true, stale: true });
        
        // Trigger background refresh
        if (!isFetchingInBackground) {
          isFetchingInBackground = true;
          fetchEventsInternal().finally(() => {
            isFetchingInBackground = false;
            console.log("✅ Background refresh complete");
          });
        }
        return;
      }
    }
    
    try {
      const result = await fetchEventsInternal();
      return res.json(result);
    } catch (error: any) {
      console.error("❌ Final Fetch Error:", error.message);
      return res.status(500).json({ error: "Failed to fetch events", details: error.message });
    }
  });

  async function checkAndSendSameDayNotification(eventData: any, isNew: boolean = true) {
    try {
      const today = new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Taipei" }));
      const yyyy = today.getFullYear();
      const mm = String(today.getMonth() + 1).padStart(2, '0');
      const dd = String(today.getDate()).padStart(2, '0');
      const todayStr = `${yyyy}-${mm}-${dd}`;

      const { title, start_date, end_date, time, member_name, companions, description } = eventData;

      const todayTime = new Date(yyyy, today.getMonth(), today.getDate()).getTime();
      
      const parseDateStr = (dStr: string) => {
        if (!dStr) return 0;
        const s = dStr.trim();
        if (s.includes('T')) {
          const d = new Date(s);
          if (!isNaN(d.getTime())) {
            const taipeiStr = d.toLocaleString("en-US", { timeZone: "Asia/Taipei" });
            const taipeiDate = new Date(taipeiStr);
            return new Date(taipeiDate.getFullYear(), taipeiDate.getMonth(), taipeiDate.getDate()).getTime();
          }
        }
        const parts = s.split(/[-/]/);
        if (parts.length === 3 && parts[0].length === 4) {
          return new Date(parseInt(parts[0], 10), parseInt(parts[1], 10) - 1, parseInt(parts[2], 10)).getTime();
        }
        const fallback = new Date(s);
        if (!isNaN(fallback.getTime())) {
           const taipeiStr = fallback.toLocaleString("en-US", { timeZone: "Asia/Taipei" });
           const taipeiDate = new Date(taipeiStr);
           return new Date(taipeiDate.getFullYear(), taipeiDate.getMonth(), taipeiDate.getDate()).getTime();
        }
        return 0;
      };

      let isToday = false;
      const startTime = parseDateStr(start_date);
      const endTime = end_date ? parseDateStr(end_date) : startTime;
      
      if (startTime > 0 && endTime > 0) {
        if (todayTime >= startTime && todayTime <= endTime) {
          isToday = true;
        }
      }

      if (isToday) {
        const [weatherStr, holidayStr] = await Promise.all([
          getTodayWeather(),
          getTodayHoliday(yyyy, todayStr)
        ]);

        let message = isNew ? `🚨 【臨時新增】今日活動通知\n` : `🚨 【臨時修改】今日活動通知\n`;
        if (holidayStr) message += `🎈 節日：${holidayStr}\n`;
        if (weatherStr) message += `⛅ 天氣：${weatherStr}\n`;
        message += `\n`;
        
        message += `📌 活動：${title}\n`;
        if (time) message += `⏰ 時間：${time}\n`;
        if (member_name) message += `👤 成員：${member_name}\n`;
        if (companions) message += `👥 同行：${companions}\n`;
        if (description) message += `📝 備註：${description}\n`;
        
        await sendLineNotification(message.trim());
      }
    } catch (err) {
      console.error("Failed to send same-day notification:", err);
    }
  }

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
        }, { timeout: 15000 });
        
        if (typeof response.data === 'string' && response.data.includes('<!DOCTYPE html>')) {
          throw new Error("Apps Script 傳回了 HTML 而非 JSON。");
        }
        
        if (response.data && response.data.error) {
          throw new Error(response.data.error);
        }
        
        clearEventsCache();
        checkAndSendSameDayNotification(eventData, true);
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

        clearEventsCache();
        checkAndSendSameDayNotification(eventData, true);
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
        
        clearEventsCache();
        checkAndSendSameDayNotification(eventData, true);
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

        let response = await axios.post(APPS_SCRIPT_URL, updatePayload, { timeout: 15000 });
        
        // Fallback 1: Try the other sheet
        if (response.data && response.data.error && response.data.error.includes('找不到 ID')) {
          const fallbackSheet = targetSheet === MAIN_SHEET_NAME ? LEAVES_SHEET_NAME : MAIN_SHEET_NAME;
          console.log(`ID not found in ${targetSheet}, retrying in ${fallbackSheet}`);
          updatePayload.sheet = fallbackSheet;
          response = await axios.post(APPS_SCRIPT_URL, updatePayload, { timeout: 10000 });
          
          // Fallback 2: Try with id = title (in case Apps Script assumes ID is in column A, which is actually title)
          if (response.data && response.data.error && response.data.error.includes('找不到 ID')) {
            console.log(`ID still not found, retrying with id = title in ${targetSheet}`);
            updatePayload.sheet = targetSheet;
            updatePayload.id = original_title || title;
            response = await axios.post(APPS_SCRIPT_URL, updatePayload, { timeout: 10000 });
            
            // Fallback 3: Try with id = title in the other sheet
            if (response.data && response.data.error && response.data.error.includes('找不到 ID')) {
              console.log(`ID still not found, retrying with id = title in ${fallbackSheet}`);
              updatePayload.sheet = fallbackSheet;
              response = await axios.post(APPS_SCRIPT_URL, updatePayload, { timeout: 10000 });
            }
          }
        }
        
        if (typeof response.data === 'string' && response.data.includes('<!DOCTYPE html>')) {
          throw new Error("Apps Script 發生錯誤，請檢查 Apps Script 內的試算表 ID 是否正確設定。");
        }
        
        if (response.data && response.data.error) {
          if (response.data.error.includes('找不到 ID')) {
            console.log(`ℹ️ ID ${id} not found in Apps Script. Will try fallback methods.`);
            throw new Error(`NOT_FOUND:${response.data.error}`);
          } else {
            throw new Error(response.data.error);
          }
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
        
        clearEventsCache();
        checkAndSendSameDayNotification(eventData, false);
        return res.json({ success: true, source: "google_apps_script" });
      } catch (error: any) {
        if (error.message && error.message.startsWith('NOT_FOUND:')) {
          console.log(`ℹ️ Apps Script Update: ${error.message.replace('NOT_FOUND:', '')}. Falling back to Sheets API.`);
          // Don't set appsScriptUpdateWarning for NOT_FOUND so we don't show a scary warning in the UI
        } else {
          console.error("Apps Script Update Error, falling back to Sheets API:", error.message);
          var appsScriptUpdateWarning = error.message;
        }
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
          clearEventsCache();
          checkAndSendSameDayNotification(eventData, false);
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
          clearEventsCache();
          checkAndSendSameDayNotification(eventData, false);
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

    // Use req.body as fallback for eventDetails
    if (!eventDetails && req.body && Object.keys(req.body).length > 0) {
      eventDetails = req.body;
      console.log("Using req.body for eventDetails fallback:", eventDetails);
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
        
        if (id && id !== 'undefined') {
          deletePayload.id = id;
        }

        console.log("Sending delete request to Apps Script:", deletePayload);

        let response = await axios.post(APPS_SCRIPT_URL, deletePayload, { timeout: 15000 });
        
        // Fallback 1: Try the other sheet
        if (response.data && response.data.error && response.data.error.includes('找不到 ID')) {
          const fallbackSheet = targetSheet === MAIN_SHEET_NAME ? LEAVES_SHEET_NAME : MAIN_SHEET_NAME;
          console.log(`ID not found in ${targetSheet}, retrying delete in ${fallbackSheet}`);
          deletePayload.sheet = fallbackSheet;
          response = await axios.post(APPS_SCRIPT_URL, deletePayload, { timeout: 10000 });
          
          // Fallback 2: Try with id = title (in case Apps Script assumes ID is in column A, which is actually title)
          if (response.data && response.data.error && response.data.error.includes('找不到 ID')) {
            console.log(`ID still not found, retrying with id = title in ${targetSheet}`);
            deletePayload.sheet = targetSheet;
            deletePayload.id = eventTitle;
            response = await axios.post(APPS_SCRIPT_URL, deletePayload, { timeout: 10000 });
            
            // Fallback 3: Try with id = title in the other sheet
            if (response.data && response.data.error && response.data.error.includes('找不到 ID')) {
              console.log(`ID still not found, retrying with id = title in ${fallbackSheet}`);
              deletePayload.sheet = fallbackSheet;
              response = await axios.post(APPS_SCRIPT_URL, deletePayload, { timeout: 10000 });
            }
          }
        }
        
        if (typeof response.data === 'string' && response.data.includes('<!DOCTYPE html>')) {
          throw new Error("Apps Script 發生錯誤，請檢查 Apps Script 內的試算表 ID 是否正確設定。");
        }
        
        if (response.data && response.data.error) {
          if (response.data.error.includes('找不到 ID')) {
            console.log(`ℹ️ ID ${id} not found in Apps Script for deletion. Will try fallback methods.`);
            throw new Error(`NOT_FOUND:${response.data.error}`);
          } else {
            throw new Error(response.data.error);
          }
        }
        
        results.gas = { success: true };
      } catch (error: any) {
        if (error.message && error.message.startsWith('NOT_FOUND:')) {
          console.log(`ℹ️ Apps Script Delete: ${error.message.replace('NOT_FOUND:', '')}. Falling back to Sheets API.`);
          results.gas = { success: false, error: error.message.replace('NOT_FOUND:', '') };
        } else {
          console.error("Apps Script Delete Error:", error.message);
          results.gas = { success: false, error: error.message };
        }
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
    
    // If it was successfully deleted from SQLite, we consider it a success even if Google Sheets failed
    // (This happens for local-only events)
    if (results.sqlite?.success) {
      clearEventsCache();
      
      // If the error was just "not found", don't show a warning as it's expected for local-only events
      const isJustNotFound = (results.gas?.error && results.gas.error.includes('找不到 ID')) || 
                             (results.sheets?.error && results.sheets.error.includes('找不到'));
                             
      const shouldWarn = (gasFailed || sheetsFailed) && !isJustNotFound;
      
      return res.json({ success: true, results, warning: shouldWarn ? "已從本地刪除，但 Google 試算表同步失敗" : undefined });
    }
    
    if (gasFailed && sheetsFailed) {
      return res.status(500).json({ error: `刪除失敗: Apps Script (${results.gas?.error}), Sheets API (${results.sheets?.error || '未初始化'})` });
    } else if (gasFailed && !SPREADSHEET_ID) {
      return res.status(500).json({ error: `Apps Script 刪除失敗: ${results.gas?.error}` });
    } else if (sheetsFailed && !APPS_SCRIPT_URL) {
      return res.status(500).json({ error: `Google Sheets API 刪除失敗: ${results.sheets?.error || '未初始化'}` });
    } else if (gasFailed && !sheetInitStatus.success) {
      return res.status(500).json({ error: `Apps Script 刪除失敗且無 Sheets API 備援: ${results.gas?.error}` });
    }

    if (results.sqlite?.success || results.gas?.success || results.sheets?.success) {
      clearEventsCache();
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

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
  
  return app;
}

export const appPromise = startServer();
