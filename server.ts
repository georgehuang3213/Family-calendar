import express from "express";
import path from "path";
import dotenv from "dotenv";
import axios from "axios";
import { v4 as uuidv4 } from 'uuid';
import { middleware, Client, WebhookEvent } from '@line/bot-sdk';
import { initializeApp, cert, getApp, getApps } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import fs from "fs";
import cron from "node-cron";

dotenv.config();

// --- Firebase Admin Setup ---
let db: any;
function getDb() {
  if (!db) {
    const serviceAccountKey = process.env.FIREBASE_SERVICE_ACCOUNT_KEY;
    if (serviceAccountKey) {
      try {
        const serviceAccount = JSON.parse(serviceAccountKey);
        let databaseId = "(default)";
        try {
          const configPath = path.join(process.cwd(), 'firebase-applet-config.json');
          if (fs.existsSync(configPath)) {
            const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
            if (config.firestoreDatabaseId) {
              databaseId = config.firestoreDatabaseId;
            }
          }
        } catch (e) {
          console.warn("⚠️ Could not read firebase-applet-config.json for database ID");
        }

        if (getApps().length === 0) {
          initializeApp({
            credential: cert(serviceAccount)
          });
        }
        db = getFirestore(databaseId);
        console.log(`✅ Firestore initialized with DB ID: ${databaseId}`);
      } catch (e) {
        console.error("❌ Failed to initialize Firebase Admin:", e);
      }
    } else {
      console.warn("⚠️ FIREBASE_SERVICE_ACCOUNT_KEY is missing. Backend features disabled.");
    }
  }
  return db;
}

// --- LINE Setup ---
const lineConfig = {
  channelAccessToken: process.env.LINE_CHANNEL_ACCESS_TOKEN || '',
  channelSecret: process.env.LINE_CHANNEL_SECRET || '',
};

let lineClient: Client | null = null;
if (lineConfig.channelAccessToken && lineConfig.channelSecret) {
  try {
    lineClient = new Client(lineConfig);
  } catch (e: any) {
    console.error("⚠️ Failed to initialize LINE client:", e.message);
  }
}

async function sendLineNotification(message: string) {
  const groupId = process.env.LINE_GROUP_ID;
  if (!lineClient) {
    throw new Error("lineClient 尚未初始化，請檢查 LINE_CHANNEL_ACCESS_TOKEN 與 LINE_CHANNEL_SECRET");
  }
  if (!groupId) {
    throw new Error("環境變數中缺少 LINE_GROUP_ID");
  }
  try {
    await lineClient.pushMessage(groupId, { type: 'text', text: message });
    console.log("✅ LINE notification sent");
  } catch (err: any) {
    console.error("❌ LINE notification failed:", err.originalError?.response?.data || err.message);
    const detail = err.originalError?.response?.data?.message || err.message;
    throw new Error(`LINE 推播被拒絕: ${detail} (請檢查 LINE_GROUP_ID 是否正確，以 C/U/R 開頭，且機器人沒有被踢出群組)`);
  }
}

// --- Helper Functions ---
async function getTodayWeather() {
  try {
    const lat = 24.1477; // Taichung
    const lon = 120.6736;
    const response = await axios.get(`https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,weather_code&timezone=Asia%2FTaipei`, { timeout: 8000 });
    const weatherCode = response.data.current.weather_code;
    const temp = response.data.current.temperature_2m;
    const descriptions: Record<number, string> = {
        0: '晴朗', 1: '晴時多雲', 2: '多雲', 3: '陰天', 45: '霧', 51: '毛毛雨', 61: '小雨', 71: '小雪', 80: '陣雨', 95: '雷陣雨'
    };
    return `${descriptions[weatherCode] || '未知'}，氣溫 ${temp}°C`;
  } catch (e) {
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
    return null;
  }
}

async function startServer() {
  const app = express();
  const PORT = 3000;

  // 1. Logging middleware (Top level)
  app.use((req, res, next) => {
    if (req.url === "/api/line/webhook") {
      console.log(`📡 [Incoming Webhook] ${req.method} ${req.url}`);
    }
    next();
  });

  // 2. LINE Webhook
  // CRITICAL: We need both secret and token for the official middleware to work and for we to reply.
  const hasLineConfig = !!(lineConfig.channelAccessToken && lineConfig.channelSecret);
  const lineMiddleware = lineConfig.channelSecret ? middleware(lineConfig) : (req: any, res: any, next: any) => next();
  
  app.post("/api/line/webhook", (req, res, next) => {
    if (!hasLineConfig) {
      // If config is missing, we still want to log that we received something
      console.log("⚠️ LINE Webhook received but LINE_CHANNEL_SECRET or ACCESS_TOKEN is missing.");
      // We need express.json() for this specific case if we want to see the body, 
      // but since we can't reply anyway, we just end.
      return res.status(200).send("Config missing");
    }
    next();
  }, lineMiddleware, async (req, res) => {
    console.log("📩 LINE Webhook Verified & Received!");
    try {
      const events: WebhookEvent[] = req.body.events;
      if (!events || !Array.isArray(events)) {
        console.warn("⚠️ Received LINE webhook with no events array in body.");
        return res.json({ success: true, warning: 'no_events' });
      }
      console.log(`📦 Received ${events.length} LINE events`);
      await Promise.all(events.map(handleLineEvent));
      res.json({ success: true });
    } catch (err) {
      console.error("❌ LINE Webhook Error during processing:", err);
      res.status(500).end();
    }
  });

  // 3. General Middlewares
  app.use(express.json());

  app.use((req, res, next) => {
    if (req.url !== "/api/line/webhook") {
      console.log(`${new Date().toISOString()} ${req.method} ${req.url}`);
    }
    next();
  });

  // API: Taiwan Calendar Proxy
  app.get("/api/taiwan-calendar", async (req, res) => {
    const year = req.query.year || new Date().getFullYear();
    try {
      const response = await axios.get(`https://cdn.jsdelivr.net/gh/ruyut/TaiwanCalendar/data/${year}.json`, { timeout: 8000 });
      const rawData = response.data;
      
      const holidays: Record<string, string> = {};
      const makeupWorkdays: Record<string, string> = {};
      
      if (Array.isArray(rawData)) {
        rawData.forEach((day: any) => {
          if (day.date && day.date.length === 8) {
            const formattedDate = `${day.date.substring(0, 4)}-${day.date.substring(4, 6)}-${day.date.substring(6, 8)}`;
            if (day.isHoliday) {
              if (day.description && !day.description.includes("星期")) {
                holidays[formattedDate] = day.description;
              }
            } else if (day.description && (day.description.includes("補") || day.description.includes("上班"))) {
              makeupWorkdays[formattedDate] = day.description;
            }
          }
        });
      }
      res.json({ holidays, makeupWorkdays });
    } catch (error: any) {
      console.error("Taiwan Calendar Proxy Error:", error.message);
      res.status(500).json({ error: "Failed to fetch Taiwan calendar" });
    }
  });

  // API: Config Status
  app.get("/api/config-status", (req, res) => {
    res.json({
      firebase: !!process.env.FIREBASE_SERVICE_ACCOUNT_KEY,
      line: !!(process.env.LINE_CHANNEL_ACCESS_TOKEN && process.env.LINE_GROUP_ID),
      google: false
    });
  });

  // API: Get Events
  app.get("/api/events", async (req, res) => {
    try {
      const database = getDb();
      if (!database) throw new Error("DB not initialized");
      const snapshot = await database.collection('events').get();
      const events = snapshot.docs.map((doc: any) => ({ id: doc.id, ...doc.data() }));
      res.json({ events, source: 'firestore' });
    } catch (error: any) {
      console.error("❌ GET /api/events Error:", error);
      res.status(500).json({ error: error.message });
    }
  });

  // API: Create Event
  app.post("/api/events", async (req, res) => {
    try {
      const database = getDb();
      if (!database) throw new Error("DB not initialized");
      const id = uuidv4();
      const eventData = { ...req.body, id, createdAt: FieldValue.serverTimestamp() };
      await database.collection('events').doc(id).set(eventData);
      
      // 為了節省 LINE 的免費 Push 額度，我們取消「新增今日行程就推播」的功能
      // 只保留每日早上的總結推播，以及 1 小時前的重要提醒
      res.json({ success: true, id, event: eventData });
    } catch (error: any) {
      console.error("❌ POST /api/events Error:", error);
      res.status(500).json({ error: error.message });
    }
  });

  // API: Update Event
  app.put("/api/events/:id", async (req, res) => {
    try {
      const { id } = req.params;
      const database = getDb();
      if (!database) throw new Error("DB not initialized");
      await database.collection('events').doc(id).update({ ...req.body, updatedAt: FieldValue.serverTimestamp() });
      res.json({ success: true });
    } catch (error: any) {
      console.error(`❌ PUT /api/events/${req.params.id} Error:`, error);
      res.status(500).json({ error: error.message });
    }
  });

  // API: Delete Event
  app.delete("/api/events/:id", async (req, res) => {
    try {
      const { id } = req.params;
      const database = getDb();
      if (!database) throw new Error("DB not initialized");
      await database.collection('events').doc(id).delete();
      res.json({ success: true });
    } catch (error: any) {
      console.error(`❌ DELETE /api/events/${req.params.id} Error:`, error);
      res.status(500).json({ error: error.message });
    }
  });

  // API: Daily Push (Cron)
  app.get("/api/cron/daily-push", async (req, res) => {
    try {
      const groupId = process.env.LINE_GROUP_ID;
      if (!groupId) {
        return res.json({ success: false, message: "⚠️ 缺少 LINE_GROUP_ID 環境變數。系統不知道推播要傳到哪個群組去！請先將機器人邀請至群組，複製紀錄的 ID 並設定到環境變數中。" });
      }

      const database = getDb();
      if (!database) throw new Error("DB not initialized");
      
      const tz = "Asia/Taipei";
      const now = new Date();
      const todayStr = new Date(now.toLocaleString("en-US", { timeZone: tz })).toLocaleDateString("zh-TW", { year: 'numeric', month: '2-digit', day: '2-digit' }).replace(/\//g, '-');
      const [yyyy] = todayStr.split('-');

      const snapshot = await database.collection('events').get();
      const events = snapshot.docs.map((doc: any) => ({ ...doc.data() }));
      const todaysEvents = events.filter((e: any) => e.start_date === todayStr || (e.start_date <= todayStr && e.end_date >= todayStr));

      const [weather, holiday] = await Promise.all([getTodayWeather(), getTodayHoliday(parseInt(yyyy), todayStr)]);
      // if (todaysEvents.length === 0 && !holiday) return res.json({ success: true, message: "No events" });

      let msg = `📅 【今日家庭行事曆】 ${todayStr}\n`;
      if (holiday) msg += `🎈 節日：${holiday}\n`;
      if (weather) msg += `⛅ 天氣：${weather}\n\n`;

      if (todaysEvents.length > 0) {
        todaysEvents.sort((a: any, b: any) => (b.is_important ? 1 : 0) - (a.is_important ? 1 : 0));
        todaysEvents.forEach((e: any, i: number) => {
          msg += `${e.is_important ? '⭐' : '📌'} ${i+1}. ${e.title}\n`;
          if (e.member_name) msg += `👤 ${e.member_name}${e.companions ? ' + ' + e.companions : ''}\n`;
          if (e.time) msg += `⏰ ${e.time}\n\n`;
        });
      } else {
        msg += `✨ 今日無特別排程活動`;
      }

      await sendLineNotification(msg.trim());
      res.json({ success: true, count: todaysEvents.length });
    } catch (error: any) {
      console.error("❌ GET /api/cron/daily-push Error:", error);
      res.status(500).json({ error: error.message });
    }
  });

  // API: Hourly Important Reminder (Cron)
  app.get("/api/cron/hourly-reminder", async (req, res) => {
    try {
      const database = getDb();
      if (!database) throw new Error("DB not initialized");

      const tz = "Asia/Taipei";
      const now = new Date();
      // 我們要找「現在 + 1小時」的行程
      const targetTime = new Date(now.getTime() + 60 * 60 * 1000);
      const targetDateStr = new Date(targetTime.toLocaleString("en-US", { timeZone: tz })).toLocaleDateString("zh-TW", { year: 'numeric', month: '2-digit', day: '2-digit' }).replace(/\//g, '-');
      const targetTimeStr = targetTime.toLocaleTimeString("zh-TW", { timeZone: tz, hour12: false, hour: '2-digit', minute: '2-digit' });
      
      console.log(`📡 Checking for important reminders at ${targetDateStr} around ${targetTimeStr}`);

      const snapshot = await database.collection('events').get();
      const events = snapshot.docs.map((doc: any) => ({ ...doc.data() }));
      
      // 篩選：標記為重要、日期正確、且時間在 1 小時後 (允許 +/- 5 分鐘誤差以配合 Cron 頻率)
      const reminders = events.filter((e: any) => {
        if (!e.is_important || !e.time || e.start_date !== targetDateStr) return false;
        
        // 解析時間格式如 "14:30"
        const [h, m] = e.time.split(':').map(Number);
        const [th, tm] = targetTimeStr.split(':').map(Number);
        
        // 比對小時與分鐘 (在目標分鐘的前後 5 分鐘內)
        const eventTotalMins = h * 60 + m;
        const targetTotalMins = th * 60 + tm;
        
        return Math.abs(eventTotalMins - targetTotalMins) <= 5;
      });

      if (reminders.length === 0) {
        return res.json({ success: true, message: "No reminders due" });
      }

      for (const e of reminders) {
        let msg = `🔔 【重要行程提醒】\n活動將在 1 小時後開始！\n\n📌 主旨：${e.title}\n🕒 時間：${e.time}\n👤 對象：${e.member_name}\n`;
        if (e.description) msg += `📝 備註：${e.description}`;
        await sendLineNotification(msg.trim());
      }

      res.json({ success: true, count: reminders.length });
    } catch (error: any) {
      console.error("❌ GET /api/cron/hourly-reminder Error:", error);
      res.status(500).json({ error: error.message });
    }
  });

  async function handleLineEvent(event: WebhookEvent) {
    if (!lineClient) return;
    console.log(`🔍 Processing event type: ${event.type}`);

    // 加入群組時回傳 ID
    if (event.type === 'join') {
      const source = event.source;
      const id = source.type === 'group' ? source.groupId : 'unknown';
      console.log(`👋 Joined a ${source.type}, ID: ${id}`);
      return lineClient.replyMessage(event.replyToken, { 
        type: 'text', 
        text: `機器人已就位！\n目前的群組/聊天 ID 是：\n${id}\n\n請將此 ID 設定至環境變數 LINE_GROUP_ID 以啟用推播功能。` 
      });
    }

    if (event.type === 'message' && event.message.type === 'text') {
      const text = event.message.text.trim();
      console.log(`💬 Received message: "${text}" from ${event.source.type}`);

      // 指令 1: 取得 ID
      if (text.toLowerCase() === 'id' || text === '群組id' || text === '我的id') {
        const id = (event.source as any).groupId || (event.source as any).userId;
        return lineClient.replyMessage(event.replyToken, { type: 'text', text: `您的 ID 是：\n${id}` });
      }

      // 指令 4: 重要行程 (先判斷重要行程，避免被下方的「人名+行程」誤認)
      if (text === '重要行程' || text === '重要' || text === '重要事項') {
        try {
          const database = getDb();
          if (!database) {
            return lineClient.replyMessage(event.replyToken, { type: 'text', text: '抱歉，資料庫連線中，請稍後再試。' });
          }
          
          const nowStr = new Date().toISOString().split('T')[0];
          const snapshot = await database.collection('events').get();
          const allEvents = snapshot.docs.map((doc: any) => doc.data());
          
          // 篩選未來的重要行程
          let filtered = allEvents.filter((e: any) => e.is_important === true && (e.end_date || e.start_date) >= nowStr);
          
          // 排序
          filtered.sort((a: any, b: any) => a.start_date.localeCompare(b.start_date));

          if (filtered.length === 0) {
            return lineClient.replyMessage(event.replyToken, { type: 'text', text: '🔔 目前沒有標記為重要的未來行程喔！' });
          }

          let msg = `🌟 置頂重要行程公告：\n\n`;
          filtered.forEach((e: any, index: number) => {
            msg += `${index + 1}. [${e.start_date.slice(5)}] ${e.title}\n`;
            if (e.member_name) msg += `   👤 負責：${e.member_name}\n`;
            if (e.description) msg += `   📝 備註：${e.description}\n`;
            msg += '\n';
          });
          
          return lineClient.replyMessage(event.replyToken, { type: 'text', text: msg.trim() });
        } catch (dbErr) {
          console.error("❌ Database query failed in LINE event:", dbErr);
          return lineClient.replyMessage(event.replyToken, { type: 'text', text: '讀取重要行程時發生錯誤。' });
        }
      }

      // 指令 2: 行程查詢系列
      if (text === '今天行程' || text === '今日行程' || text === '當日行程' || text === '明天行程' || text === '明日行程' || text === '近期行程' || text === '本週行程' || text.endsWith('行程')) {
        try {
          const database = getDb();
          if (!database) {
            return lineClient.replyMessage(event.replyToken, { type: 'text', text: '抱歉，資料庫連線中，請稍後再試。' });
          }
          
          const tz = "Asia/Taipei";
          const now = new Date();
          let targetDate = new Date(now.toLocaleString("en-US", { timeZone: tz }));
          let isRange = false;
          let rangeDays = 1;
          let filterMember = "";

          // 判斷日期
          if (text.includes('明天') || text.includes('明日')) {
            targetDate.setDate(targetDate.getDate() + 1);
          } else if (text.includes('近期') || text.includes('本週')) {
            isRange = true;
            rangeDays = 7;
          }

          // 判斷人名 (例如: 小明行程)
          if (text.endsWith('行程') && !['今天','今日','當日','明天','明日','近期','本週','重要'].some(k => text.startsWith(k))) {
            filterMember = text.replace('行程', '');
            // 針對特定成員查詢，預設顯示近 7 天
            isRange = true;
            rangeDays = 7;
          }

          const formatDate = (d: Date) => d.toISOString().split('T')[0];
          const startDateStr = formatDate(targetDate);
          const endDate = new Date(targetDate);
          endDate.setDate(endDate.getDate() + (rangeDays - 1));
          const endDateStr = formatDate(endDate);

          // 獲取所有重要行程 (未過期的)
          const nowStr = new Date().toISOString().split('T')[0];
          const snapshot = await database.collection('events').get();
          const allEvents = snapshot.docs.map((doc: any) => doc.data());
          
          const importantEvents = allEvents.filter((e: any) => e.is_important === true && (e.end_date || e.start_date) >= nowStr)
                                         .sort((a: any, b: any) => a.start_date.localeCompare(b.start_date));

          let filtered = allEvents.filter((e: any) => {
            const evStart = e.start_date;
            const evEnd = e.end_date || evStart;
            // 日期重疊邏輯
            const dateMatch = isRange 
              ? (evStart <= endDateStr && evEnd >= startDateStr)
              : (evStart <= startDateStr && evEnd >= startDateStr);
            
            const memberMatch = filterMember ? e.member_name.includes(filterMember) : true;
            return dateMatch && memberMatch;
          });

          // 排序
          filtered.sort((a: any, b: any) => a.start_date.localeCompare(b.start_date) || (a.time || "").localeCompare(b.time || ""));

          if (filtered.length === 0 && importantEvents.length === 0) {
            let emptyMsg = `📅 ${isRange ? startDateStr + ' ~ ' + endDateStr : startDateStr}\n`;
            emptyMsg += filterMember ? `找不到 ${filterMember} 的行程喔！` : `沒有排定的行程喔！✨`;
            return lineClient.replyMessage(event.replyToken, { type: 'text', text: emptyMsg });
          }

          let msg = "";
          
          // 如果有重要行程且不是在查特定人
          if (importantEvents.length > 0 && !filterMember) {
            msg += `🌟 【置頂重要公告】\n`;
            importantEvents.forEach((e: any) => {
              msg += `📍 [${e.start_date.slice(5)}] ${e.title}${e.time ? ' (' + e.time + ')' : ''}\n`;
            });
            msg += `──────────────\n`;
          }

          msg += `📅 ${isRange ? '本週' : (text.includes('明天') ? '明天' : '今日')}行程摘要${filterMember ? '(' + filterMember + ')' : ''}：\n\n`;
          
          if (filtered.length > 0) {
            filtered.forEach((e: any, index: number) => {
              msg += `${index + 1}. ${isRange ? '[' + e.start_date.slice(5) + '] ' : ''}[${e.member_name}] ${e.title}`;
              if (e.time) msg += ` (${e.time})`;
              msg += '\n';
            });
          } else {
            msg += `(此時段暫無一般行程)\n`;
          }
          
          return lineClient.replyMessage(event.replyToken, { type: 'text', text: msg.trim() });
        } catch (dbErr) {
          console.error("❌ Database query failed in LINE event:", dbErr);
          return lineClient.replyMessage(event.replyToken, { type: 'text', text: '讀取行程時發生錯誤，請聯絡管理員。' });
        }
      }

      // 指令 3: 天氣狀況
      if (text === '天氣' || text === '現在天氣' || text === '今日天氣') {
        const weather = await getTodayWeather();
        const holiday = await getTodayHoliday(new Date().getFullYear(), new Date().toISOString().split('T')[0]);
        let msg = `⛅ 目前氣象狀況：\n${weather || '暫時無法取得天氣資訊'}`;
        if (holiday) msg += `\n\n🏮 今日節慶：${holiday}`;
        return lineClient.replyMessage(event.replyToken, { type: 'text', text: msg });
      }

      // 指令 5: 指令說明
      if (text === '幫助' || text === '說明' || text === 'help') {
        return lineClient.replyMessage(event.replyToken, { 
          type: 'text', 
          text: '🤖 機器人指令說明：\n\n' +
                '1. 「今天行程」：看今天的排程\n' +
                '2. 「明天行程」：看明天的排程\n' +
                '3. 「近期行程」：看未來一週的排程\n' +
                '4. 「[人名]行程」：看特定人的行程 (如: 小明行程)\n' +
                '5. 「重要行程」：查看所有標記為重要的活動\n' +
                '6. 「天氣」：看目前天氣與節慶\n' +
                '7. 「id」：取得對話 ID\n' +
                '8. 「幫助」：顯示此說明' 
        });
      }
    }
  }

  // Static/SPA Fallback
  if (process.env.NODE_ENV !== "production") {
    const { createServer: createViteServer } = await import("vite");
    const vite = await createViteServer({ server: { middlewareMode: true }, appType: "spa" });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => res.sendFile(path.join(distPath, 'index.html')));
  }

  // --- Internal Cron Setup ---
  // Note: These will only run while the container/server is awake. In Serverless environments,
  // containers may sleep after inactivity.
  cron.schedule('0 7 * * *', async () => {
    console.log("⏰ Running internal daily push cron...");
    try {
      await axios.get(`http://localhost:${PORT}/api/cron/daily-push`);
    } catch(e: any) { console.error("Cron daily push failed:", e.message); }
  }, { timezone: 'Asia/Taipei' });

  cron.schedule('*/5 * * * *', async () => {
    console.log("⏰ Running internal hourly reminder cron...");
    try {
      await axios.get(`http://localhost:${PORT}/api/cron/hourly-reminder`);
    } catch(e: any) { console.error("Cron hourly reminder failed:", e.message); }
  });

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });

  return app;
}

export const appPromise = startServer();
