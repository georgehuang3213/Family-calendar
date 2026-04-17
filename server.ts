import express from "express";
import path from "path";
import dotenv from "dotenv";
import axios from "axios";
import { v4 as uuidv4 } from 'uuid';
import { middleware, Client, WebhookEvent } from '@line/bot-sdk';
import { initializeApp, cert, getApp, getApps } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import fs from "fs";

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
  if (!lineClient || !groupId) return;
  try {
    await lineClient.pushMessage(groupId, { type: 'text', text: message });
    console.log("✅ LINE notification sent");
  } catch (err: any) {
    console.error("❌ LINE notification failed:", err.message);
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

  app.use(express.json());

  // Logging middleware
  app.use((req, res, next) => {
    console.log(`${new Date().toISOString()} ${req.method} ${req.url}`);
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
      
      const today = new Date().toLocaleDateString("zh-TW", { timeZone: "Asia/Taipei", year: 'numeric', month: '2-digit', day: '2-digit' }).replace(/\//g, '-');
      if (eventData.start_date === today) {
          let msg = `⏰ 【新行程通知】${eventData.member_name} 新增了行程：\n📌 ${eventData.title}`;
          if (eventData.time) msg += `\n🕒 時間：${eventData.time}`;
          sendLineNotification(msg);
      }
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
      if (todaysEvents.length === 0 && !holiday) return res.json({ success: true, message: "No events" });

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

  // LINE Webhook
  const lineMiddleware = lineConfig.channelSecret ? middleware(lineConfig) : (req: any, res: any, next: any) => next();
  app.post("/api/line/webhook", lineMiddleware, async (req, res) => {
    if (!lineClient) return res.sendStatus(200);
    try {
      const events: WebhookEvent[] = req.body.events;
      await Promise.all(events.map(handleLineEvent));
      res.json({ success: true });
    } catch (err) {
      console.error("❌ LINE Webhook Error:", err);
      res.status(500).end();
    }
  });

  async function handleLineEvent(event: WebhookEvent) {
    if (!lineClient) return;
    if (event.type === 'join' && event.source.type === 'group') {
      return lineClient.replyMessage(event.replyToken, { type: 'text', text: `機器人已加入！群組 ID：\n${event.source.groupId}` });
    }
    if (event.type === 'message' && event.message.type === 'text') {
      const text = event.message.text.trim().toLowerCase();
      if (text === 'id') {
        const id = event.source.type === 'group' ? event.source.groupId : event.source.userId;
        return lineClient.replyMessage(event.replyToken, { type: 'text', text: `ID：${id}` });
      }
      if (text === '今天行程' || text === '今日行程') {
        const database = getDb();
        if (!database) return;
        const todayStr = new Date().toLocaleDateString("zh-TW", { timeZone: "Asia/Taipei", year: 'numeric', month: '2-digit', day: '2-digit' }).replace(/\//g, '-');
        const snapshot = await database.collection('events').get();
        const events = snapshot.docs.map((doc: any) => doc.data());
        const filtered = events.filter((e: any) => e.start_date === todayStr || (e.start_date <= todayStr && e.end_date >= todayStr));
        
        let msg = filtered.length > 0 
          ? filtered.map((e: any) => `• ${e.title} (${e.member_name})`).join('\n')
          : '今天沒有排定的行程喔！';
        return lineClient.replyMessage(event.replyToken, { type: 'text', text: `📅 今日行程：\n${msg}` });
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

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });

  return app;
}

export const appPromise = startServer();
