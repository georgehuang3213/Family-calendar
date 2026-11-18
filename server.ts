import express from 'express';
import path from 'path';
import dotenv from 'dotenv';
import axios from 'axios';
import crypto from 'crypto';
import fs from 'fs';
import { v4 as uuidv4 } from 'uuid';
import { middleware, Client, WebhookEvent } from '@line/bot-sdk';
import { FieldValue } from 'firebase-admin/firestore';
import { FAMILY_MEMBERS, MEMBER_COLORS, DEFAULT_QUICK_ADD_PRESETS } from './shared/constants.js';
import { getDb, getEventsRev, bumpEventsRev } from './lib/firebaseAdmin.js';
import {
  formatTaipeiDate,
  formatTaipeiHHmm,
  getTaipeiYear,
  addDaysToDateStr,
  normalizeEventDate,
  isValidCalendarDate,
} from './lib/taipeiTime.js';
import { askChatGPT, transcribeAudio } from './gptService.js';

dotenv.config();

// --- Debug Logging Setup ---
const MAX_WEBHOOK_LOG_LINES = 200;
const webhookLogBuffer: string[] = [];

export function logToDebugFile(message: string) {
  const timestamp = new Date().toISOString();
  const entry = `[${timestamp}] ${message}`;
  webhookLogBuffer.push(entry);
  if (webhookLogBuffer.length > MAX_WEBHOOK_LOG_LINES) {
    webhookLogBuffer.splice(0, webhookLogBuffer.length - MAX_WEBHOOK_LOG_LINES);
  }
  console.log(`📝 [DEBUG LOG] ${message}`);

  if (!process.env.VERCEL) {
    try {
      fs.appendFileSync(path.join(process.cwd(), 'webhook_logs.txt'), `${entry}\n`, 'utf8');
    } catch (e) {
      console.error('Failed to write to debug file:', e);
    }
  }
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
    console.error('⚠️ Failed to initialize LINE client:', e.message);
  }
}

async function sendLineNotification(message: string) {
  const groupId = process.env.LINE_GROUP_ID;
  if (!lineClient) {
    throw new Error('lineClient 尚未初始化，請檢查 LINE_CHANNEL_ACCESS_TOKEN 與 LINE_CHANNEL_SECRET');
  }
  if (!groupId) {
    throw new Error('環境變數中缺少 LINE_GROUP_ID');
  }
  try {
    await lineClient.pushMessage(groupId, { type: 'text', text: message });
    console.log('✅ LINE notification sent');
  } catch (err: any) {
    console.error('❌ LINE notification failed:', err.originalError?.response?.data || err.message);
    const detail = err.originalError?.response?.data?.message || err.message;
    throw new Error(
      `LINE 推播被拒絕: ${detail} (請檢查 LINE_GROUP_ID 是否正確，以 C/U/R 開頭，且機器人沒有被踢出群組)`
    );
  }
}

// --- Security Helpers ---
function safeEqual(a: string, b: string): boolean {
  if (!a || !b) return false;
  const hashA = crypto.createHash('sha256').update(a).digest();
  const hashB = crypto.createHash('sha256').update(b).digest();
  return crypto.timingSafeEqual(hashA, hashB);
}

// --- Helper Functions ---
async function getTodayWeather(overrideLat?: number, overrideLon?: number, overrideLocationName?: string) {
  try {
    let lat = overrideLat ?? 24.18; // Default Taichung Beitun District
    let lon = overrideLon ?? 120.697;
    let locationName = overrideLocationName ? ` (${overrideLocationName})` : '';

    if (overrideLat === undefined && overrideLon === undefined) {
      try {
        const database = getDb();
        if (database) {
          const doc = await database.collection('system_config').doc('weather').get();
          if (doc.exists) {
            const data = doc.data();
            if (typeof data?.lat === 'number' && typeof data?.lon === 'number') {
              lat = data.lat;
              lon = data.lon;
              locationName = data.locationName ? ` (${data.locationName})` : '';
            }
          }
        }
      } catch {
        console.log('Could not fetch weather config from DB, using default location.');
      }
    }

    const response = await axios.get(
      `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,weather_code&timezone=Asia%2FTaipei`,
      { timeout: 8000 }
    );
    const weatherCode = response.data.current.weather_code;
    const temp = response.data.current.temperature_2m;
    const descriptions: Record<number, string> = {
      0: '晴朗',
      1: '晴時多雲',
      2: '多雲',
      3: '陰天',
      45: '霧',
      48: '濃霧',
      51: '毛毛雨 (輕)',
      53: '毛毛雨 (中)',
      55: '毛毛雨 (強)',
      56: '凍毛毛雨',
      57: '強凍毛毛雨',
      61: '小雨',
      63: '中雨',
      65: '大雨',
      66: '凍雨',
      67: '強凍雨',
      71: '小雪',
      73: '中雪',
      75: '大雪',
      77: '雪粒',
      80: '陣雨',
      81: '強陣雨',
      82: '暴雨',
      85: '陣雪',
      86: '強陣雪',
      95: '雷陣雨',
      96: '雷陣雨伴隨冰雹',
      99: '強雷陣雨伴隨冰雹',
    };
    return `${descriptions[weatherCode] || '未知 (代碼:' + weatherCode + ')'}，氣溫 ${temp}°C${locationName}`;
  } catch {
    return null;
  }
}

async function getTodayHoliday(year: number, dateStrYYYYMMDD: string) {
  try {
    const response = await axios.get(
      `https://cdn.jsdelivr.net/gh/ruyut/TaiwanCalendar/data/${year}.json`,
      { timeout: 8000 }
    );
    const formattedDate = dateStrYYYYMMDD.replace(/-/g, '');
    const dayData = Array.isArray(response.data)
      ? response.data.find((d: any) => d.date === formattedDate)
      : null;
    if (dayData && dayData.isHoliday && dayData.description && !dayData.description.includes('星期')) {
      return dayData.description;
    }
    return null;
  } catch {
    return null;
  }
}

// --- REST 事件欄位驗證與白名單過濾 ---
const EVENT_COLOR_RE = /^#[0-9A-Fa-f]{6}$/;

function validateEventFields(body: any, isCreate: boolean): string | null {
  if (!body || typeof body !== 'object') return '請求格式錯誤';

  if (isCreate) {
    if (typeof body.title !== 'string' || !body.title.trim()) return 'title 為必填字串';
    if (!isValidCalendarDate(body.start_date)) return 'start_date 格式需為有效日期 YYYY-MM-DD';
    if (!isValidCalendarDate(body.end_date)) return 'end_date 格式需為有效日期 YYYY-MM-DD';
    if (typeof body.member_name !== 'string' || !(FAMILY_MEMBERS as readonly string[]).includes(body.member_name)) {
      return 'member_name 不在家庭成員名單內';
    }
  } else {
    if (body.title !== undefined && (typeof body.title !== 'string' || !body.title.trim())) return 'title 不可為空字串';
    if (body.start_date !== undefined && !isValidCalendarDate(body.start_date)) {
      return 'start_date 格式需為有效日期 YYYY-MM-DD';
    }
    if (body.end_date !== undefined && !isValidCalendarDate(body.end_date)) {
      return 'end_date 格式需為有效日期 YYYY-MM-DD';
    }
    if (body.member_name !== undefined && !(FAMILY_MEMBERS as readonly string[]).includes(body.member_name)) {
      return 'member_name 不在家庭成員名單內';
    }
  }

  if (body.start_date !== undefined && body.end_date !== undefined && body.end_date < body.start_date) {
    return 'end_date 不可早於 start_date';
  }
  if (body.color !== undefined && body.color !== '' && !EVENT_COLOR_RE.test(body.color)) {
    return 'color 格式需為 #RRGGBB';
  }
  if (body.title !== undefined && typeof body.title === 'string' && body.title.trim().length > 200) {
    return 'title 過長（上限 200 字）';
  }
  if (body.description !== undefined && (typeof body.description !== 'string' || body.description.length > 2000)) {
    return 'description 需為不超過 2000 字的字串';
  }
  if (body.time !== undefined && (typeof body.time !== 'string' || body.time.length > 50)) {
    return 'time 需為不超過 50 字的字串';
  }
  if (body.companions !== undefined && (typeof body.companions !== 'string' || body.companions.length > 500)) {
    return 'companions 需為不超過 500 字的字串';
  }
  if (body.is_important !== undefined && typeof body.is_important !== 'boolean') {
    return 'is_important 需為布林值';
  }
  return null;
}

/** Pick only allowlisted Event fields so client metadata (action, start_time, syncing, stale createdAt...) never pollutes Firestore. */
function pickAllowedEventFields(body: any, isCreate: boolean): Record<string, any> {
  const picked: Record<string, any> = {};

  if (body.title !== undefined) picked.title = body.title.trim();
  if (body.start_date !== undefined) picked.start_date = body.start_date;
  if (body.end_date !== undefined) picked.end_date = body.end_date;
  if (body.member_name !== undefined) picked.member_name = body.member_name;

  if (body.description !== undefined) picked.description = body.description;
  else if (isCreate) picked.description = '';

  if (body.time !== undefined) picked.time = body.time.trim();
  else if (isCreate) picked.time = '';

  if (body.companions !== undefined) picked.companions = body.companions;
  else if (isCreate) picked.companions = '';

  if (body.is_important !== undefined) picked.is_important = body.is_important;
  else if (isCreate) picked.is_important = false;

  if (typeof body.color === 'string' && EVENT_COLOR_RE.test(body.color)) {
    picked.color = body.color;
  } else if (isCreate) {
    picked.color = MEMBER_COLORS[body.member_name] || '#4F46E5';
  }

  return picked;
}

function validateQuickAddPresets(presets: any): string | null {
  if (!Array.isArray(presets)) return 'presets 需為陣列';
  if (presets.length > 20) return 'presets 最多 20 筆';
  const seenIds = new Set<string>();
  for (const p of presets) {
    if (typeof p?.id !== 'string' || !p.id.trim() || p.id.length > 100) return '每個項目需要 1~100 字的 id';
    if (seenIds.has(p.id)) return `id 重複：${p.id}`;
    seenIds.add(p.id);
    if (typeof p?.title !== 'string' || !p.title.trim() || p.title.length > 20) return '每個項目需要 1~20 字的 title';
  }
  return null;
}

const AI_TRIGGERS = ['ai ', 'ai:', 'ai：', 'gpt ', 'gpt:', 'gpt：', '詢問 ', '機器人', '小幫手'];

function extractMemberScheduleQuery(text: string): string | null {
  const lower = text.toLowerCase();
  if (AI_TRIGGERS.some((t) => lower.startsWith(t))) return null;

  const fixedScheduleCommands = ['今天行程', '今日行程', '當日行程', '明天行程', '明日行程', '近期行程', '本週行程'];
  if (fixedScheduleCommands.includes(text)) return null;

  if (!text.endsWith('行程')) return null;
  let candidate = text.slice(0, -2).trim();
  if (candidate.endsWith('的')) candidate = candidate.slice(0, -1).trim();

  if (!candidate || candidate.length > 4) return null;
  const reservedPrefixes = ['今天', '今日', '當日', '明天', '明日', '近期', '本週', '重要'];
  if (reservedPrefixes.includes(candidate)) return null;

  const matchesMember = (FAMILY_MEMBERS as readonly string[]).some(
    (m) => m !== '全家' && m.includes(candidate)
  );
  return matchesMember ? candidate : null;
}

async function startServer() {
  const app = express();
  const PORT = Number(process.env.PORT) || 3000;

  // 1. Logging middleware (Top level, before LINE signature middleware)
  app.use((req, res, next) => {
    if (req.path === '/api/line/webhook') {
      const originalSend = res.send;
      const originalEnd = res.end;
      const originalStatus = res.status;

      let resBody = '';
      let statusCode = 200;

      res.status = function (code: any) {
        statusCode = code;
        return originalStatus.apply(this, arguments as any);
      };

      res.send = function (chunk: any) {
        if (chunk) resBody += chunk.toString();
        return originalSend.apply(this, arguments as any);
      };

      res.end = function (chunk: any) {
        if (chunk) {
          if (Buffer.isBuffer(chunk)) {
            resBody += chunk.toString('utf8');
          } else if (typeof chunk === 'string') {
            resBody += chunk;
          } else {
            resBody += JSON.stringify(chunk);
          }
        }
        logToDebugFile(`Response ended with status ${statusCode}. Body: ${resBody}`);
        return originalEnd.apply(this, arguments as any);
      };

      const safeHeaderSummary = {
        'content-type': req.headers['content-type'],
        'user-agent': req.headers['user-agent'],
        'has-x-line-signature': Boolean(req.headers['x-line-signature']),
      };
      logToDebugFile(`IncomingWebhook: ${req.method} ${req.path} | Headers: ${JSON.stringify(safeHeaderSummary)}`);
    }
    next();
  });

  // 2. LINE Webhook
  const hasLineConfig = !!(lineConfig.channelAccessToken && lineConfig.channelSecret);
  const lineMiddleware = lineConfig.channelSecret
    ? middleware(lineConfig)
    : (_req: any, _res: any, next: any) => next();

  app.post(
    '/api/line/webhook',
    (req, res, next) => {
      if (!hasLineConfig) {
        console.log('⚠️ LINE Webhook received but LINE_CHANNEL_SECRET or ACCESS_TOKEN is missing.');
        return res.status(200).send('Config missing');
      }
      next();
    },
    lineMiddleware,
    async (req, res) => {
      logToDebugFile('📩 LINE Webhook Verified & Received!');
      try {
        const events: WebhookEvent[] = req.body.events;
        if (!events || !Array.isArray(events)) {
          logToDebugFile('⚠️ Received LINE webhook with no events array in body.');
          return res.json({ success: true, warning: 'no_events' });
        }
        logToDebugFile(`📦 Received ${events.length} LINE events: ${JSON.stringify(events)}`);
        await Promise.all(events.map(handleLineEvent)).catch((err) => {
          logToDebugFile(`❌ Async line event error: ${err.message}`);
          console.error('❌ Async line event error:', err);
        });
        res.json({ success: true });
      } catch (err) {
        console.error('❌ LINE Webhook Error during processing:', err);
        res.status(500).end();
      }
    }
  );

  // 3. General Middlewares
  app.use(express.json({ limit: '1mb' }));

  app.use((req, _res, next) => {
    if (req.url !== '/api/line/webhook') {
      console.log(`${new Date().toISOString()} ${req.method} ${req.url}`);
    }
    next();
  });

  // --- 家庭通行碼驗證 (Shared Family Access Key) ---
  const FAMILY_ACCESS_KEY = process.env.FAMILY_ACCESS_KEY || '';
  const familyKeyFailures = new Map<string, { count: number; firstFailAt: number }>();
  const FAMILY_KEY_MAX_FAILURES = 10;
  const FAMILY_KEY_WINDOW_MS = 15 * 60 * 1000;

  function getClientIp(req: any): string {
    const fwd = req.headers['x-forwarded-for'];
    if (typeof fwd === 'string' && fwd.length > 0) return fwd.split(',')[0].trim();
    return req.socket?.remoteAddress || 'unknown';
  }

  function isFamilyKeyRateLimited(ip: string): boolean {
    const rec = familyKeyFailures.get(ip);
    if (!rec) return false;
    if (Date.now() - rec.firstFailAt > FAMILY_KEY_WINDOW_MS) {
      familyKeyFailures.delete(ip);
      return false;
    }
    return rec.count >= FAMILY_KEY_MAX_FAILURES;
  }

  function recordFamilyKeyFailure(ip: string) {
    const now = Date.now();
    if (familyKeyFailures.size > 500) {
      for (const [key, rec] of familyKeyFailures) {
        if (now - rec.firstFailAt > FAMILY_KEY_WINDOW_MS) familyKeyFailures.delete(key);
      }
    }
    const rec = familyKeyFailures.get(ip);
    if (!rec || now - rec.firstFailAt > FAMILY_KEY_WINDOW_MS) {
      familyKeyFailures.set(ip, { count: 1, firstFailAt: now });
    } else {
      rec.count += 1;
    }
  }

  function requireFamilyKey(req: any, res: any, next: any) {
    if (!FAMILY_ACCESS_KEY) {
      return res.status(503).json({ error: '伺服器尚未設定 FAMILY_ACCESS_KEY 環境變數，API 已封鎖以保護資料。' });
    }
    const ip = getClientIp(req);
    if (isFamilyKeyRateLimited(ip)) {
      return res.status(429).json({ error: '嘗試次數過多，請 15 分鐘後再試。' });
    }
    const provided = typeof req.headers['x-family-key'] === 'string' ? req.headers['x-family-key'] : '';
    if (!safeEqual(provided, FAMILY_ACCESS_KEY)) {
      recordFamilyKeyFailure(ip);
      return res.status(401).json({ error: '未授權：請輸入正確的家庭通行碼。' });
    }
    familyKeyFailures.delete(ip);
    next();
  }

  // --- Cron 端點驗證 ---
  function requireCronSecret(req: any, res: any, next: any) {
    const secret = process.env.CRON_SECRET || '';
    if (!secret) {
      return res.status(503).json({ error: '伺服器尚未設定 CRON_SECRET 環境變數。' });
    }
    const auth = typeof req.headers['authorization'] === 'string' ? req.headers['authorization'] : '';
    if (!safeEqual(auth, `Bearer ${secret}`)) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    next();
  }

  // 統一閘門：保護所有 /api/*，但放行 LINE webhook 與 cron
  app.use('/api', (req, res, next) => {
    const urlPath = (req.originalUrl || req.url).split('?')[0];
    if (urlPath === '/api/line/webhook' || urlPath.startsWith('/api/cron/')) {
      return next();
    }
    return requireFamilyKey(req, res, next);
  });

  // API: 驗證家庭通行碼
  app.get('/api/auth/verify', (_req, res) => {
    res.json({ success: true });
  });

  // API: Taiwan Calendar Proxy
  app.get('/api/taiwan-calendar', async (req, res) => {
    const yearParam = req.query.year;
    const year = yearParam !== undefined ? Number(yearParam) : getTaipeiYear();
    if (!Number.isInteger(year) || year < 1900 || year > 2100) {
      return res.status(400).json({ error: 'year 參數需為 1900~2100 的整數' });
    }

    try {
      const response = await axios.get(
        `https://cdn.jsdelivr.net/gh/ruyut/TaiwanCalendar/data/${year}.json`,
        { timeout: 8000 }
      );
      const rawData = response.data;

      const holidays: Record<string, string> = {};
      const makeupWorkdays: Record<string, string> = {};

      if (Array.isArray(rawData)) {
        rawData.forEach((day: any) => {
          if (day.date && day.date.length === 8) {
            const formattedDate = `${day.date.substring(0, 4)}-${day.date.substring(4, 6)}-${day.date.substring(6, 8)}`;
            if (day.isHoliday) {
              if (day.description && !day.description.includes('星期')) {
                holidays[formattedDate] = day.description;
              }
            } else if (day.description && (day.description.includes('補') || day.description.includes('上班'))) {
              makeupWorkdays[formattedDate] = day.description;
            }
          }
        });
      }
      res.json({ holidays, makeupWorkdays });
    } catch (error: any) {
      console.error('Taiwan Calendar Proxy Error:', error.message);
      res.status(500).json({ error: 'Failed to fetch Taiwan calendar' });
    }
  });

  // API: Config Status
  app.get('/api/config-status', (_req, res) => {
    const secret = process.env.LINE_CHANNEL_SECRET || '';
    const token = process.env.LINE_CHANNEL_ACCESS_TOKEN || '';
    const groupId = process.env.LINE_GROUP_ID || '';
    const openaiKey = process.env.OPENAI_API_KEY || '';
    const firebaseKey = process.env.FIREBASE_SERVICE_ACCOUNT_KEY || '';

    let lineSecretWarning = '';
    if (secret) {
      if (/^\d+$/.test(secret)) {
        lineSecretWarning =
          '⚠️ 警告：您的 LINE_CHANNEL_SECRET 似乎純為數字（可能是誤填成了 Channel ID 囉！真正的 Channel Secret 應該是 32 碼的英文、數字混合密碼）。';
      } else if (secret.length !== 32) {
        lineSecretWarning = `⚠️ 警告：LINE_CHANNEL_SECRET 的長度為 ${secret.length} 碼（一般的 Channel Secret 應該要是 32 碼，請至 LINE Console -> Basic settings 複製真正的 Channel Secret）。`;
      }
    }

    res.json({
      firebase: !!firebaseKey,
      firebaseKeyLength: firebaseKey.length,
      line: !!(token && groupId),
      lineAccessToken: !!token,
      lineAccessTokenLength: token.length,
      lineChannelSecret: !!secret,
      lineChannelSecretLength: secret.length,
      lineSecretWarning: lineSecretWarning || null,
      lineGroupId: !!groupId,
      lineGroupIdValue: groupId ? `${groupId.substring(0, 4)}...${groupId.substring(groupId.length - 4)}` : '',
      openai: !!(openaiKey && openaiKey !== 'YOUR_OPENAI_API_KEY_HERE'),
      openaiKeyLength: openaiKey.length,
      google: false,
      env: {
        VERCEL: !!process.env.VERCEL,
        NODE_ENV: process.env.NODE_ENV || 'development',
      },
    });
  });

  // API: Webhook Logs
  app.get('/api/webhook-logs', (_req, res) => {
    try {
      if (webhookLogBuffer.length > 0) {
        return res.json({ logs: webhookLogBuffer.slice(-80).join('\n') });
      }
      const logPath = path.join(process.cwd(), 'webhook_logs.txt');
      if (!fs.existsSync(logPath)) {
        return res.json({ logs: '目前尚無任何 Webhook 記錄。請先在 LINE 聊天中發送訊息或語音。' });
      }
      const contents = fs.readFileSync(logPath, 'utf8');
      const lines = contents.trim().split('\n');
      res.json({ logs: lines.slice(-80).join('\n') });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // API: Clear Webhook Logs
  app.post('/api/webhook-logs/clear', (_req, res) => {
    try {
      webhookLogBuffer.length = 0;
      if (!process.env.VERCEL) {
        const logPath = path.join(process.cwd(), 'webhook_logs.txt');
        if (fs.existsSync(logPath)) {
          fs.unlinkSync(logPath);
        }
      }
      res.json({ success: true });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // API: AI Chat using ChatGPT
  app.post('/api/ai/chat', async (req, res) => {
    try {
      const { message, history } = req.body || {};
      if (typeof message !== 'string' || !message.trim()) {
        return res.status(400).json({ error: 'Message is required' });
      }
      if (message.length > 2000) {
        return res.status(400).json({ error: 'Message too long (max 2000 chars)' });
      }

      const currentYear = getTaipeiYear();
      const response = await askChatGPT(message.trim(), Array.isArray(history) ? history : [], currentYear);
      res.json({ success: true, reply: response.reply, actionExecuted: response.actionExecuted });
    } catch (e: any) {
      console.error('❌ POST /api/ai/chat Error:', e);
      res.status(500).json({ error: e.message });
    }
  });

  // API: Get saved weather location config
  app.get('/api/config/weather', async (_req, res) => {
    try {
      const database = getDb();
      if (!database) throw new Error('DB not initialized');
      const doc = await database.collection('system_config').doc('weather').get();
      const data = doc.exists ? doc.data() : null;
      const configured = Boolean(doc.exists && typeof data?.lat === 'number' && typeof data?.lon === 'number');
      res.json({
        configured,
        lat: data?.lat ?? null,
        lon: data?.lon ?? null,
        locationName: data?.locationName ?? '',
      });
    } catch (error: any) {
      console.error('❌ GET /api/config/weather Error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // API: Save Weather Location
  app.post('/api/config/weather', async (req, res) => {
    try {
      const { lat, lon, locationName } = req.body || {};
      if (typeof lat !== 'number' || !Number.isFinite(lat) || lat < -90 || lat > 90) {
        return res.status(400).json({ error: 'lat 需為 -90 ~ 90 之間的數字' });
      }
      if (typeof lon !== 'number' || !Number.isFinite(lon) || lon < -180 || lon > 180) {
        return res.status(400).json({ error: 'lon 需為 -180 ~ 180 之間的數字' });
      }
      if (locationName !== undefined && (typeof locationName !== 'string' || locationName.length > 100)) {
        return res.status(400).json({ error: 'locationName 需為不超過 100 字的字串' });
      }

      const database = getDb();
      if (!database) throw new Error('DB not initialized');
      await database
        .collection('system_config')
        .doc('weather')
        .set({ lat, lon, locationName: locationName || '' }, { merge: true });
      res.json({ success: true });
    } catch (error: any) {
      console.error('❌ POST /api/config/weather Error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // API: Get「一鍵新增」快速項目清單
  app.get('/api/config/quick-add-presets', async (_req, res) => {
    try {
      const database = getDb();
      if (!database) throw new Error('DB not initialized');
      const doc = await database.collection('system_config').doc('quick_add_presets').get();
      const saved = doc.exists ? doc.data()?.presets : null;
      const presets = Array.isArray(saved) && saved.length > 0 ? saved : DEFAULT_QUICK_ADD_PRESETS;
      res.json({ presets });
    } catch (error: any) {
      console.error('❌ GET /api/config/quick-add-presets Error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // API: Save「一鍵新增」快速項目清單
  app.post('/api/config/quick-add-presets', async (req, res) => {
    try {
      const validationError = validateQuickAddPresets(req.body?.presets);
      if (validationError) return res.status(400).json({ error: validationError });

      const database = getDb();
      if (!database) throw new Error('DB not initialized');
      const cleanPresets = req.body.presets.map((p: any) => ({
        id: p.id.trim(),
        title: p.title.trim(),
      }));
      await database.collection('system_config').doc('quick_add_presets').set({ presets: cleanPresets }, { merge: true });
      res.json({ success: true });
    } catch (error: any) {
      console.error('❌ POST /api/config/quick-add-presets Error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // API: Proxy Open-Meteo Weather
  app.get('/api/weather', async (req, res) => {
    try {
      const lat = req.query.latitude !== undefined ? Number(req.query.latitude) : 24.18;
      const lon = req.query.longitude !== undefined ? Number(req.query.longitude) : 120.697;
      if (!Number.isFinite(lat) || lat < -90 || lat > 90 || !Number.isFinite(lon) || lon < -180 || lon > 180) {
        return res.status(400).json({ error: 'latitude 或 longitude 參數無效' });
      }
      const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,relative_humidity_2m,weather_code,wind_speed_10m&daily=weathercode,temperature_2m_max,temperature_2m_min,precipitation_probability_max&timezone=Asia%2FTaipei&forecast_days=14`;
      const response = await axios.get(url, { timeout: 8000 });
      res.json(response.data);
    } catch (error: any) {
      console.error('❌ GET /api/weather Proxy Error:', error.message);
      res.status(500).json({ error: error.message });
    }
  });

  // API: Get Events
  app.get('/api/events', async (req, res) => {
    try {
      const database = getDb();
      if (!database) throw new Error('DB not initialized');

      const rev = await getEventsRev(database);

      const rawRev = req.query.rev;
      const clientRev = typeof rawRev === 'string' && rawRev !== '' ? Number(rawRev) : null;
      if (clientRev !== null && !Number.isNaN(clientRev) && clientRev === rev) {
        return res.json({ changed: false, rev, source: 'firestore' });
      }

      const snapshot = await database.collection('events').get();
      const events = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
      res.json({ changed: true, rev, events, source: 'firestore' });
    } catch (error: any) {
      console.error('❌ GET /api/events Error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // API: Create Event
  app.post('/api/events', async (req, res) => {
    try {
      const body = { ...(req.body || {}) };
      if (body.start_date !== undefined) body.start_date = normalizeEventDate(body.start_date);
      if (body.end_date !== undefined) body.end_date = normalizeEventDate(body.end_date);
      if ((body.end_date === undefined || body.end_date === '') && body.start_date !== undefined) {
        body.end_date = body.start_date;
      }

      const validationError = validateEventFields(body, true);
      if (validationError) return res.status(400).json({ error: validationError });

      const database = getDb();
      if (!database) throw new Error('DB not initialized');
      const id = uuidv4();
      const cleanFields = pickAllowedEventFields(body, true);
      const eventData = { ...cleanFields, id, createdAt: FieldValue.serverTimestamp() };
      await database.collection('events').doc(id).set(eventData);
      await bumpEventsRev(database);

      res.json({ success: true, id, event: { ...cleanFields, id } });
    } catch (error: any) {
      console.error('❌ POST /api/events Error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // API: Update Event
  app.put('/api/events/:id', async (req, res) => {
    try {
      const { id } = req.params;
      if (!id || id.includes('/')) {
        return res.status(400).json({ error: '無效的行程 ID' });
      }

      const body = { ...(req.body || {}) };
      if (body.start_date !== undefined) body.start_date = normalizeEventDate(body.start_date);
      if (body.end_date !== undefined) body.end_date = normalizeEventDate(body.end_date);

      const validationError = validateEventFields(body, false);
      if (validationError) return res.status(400).json({ error: validationError });

      const database = getDb();
      if (!database) throw new Error('DB not initialized');

      const docRef = database.collection('events').doc(id);
      const existingSnap = await docRef.get();
      if (!existingSnap.exists) {
        return res.status(404).json({ error: '找不到對應的行程' });
      }

      const existing = existingSnap.data() || {};
      const cleanFields = pickAllowedEventFields(body, false);
      const effectiveStart = cleanFields.start_date ?? normalizeEventDate(existing.start_date);
      const effectiveEnd = cleanFields.end_date ?? normalizeEventDate(existing.end_date || existing.start_date);
      if (
        typeof effectiveStart === 'string' &&
        typeof effectiveEnd === 'string' &&
        effectiveEnd < effectiveStart
      ) {
        return res.status(400).json({ error: 'end_date 不可早於 start_date' });
      }

      await docRef.update({ ...cleanFields, updatedAt: FieldValue.serverTimestamp() });
      await bumpEventsRev(database);
      res.json({ success: true });
    } catch (error: any) {
      console.error(`❌ PUT /api/events/${req.params.id} Error:`, error);
      res.status(500).json({ error: error.message });
    }
  });

  // API: Delete Event
  app.delete('/api/events/:id', async (req, res) => {
    try {
      const { id } = req.params;
      if (!id || id.includes('/')) {
        return res.status(400).json({ error: '無效的行程 ID' });
      }
      const database = getDb();
      if (!database) throw new Error('DB not initialized');
      await database.collection('events').doc(id).delete();
      await bumpEventsRev(database);
      res.json({ success: true });
    } catch (error: any) {
      console.error(`❌ DELETE /api/events/${req.params.id} Error:`, error);
      res.status(500).json({ error: error.message });
    }
  });

  // API: Daily Push (Cron)
  app.get('/api/cron/daily-push', requireCronSecret, async (req, res) => {
    try {
      const groupId = process.env.LINE_GROUP_ID;
      if (!groupId) {
        return res.json({
          success: false,
          message:
            '⚠️ 缺少 LINE_GROUP_ID 環境變數。系統不知道推播要傳到哪個群組去！請先將機器人邀請至群組，複製紀錄的 ID 並設定到環境變數中。',
        });
      }

      const database = getDb();
      if (!database) throw new Error('DB not initialized');

      const now = new Date();
      const todayStr = formatTaipeiDate(now);
      const yyyy = getTaipeiYear(now);
      const force = req.query.force === 'true';

      if (!force) {
        const cronDoc = await database.collection('system_config').doc('cron_state').get();
        if (cronDoc.exists && cronDoc.data()?.lastDailyPushDate === todayStr) {
          return res.json({ success: true, skipped: true, reason: 'already_sent_today', date: todayStr });
        }
      }

      const snapshot = await database.collection('events').get();
      const events = snapshot.docs.map((doc) => ({ ...doc.data() }));
      const todaysEvents = events.filter((e: any) => {
        const start = normalizeEventDate(e.start_date);
        const end = normalizeEventDate(e.end_date || e.start_date);
        return typeof start === 'string' && typeof end === 'string' && start <= todayStr && end >= todayStr;
      });

      const [weather, holiday] = await Promise.all([getTodayWeather(), getTodayHoliday(yyyy, todayStr)]);

      let msg = `📅 【今日家庭行事曆】 ${todayStr}\n`;
      if (holiday) {
        msg = `🎉 【特別節日告知】\n今天是「${holiday}」！祝大家節日快樂！\n────────────────\n` + msg;
      }
      if (weather) msg += `⛅ 天氣：${weather}\n\n`;

      if (todaysEvents.length > 0) {
        todaysEvents.sort((a: any, b: any) => (b.is_important ? 1 : 0) - (a.is_important ? 1 : 0));
        todaysEvents.forEach((e: any, i: number) => {
          msg += `${e.is_important ? '⭐' : '📌'} ${i + 1}. ${e.title}\n`;
          if (e.member_name) msg += `👤 ${e.member_name}${e.companions ? ' + ' + e.companions : ''}\n`;
          if (e.time) msg += `⏰ ${e.time}\n\n`;
        });
      } else {
        msg += `✨ 今日無特別排程活動`;
      }

      await sendLineNotification(msg.trim());
      await database
        .collection('system_config')
        .doc('cron_state')
        .set({ lastDailyPushDate: todayStr, lastDailyPushAt: FieldValue.serverTimestamp() }, { merge: true });

      res.json({ success: true, count: todaysEvents.length, date: todayStr });
    } catch (error: any) {
      console.error('❌ GET /api/cron/daily-push Error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // API: Hourly Important Reminder (Cron)
  app.get('/api/cron/hourly-reminder', requireCronSecret, async (req, res) => {
    try {
      const database = getDb();
      if (!database) throw new Error('DB not initialized');

      const now = new Date();
      const SLOT_MS = 15 * 60 * 1000;
      const slotStart = Math.floor(now.getTime() / SLOT_MS) * SLOT_MS;
      const windowStart = new Date(slotStart + 60 * 60 * 1000);
      const targetDateStr = formatTaipeiDate(windowStart);
      const windowStartStr = formatTaipeiHHmm(windowStart);
      const slotKey = `${targetDateStr}_${windowStartStr}`;
      const force = req.query.force === 'true';

      console.log(`📡 Checking for important reminders on ${targetDateStr} in window [${windowStartStr}, +15min)`);

      const snapshot = await database
        .collection('events')
        .where('start_date', '==', targetDateStr)
        .where('is_important', '==', true)
        .get();
      const events = snapshot.docs.map((doc) => ({ ...doc.data() }));

      const [wh, wm] = windowStartStr.split(':').map(Number);
      const windowStartMins = wh * 60 + wm;

      const reminders = events.filter((e: any) => {
        if (!e.time) return false;
        const match = String(e.time).trim().match(/^(\d{1,2}):(\d{2})/);
        if (!match) return false;
        const h = Number(match[1]);
        const m = Number(match[2]);
        if (h < 0 || h > 23 || m < 0 || m > 59) return false;

        const eventTotalMins = h * 60 + m;
        return eventTotalMins >= windowStartMins && eventTotalMins < windowStartMins + 15;
      });

      if (reminders.length === 0) {
        return res.json({ success: true, message: 'No reminders due' });
      }

      if (!force) {
        const cronDoc = await database.collection('system_config').doc('cron_state').get();
        if (cronDoc.exists && cronDoc.data()?.lastReminderSlot === slotKey) {
          return res.json({ success: true, skipped: true, reason: 'already_sent_slot', slot: slotKey });
        }
      }

      for (const e of reminders) {
        let msg = `🔔 【重要行程提醒】\n活動將在約 1 小時後開始！\n\n📌 主旨：${e.title}\n🕒 時間：${e.time}\n👤 對象：${e.member_name}\n`;
        if (e.description) msg += `📝 備註：${e.description}`;
        await sendLineNotification(msg.trim());
      }

      await database
        .collection('system_config')
        .doc('cron_state')
        .set({ lastReminderSlot: slotKey, lastReminderAt: FieldValue.serverTimestamp() }, { merge: true });

      res.json({ success: true, count: reminders.length, slot: slotKey });
    } catch (error: any) {
      console.error('❌ GET /api/cron/hourly-reminder Error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  async function handleLineEvent(event: WebhookEvent) {
    if (!lineClient) return;
    logToDebugFile(`handleLineEvent called for event type: ${event.type} | source: ${JSON.stringify(event.source)}`);
    console.log(`🔍 Processing event type: ${event.type}`);

    // 加入群組時回傳 ID
    if (event.type === 'join') {
      const source = event.source;
      const id = source.type === 'group' ? source.groupId : 'unknown';
      console.log(`👋 Joined a ${source.type}, ID: ${id}`);
      return lineClient.replyMessage(event.replyToken, {
        type: 'text',
        text: `機器人已就位！\n目前的群組/聊天 ID 是：\n${id}\n\n請將此 ID 設定至環境變數 LINE_GROUP_ID 以啟用推播功能。`,
      });
    }

    if (event.type === 'message' && event.message.type === 'location') {
      const locationMessage = event.message as any;
      console.log(`📍 Received location message: ${locationMessage.latitude}, ${locationMessage.longitude}`);

      const weather = await getTodayWeather(
        locationMessage.latitude,
        locationMessage.longitude,
        locationMessage.address || locationMessage.title
      );
      const todayStr = formatTaipeiDate();
      const holiday = await getTodayHoliday(getTaipeiYear(), todayStr);
      const displayPlace = locationMessage.address || locationMessage.title || '未知地點';

      let msg = `📍 您所在的位置 (${displayPlace})\n⛅ 目前氣象狀況：\n${weather || '暫時無法取得天氣資訊'}`;
      if (holiday) msg += `\n\n🏮 今日節慶：${holiday}`;

      return lineClient.replyMessage(event.replyToken, { type: 'text', text: msg });
    }

    if (event.type === 'message' && event.message.type === 'text') {
      const text = event.message.text.trim();
      console.log(`💬 Received message: "${text}" from ${event.source.type}`);

      // 指令 1: 取得 ID
      if (text.toLowerCase() === 'id' || text === '群組id' || text === '我的id') {
        const id = (event.source as any).groupId || (event.source as any).userId;
        return lineClient.replyMessage(event.replyToken, { type: 'text', text: `您的 ID 是：\n${id}` });
      }

      // 指令 4: 重要行程
      if (text === '重要行程' || text === '重要' || text === '重要事項') {
        try {
          const database = getDb();
          if (!database) {
            return lineClient.replyMessage(event.replyToken, {
              type: 'text',
              text: '抱歉，資料庫連線中，請稍後再試。',
            });
          }

          const nowStr = formatTaipeiDate();
          const snapshot = await database.collection('events').get();
          const allEvents = snapshot.docs.map((doc) => doc.data());

          const filtered = allEvents
            .filter((e: any) => e.is_important === true && String(e.end_date || e.start_date || '') >= nowStr)
            .sort((a: any, b: any) => String(a.start_date || '').localeCompare(String(b.start_date || '')));

          if (filtered.length === 0) {
            return lineClient.replyMessage(event.replyToken, {
              type: 'text',
              text: '🔔 目前沒有標記為重要的未來行程喔！',
            });
          }

          let msg = '🌟 置頂重要行程公告：\n\n';
          filtered.forEach((e: any, index: number) => {
            const startDate = String(e.start_date || '');
            msg += `${index + 1}. [${startDate.slice(5)}] ${e.title}\n`;
            if (e.member_name) msg += `   👤 負責：${e.member_name}\n`;
            if (e.description) msg += `   📝 備註：${e.description}\n`;
            msg += '\n';
          });

          return lineClient.replyMessage(event.replyToken, { type: 'text', text: msg.trim() });
        } catch (dbErr) {
          console.error('❌ Database query failed in LINE event:', dbErr);
          return lineClient.replyMessage(event.replyToken, { type: 'text', text: '讀取重要行程時發生錯誤。' });
        }
      }

      // 指令 2: 行程查詢系列（固定指令 + [人名]行程，避免誤攔截 AI 自然語言問句）
      const fixedScheduleCommands = ['今天行程', '今日行程', '當日行程', '明天行程', '明日行程', '近期行程', '本週行程'];
      const memberScheduleQuery = extractMemberScheduleQuery(text);
      if (fixedScheduleCommands.includes(text) || memberScheduleQuery !== null) {
        try {
          const database = getDb();
          if (!database) {
            return lineClient.replyMessage(event.replyToken, {
              type: 'text',
              text: '抱歉，資料庫連線中，請稍後再試。',
            });
          }

          const nowStr = formatTaipeiDate();
          let startDateStr = nowStr;
          let isRange = false;
          let rangeDays = 1;
          const filterMember = memberScheduleQuery || '';

          if (text.includes('明天') || text.includes('明日')) {
            startDateStr = addDaysToDateStr(nowStr, 1);
          } else if (text.includes('近期') || text.includes('本週')) {
            isRange = true;
            rangeDays = 7;
          } else if (filterMember) {
            isRange = true;
            rangeDays = 7;
          }

          const endDateStr = addDaysToDateStr(startDateStr, rangeDays - 1);

          const snapshot = await database.collection('events').get();
          const allEvents = snapshot.docs.map((doc) => doc.data());

          const importantEvents = allEvents
            .filter((e: any) => e.is_important === true && String(e.end_date || e.start_date || '') >= nowStr)
            .sort((a: any, b: any) => String(a.start_date || '').localeCompare(String(b.start_date || '')));

          const filtered = allEvents
            .filter((e: any) => {
              const evStart = String(e.start_date || '');
              const evEnd = String(e.end_date || evStart);
              if (!evStart) return false;

              const dateMatch = isRange
                ? evStart <= endDateStr && evEnd >= startDateStr
                : evStart <= startDateStr && evEnd >= startDateStr;

              const memberMatch = filterMember
                ? String(e.member_name || '').includes(filterMember) ||
                  String(e.companions || '').includes(filterMember)
                : true;
              return dateMatch && memberMatch;
            })
            .sort(
              (a: any, b: any) =>
                String(a.start_date || '').localeCompare(String(b.start_date || '')) ||
                String(a.time || '').localeCompare(String(b.time || ''))
            );

          if (filtered.length === 0 && importantEvents.length === 0) {
            let emptyMsg = `📅 ${isRange ? `${startDateStr} ~ ${endDateStr}` : startDateStr}\n`;
            emptyMsg += filterMember ? `未來 7 天找不到 ${filterMember} 的行程喔！` : '沒有排定的行程喔！✨';
            return lineClient.replyMessage(event.replyToken, { type: 'text', text: emptyMsg });
          }

          let msg = '';

          if (!isRange && startDateStr === nowStr) {
            const holiday = await getTodayHoliday(getTaipeiYear(), nowStr);
            if (holiday) {
              msg += `🎉 【特別節日告知】\n今天是「${holiday}」！祝大家節日快樂！\n────────────────\n`;
            }
          }

          if (importantEvents.length > 0 && !filterMember) {
            msg += '🌟 【置頂重要公告】\n';
            importantEvents.forEach((e: any) => {
              msg += `📍 [${String(e.start_date || '').slice(5)}] ${e.title}${e.time ? ' (' + e.time + ')' : ''}\n`;
            });
            msg += '──────────────\n';
          }

          const summaryLabel = filterMember
            ? `未來 7 天行程摘要 (${filterMember})`
            : isRange
              ? '近期 7 天行程摘要'
              : text.includes('明天') || text.includes('明日')
                ? '明天行程摘要'
                : '今日行程摘要';
          msg += `📅 ${summaryLabel}：\n\n`;

          if (filtered.length > 0) {
            filtered.forEach((e: any, index: number) => {
              msg += `${index + 1}. ${isRange ? '[' + String(e.start_date || '').slice(5) + '] ' : ''}[${e.member_name}] ${e.title}`;
              if (e.time) msg += ` (${e.time})`;
              msg += '\n';
            });
          } else {
            msg += '(此時段暫無一般行程)\n';
          }

          return lineClient.replyMessage(event.replyToken, { type: 'text', text: msg.trim() });
        } catch (dbErr) {
          console.error('❌ Database query failed in LINE event:', dbErr);
          return lineClient.replyMessage(event.replyToken, {
            type: 'text',
            text: '讀取行程時發生錯誤，請聯絡管理員。',
          });
        }
      }

      // 指令 3: 天氣狀況
      if (text === '天氣' || text === '現在天氣' || text === '今日天氣') {
        const weather = await getTodayWeather();
        const holiday = await getTodayHoliday(getTaipeiYear(), formatTaipeiDate());
        let msg = `⛅ 目前氣象狀況：\n${weather || '暫時無法取得天氣資訊'}`;
        if (holiday) msg += `\n\n🏮 今日節慶：${holiday}`;
        return lineClient.replyMessage(event.replyToken, { type: 'text', text: msg });
      }

      // 指令 5: 指令說明
      if (text === '幫助' || text === '說明' || text === 'help') {
        return lineClient.replyMessage(event.replyToken, {
          type: 'text',
          text:
            '🤖 機器人指令說明：\n\n' +
            '1. 「今天行程」：看今天的排程\n' +
            '2. 「明天行程」：看明天的排程\n' +
            '3. 「近期行程」：看未來一週的排程\n' +
            '4. 「[人名]行程」：看特定人的行程 (如: 喬裕行程)\n' +
            '5. 「重要行程」：查看所有標記為重要的活動\n' +
            '6. 「天氣」：看目前天氣與節慶\n' +
            '7. 「id」：取得對話 ID\n' +
            '8. 「智慧助理」：輸入「AI 幫我查下週誰排休」或點擊私聊進行 AI 智慧排程與對話\n' +
            '9. 「幫助」：顯示此說明',
        });
      }

      // --- ChatGPT 智慧對話＆排程功能 ---
      const lowercaseText = text.toLowerCase();
      const isGroup = event.source.type === 'group';
      let shouldTriggerChatGPT = false;
      let queryText = text;

      for (const t of AI_TRIGGERS) {
        if (lowercaseText.startsWith(t)) {
          shouldTriggerChatGPT = true;
          queryText = text.substring(t.length).trim();
          break;
        }
      }

      if (!isGroup) {
        shouldTriggerChatGPT = true;
      }

      if (shouldTriggerChatGPT && queryText.length > 0) {
        try {
          console.log(`🤖 Invoking ChatGPT for LINE prompt: "${queryText}"`);
          const gptResponse = await askChatGPT(queryText, [], getTaipeiYear());
          return lineClient.replyMessage(event.replyToken, {
            type: 'text',
            text: gptResponse.reply,
          });
        } catch (gptErr: any) {
          console.error('❌ LINE ChatGPT invocation failed:', gptErr.message);
          return lineClient.replyMessage(event.replyToken, {
            type: 'text',
            text: `⚠️ ChatGPT 模組暫時無法回應，請確認設定：${gptErr.message}`,
          });
        }
      }
    }

    if (event.type === 'message' && event.message.type === 'audio') {
      try {
        logToDebugFile(`🎤 Received audio message with ID: ${event.message.id}`);
        console.log('🎤 Received audio message.');
        const stream = (await lineClient.getMessageContent(event.message.id)) as NodeJS.ReadableStream;
        const buffer = await new Promise<Buffer>((resolve, reject) => {
          const chunks: Buffer[] = [];
          stream.on('data', (chunk: Buffer) => chunks.push(Buffer.from(chunk)));
          stream.on('error', (err: Error) => {
            logToDebugFile(`Stream error on getMessageContent: ${err.message}`);
            reject(err);
          });
          stream.on('end', () => resolve(Buffer.concat(chunks)));
        });

        logToDebugFile(`Audio buffer retrieved, size: ${buffer.length} bytes`);
        const text = await transcribeAudio(buffer);
        logToDebugFile(`Transcribed text: "${text}"`);
        console.log(`🎤 Transcribed audio text: "${text}"`);

        if (text && text.trim().length > 0) {
          const gptResponse = await askChatGPT(text, [], getTaipeiYear());
          logToDebugFile(`GPT Response: "${gptResponse.reply}"`);
          const prefix = `【語音】：${text}\n─────────\n`;
          return lineClient.replyMessage(event.replyToken, {
            type: 'text',
            text: prefix + gptResponse.reply,
          });
        } else {
          logToDebugFile('Warning: Transcribed text is empty');
          return lineClient.replyMessage(event.replyToken, {
            type: 'text',
            text: '⚠️ 無法從語音中辨識到文字內容。',
          });
        }
      } catch (err: any) {
        logToDebugFile(`❌ LINE Audio processing failed: ${err.message} -- ${err.stack}`);
        console.error('❌ LINE Audio processing failed:', err.message);
        return lineClient.replyMessage(event.replyToken, {
          type: 'text',
          text: `⚠️ 處理語音時發生錯誤：${err.message}`,
        });
      }
    }
  }

  // Static/SPA Fallback & Local Listener (skip on Vercel Serverless)
  if (!process.env.VERCEL) {
    if (process.env.NODE_ENV !== 'production') {
      const { createServer: createViteServer } = await import('vite');
      const vite = await createViteServer({ server: { middlewareMode: true }, appType: 'spa' });
      app.use(vite.middlewares);
    } else {
      const distPath = path.join(process.cwd(), 'dist');
      app.use(express.static(distPath));
      app.get('*', (_req, res) => res.sendFile(path.join(distPath, 'index.html')));
    }

    app.listen(PORT, '0.0.0.0', () => {
      console.log(`Server running on http://localhost:${PORT}`);
    });
  }

  return app;
}

export const appPromise = startServer();
