import axios from 'axios';
import OpenAI from 'openai';
import { FieldValue } from 'firebase-admin/firestore';
import { v4 as uuidv4 } from 'uuid';
import { FAMILY_MEMBERS, MEMBER_COLORS } from './shared/constants.js';
import { getDb, bumpEventsRev } from './lib/firebaseAdmin.js';
import {
  formatTaipeiDate,
  getTaipeiYear,
  getWeekdayFromDateStr,
  normalizeEventDate,
  isValidCalendarDate,
} from './lib/taipeiTime.js';

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

const MAX_CONTEXT_EVENTS = 150;

/**
 * Fetch upcoming calendar context from Firestore as a readable string.
 */
async function getCalendarEventsContext(): Promise<string> {
  const db = getDb();
  if (!db) {
    return '【系統提示】：目前無法連線至 Firestore 資料庫，無法取得最新行程。';
  }

  try {
    const snapshot = await db.collection('events').get();
    let events: any[] = snapshot.docs.map((doc) => ({
      id: doc.id,
      ...doc.data(),
    }));

    const todayStr = formatTaipeiDate();

    // Filter out past events (normalize legacy dates if needed)
    events = events.filter((e) => {
      const start = normalizeEventDate(e.start_date);
      const end = normalizeEventDate(e.end_date || e.start_date);
      return typeof end === 'string' && end >= todayStr && typeof start === 'string';
    });

    if (events.length === 0) {
      return '目前行事曆上沒有任何未來的行程。';
    }

    // Sort by date then time
    events.sort((a, b) => {
      const dateCompare = String(a.start_date || '').localeCompare(String(b.start_date || ''));
      if (dateCompare !== 0) return dateCompare;
      return String(a.time || '').localeCompare(String(b.time || ''));
    });

    const truncated = events.length > MAX_CONTEXT_EVENTS;
    const sliced = events.slice(0, MAX_CONTEXT_EVENTS);

    let context = '【目前家庭行事曆上的行程表】:\n';
    sliced.forEach((e) => {
      const importantTag = e.is_important ? ' (⚠️重要)' : '';
      const endDate = e.end_date || e.start_date;
      const dateStr = e.start_date === endDate ? e.start_date : `${e.start_date} 至 ${endDate}`;
      context += `- ID: ${e.id} | 日期: ${dateStr} | 成員: ${e.member_name} | 標題: ${e.title} | 時間: ${e.time || '整天'}${importantTag}`;
      if (e.companions) context += ` | 同行伴同者: ${e.companions}`;
      if (e.description) context += ` | 備註: ${e.description}`;
      context += '\n';
    });
    if (truncated) {
      context += `（僅顯示最近 ${MAX_CONTEXT_EVENTS} 筆未來行程，總計 ${events.length} 筆）\n`;
    }

    return context;
  } catch (err: any) {
    console.error('❌ Failed to query calendar context in gptService:', err.message);
    return '【系統提示】：讀取行事曆行程時發生錯誤。';
  }
}

/**
 * Parse the JSON payload emitted after [JSON_ACTION], tolerating optional markdown code fences.
 */
function parseActionPayload(raw: string): { action?: string; data?: any } | null {
  let cleaned = raw.trim();
  const fenceMatch = cleaned.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenceMatch) {
    cleaned = fenceMatch[1].trim();
  }
  try {
    return JSON.parse(cleaned);
  } catch {
    const startIdx = cleaned.indexOf('{');
    const endIdx = cleaned.lastIndexOf('}');
    if (startIdx !== -1 && endIdx > startIdx) {
      try {
        return JSON.parse(cleaned.slice(startIdx, endIdx + 1));
      } catch {
        return null;
      }
    }
    return null;
  }
}

/**
 * Executes database actions parsed from ChatGPT's response.
 */
export async function executeGptAction(
  actionType: 'create' | 'update' | 'delete',
  data: any
): Promise<{ success: boolean; message: string; eventId?: string }> {
  const db = getDb();
  if (!db) {
    return { success: false, message: '資料庫尚未初始化，暫時無法變更行程。' };
  }

  try {
    if (actionType === 'create') {
      const todayStr = formatTaipeiDate();
      const rawStart = data?.start_date ? normalizeEventDate(String(data.start_date)) : todayStr;
      if (!isValidCalendarDate(rawStart)) {
        return { success: false, message: `新增行程失敗：start_date 日期格式無效 (${String(data?.start_date)})。` };
      }

      const rawEnd = data?.end_date ? normalizeEventDate(String(data.end_date)) : rawStart;
      if (!isValidCalendarDate(rawEnd)) {
        return { success: false, message: `新增行程失敗：end_date 日期格式無效 (${String(data?.end_date)})。` };
      }
      if (rawEnd < rawStart) {
        return { success: false, message: `新增行程失敗：結束日期 (${rawEnd}) 不可早於開始日期 (${rawStart})。` };
      }

      const rawTitle = typeof data?.title === 'string' && data.title.trim() ? data.title.trim().slice(0, 200) : '未命名行程';
      const member = (FAMILY_MEMBERS as readonly string[]).includes(data?.member_name)
        ? data.member_name
        : FAMILY_MEMBERS[0];
      const color = MEMBER_COLORS[member] || '#4F46E5';

      const id = uuidv4();
      const newEvent = {
        id,
        title: rawTitle,
        description: typeof data?.description === 'string' ? data.description.slice(0, 2000) : '',
        start_date: rawStart,
        end_date: rawEnd,
        time: typeof data?.time === 'string' ? data.time.trim().slice(0, 50) : '',
        member_name: member,
        color,
        companions: typeof data?.companions === 'string' ? data.companions.slice(0, 500) : '',
        is_important: Boolean(data?.is_important),
        createdAt: FieldValue.serverTimestamp(),
      };

      await db.collection('events').doc(id).set(newEvent);
      await bumpEventsRev(db);
      return {
        success: true,
        message: `已成功新增行程「${newEvent.title}」(${newEvent.start_date} - ${newEvent.member_name})`,
        eventId: id,
      };
    }

    if (actionType === 'update') {
      const targetId = typeof data?.id === 'string' ? data.id.trim() : '';
      if (!targetId || targetId.includes('/')) {
        return { success: false, message: '更新行程失敗：缺少有效的行程 ID。' };
      }

      const docRef = db.collection('events').doc(targetId);
      const doc = await docRef.get();
      if (!doc.exists) {
        return { success: false, message: `更新行程失敗：找不到對應的行程 (ID: ${targetId})。` };
      }

      const existing = doc.data() || {};
      const updateData: Record<string, any> = {
        updatedAt: FieldValue.serverTimestamp(),
      };

      if (typeof data.title === 'string' && data.title.trim()) {
        updateData.title = data.title.trim().slice(0, 200);
      }
      if (typeof data.description === 'string') {
        updateData.description = data.description.slice(0, 2000);
      }
      if (data.start_date !== undefined) {
        const normStart = normalizeEventDate(String(data.start_date));
        if (!isValidCalendarDate(normStart)) {
          return { success: false, message: `更新行程失敗：start_date 日期格式無效 (${String(data.start_date)})。` };
        }
        updateData.start_date = normStart;
      }
      if (data.end_date !== undefined) {
        const normEnd = normalizeEventDate(String(data.end_date));
        if (!isValidCalendarDate(normEnd)) {
          return { success: false, message: `更新行程失敗：end_date 日期格式無效 (${String(data.end_date)})。` };
        }
        updateData.end_date = normEnd;
      }

      const effectiveStart = updateData.start_date ?? existing.start_date;
      const effectiveEnd = updateData.end_date ?? existing.end_date ?? effectiveStart;
      if (effectiveStart && effectiveEnd && effectiveEnd < effectiveStart) {
        return { success: false, message: `更新行程失敗：結束日期 (${effectiveEnd}) 不可早於開始日期 (${effectiveStart})。` };
      }

      if (typeof data.time === 'string') {
        updateData.time = data.time.trim().slice(0, 50);
      }
      if (typeof data.companions === 'string') {
        updateData.companions = data.companions.slice(0, 500);
      }
      if (data.is_important !== undefined) {
        updateData.is_important = Boolean(data.is_important);
      }
      if (typeof data.member_name === 'string' && (FAMILY_MEMBERS as readonly string[]).includes(data.member_name)) {
        updateData.member_name = data.member_name;
        updateData.color = MEMBER_COLORS[data.member_name] || '#4F46E5';
      }

      await docRef.update(updateData);
      await bumpEventsRev(db);
      return {
        success: true,
        message: `已成功更新行程「${updateData.title || existing.title || ''}」`,
        eventId: targetId,
      };
    }

    if (actionType === 'delete') {
      const rawId = typeof data === 'string' ? data : data?.id;
      const targetId = typeof rawId === 'string' ? rawId.trim() : '';
      if (!targetId || targetId.includes('/')) {
        return { success: false, message: '刪除行程失敗：缺少有效的行程 ID。' };
      }

      const docRef = db.collection('events').doc(targetId);
      const doc = await docRef.get();
      if (!doc.exists) {
        return { success: false, message: '刪除行程失敗：找不到這筆行程（可能已經刪除了）。' };
      }

      await docRef.delete();
      await bumpEventsRev(db);
      return { success: true, message: '已成功刪除行程！' };
    }

    return { success: false, message: '不支援的指令動作。' };
  } catch (e: any) {
    console.error('❌ executeGptAction Error:', e);
    return { success: false, message: `執行變更失敗: ${e.message}` };
  }
}

/**
 * Query OpenAI ChatGPT.
 */
export async function askChatGPT(
  userQuery: string,
  history: ChatMessage[] = [],
  currentYear?: number
): Promise<{ reply: string; actionExecuted?: string }> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey || apiKey.trim() === '' || apiKey === 'YOUR_OPENAI_API_KEY_HERE') {
    return {
      reply: '⚠️ 系統尚未設定 ChatGPT API 金鑰。\n請在後端環境變數（`.env` 或 Vercel Environment Variables）設定 `OPENAI_API_KEY` 以啟用此功能。',
    };
  }

  try {
    const todayStr = formatTaipeiDate();
    const currentYearNum = currentYear || getTaipeiYear();
    const weekday = ['日', '一', '二', '三', '四', '五', '六'][getWeekdayFromDateStr(todayStr)];

    const calendarContext = await getCalendarEventsContext();

    const systemPrompt = `你是家庭行事曆的「ChatGPT 智慧小幫手」，一個貼心、親切、幽默且專業的 AI 家庭秘書。
你的工作是協助家庭成員（${FAMILY_MEMBERS.filter((m) => m !== '全家').join('、')} 等人）查詢、新增、變更或刪除他們的行程與排班。

【重要環境資訊】
- 今天本地日期是：${todayStr} (星期${weekday})
- 今年年份是：${currentYearNum}
- 家庭成員名單（請只能設定給這幾位成員）：${FAMILY_MEMBERS.join(', ')}
  （如果成員的名字不在裡面，請禮貌地告知，並詢問要設定給哪一個家庭成員。'全家'也是合法的對象。注意：若是語音辨識造成的同音錯字（如喬玉->黃喬裕、宣倫->黃宣綸），請自動進行模糊比對並修正為正確的成員名稱）

${calendarContext}

【自動排程＆功能指示】
你可以直接代表用戶新增、修改或刪除行程！當你判斷用戶想要對行程做出「新增（排休、上班、活動等）」、「修改/變更」或「刪除」動作時，你必須在「說給用戶聽的日常問候話語」完畢後，在回答的最底端，另起一行，寫上標記：
[JSON_ACTION]
然後緊接著輸出一行且只有一行的 JSON block（不要有 Markdown code block 標記），格式規定如下：

1. 新增行程 (action: "create"):
   {"action": "create", "data": {"title": "必填（例如: 排休、上班、去醫院、買菜）", "member_name": "必填（名字必須完全對應家庭成員，如: 黃喬裕）", "start_date": "必填（格式為 YYYY-MM-DD，若為明天請換算為相應日期。非整天行程也必須填寫日期）", "end_date": "選填（預設跟 start_date 同一天，YYYY-MM-DD）", "time": "選填（例如 14:30，或時間段 14:30 - 16:00）", "companions": "選填（同行的人）", "description": "選填（備註資訊）", "is_important": false}}

2. 刪除行程 (action: "delete"):
   {"action": "delete", "data": {"id": "必填（必須填入上面行程表列出的正確行程 ID）"}}

3. 更新/修改行程 (action: "update"):
   {"action": "update", "data": {"id": "必填（必須填入上面行程表列出的正確行程 ID）", "title": "選填", "member_name": "選填", "start_date": "選填", "end_date": "選填", "time": "選填", "companions": "選填", "description": "選填", "is_important": false}}

【注意事項】：
- 回答語調請務必親切溫馨，可以用一些口語或表情（例如 😊✨👋）。
- 用戶可能說「幫我排休明天」，如果今天日期是 2026-05-21，明天就是 2026-05-22，請幫他正確換算日期！
- 只能輸出一個 JSON_ACTION，且只能在最後一行！
- 不要將 JSON 放進 \`\`\` 這種 markdown code block。必須緊隨在 [JSON_ACTION] 標記下一行，例如：
  好的，沒問題！已經為宣綸排好 5/25 的排休囉！😊
  [JSON_ACTION]
  {"action": "create", "data": {"title": "排休", "member_name": "黃宣綸", "start_date": "2026-05-25", "end_date": "2026-05-25", "time": ""}}`;

    // Sanitize conversation history so client input cannot inject 'system' messages
    const safeHistory = Array.isArray(history)
      ? history
          .filter((h) => (h?.role === 'user' || h?.role === 'assistant') && typeof h?.content === 'string')
          .slice(-10)
          .map((h) => ({ role: h.role, content: h.content.slice(0, 2000) }))
      : [];

    const apiMessages = [
      { role: 'system', content: systemPrompt },
      ...safeHistory,
      { role: 'user', content: userQuery },
    ];

    const response = await axios.post(
      'https://api.openai.com/v1/chat/completions',
      {
        model: 'gpt-4o-mini',
        messages: apiMessages,
        temperature: 0.7,
        max_tokens: 1000,
      },
      {
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        timeout: 15000,
      }
    );

    let assistantReply = response.data?.choices?.[0]?.message?.content || '';
    let actionExecutedText = '';

    const actionMarker = '[JSON_ACTION]';
    if (assistantReply.includes(actionMarker)) {
      const markerIdx = assistantReply.indexOf(actionMarker);
      const speech = assistantReply.slice(0, markerIdx).trim();
      const rawActionStr = assistantReply.slice(markerIdx + actionMarker.length).trim();

      assistantReply = speech;

      const actionObj = parseActionPayload(rawActionStr);
      if (
        actionObj &&
        (actionObj.action === 'create' || actionObj.action === 'update' || actionObj.action === 'delete') &&
        actionObj.data !== undefined
      ) {
        const actionResult = await executeGptAction(actionObj.action, actionObj.data);
        if (actionResult.success) {
          actionExecutedText = actionResult.message;
          assistantReply += `\n\n✨ 【自動排程動作】：${actionResult.message} 😊`;
        } else {
          assistantReply += `\n\n⚠️ 【排程動作失敗】：${actionResult.message}`;
        }
      } else {
        console.error('❌ Failed to parse ChatGPT action JSON:', rawActionStr);
        assistantReply += '\n\n⚠️ 【排程動作失敗】：無法解析 AI 回傳的排程指令，本次未寫入行事曆，請再試一次。';
      }
    }

    return {
      reply: assistantReply,
      actionExecuted: actionExecutedText || undefined,
    };
  } catch (error: any) {
    console.error('❌ askChatGPT Error:', error.response?.data || error.message);
    const apiErr = error.response?.data?.error?.message || error.message;
    return {
      reply: `❌ 詢問 ChatGPT 時發生錯誤：${apiErr}\n（請檢查金鑰設定或是網路。）`,
    };
  }
}

/**
 * Transcribe Audio using OpenAI Whisper.
 */
export async function transcribeAudio(audioBuffer: Buffer): Promise<string> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey || apiKey.trim() === '' || apiKey === 'YOUR_OPENAI_API_KEY_HERE') {
    throw new Error('⚠️ 系統尚未設定 ChatGPT API 金鑰，無法辨識語音。');
  }

  const openai = new OpenAI({ apiKey });

  try {
    const file = await OpenAI.toFile(audioBuffer, 'audio.m4a');
    const response = await openai.audio.transcriptions.create({
      file: file as any,
      model: 'whisper-1',
      language: 'zh',
      prompt: `這段語音主要關於家庭成員的行程管理與行事曆排班。常出現的字詞有：新增、刪除、查詢、更改、安排、行程、排班、放假。請特別注意以下家庭成員的正確名字寫法：${FAMILY_MEMBERS.join('，')}。請使用繁體中文，並加上適當的標點符號。`,
    });
    return response.text;
  } catch (error: any) {
    console.error('❌ transcribeAudio Error:', error.message);
    throw new Error(`語音辨識失敗: ${error.message}`);
  }
}
