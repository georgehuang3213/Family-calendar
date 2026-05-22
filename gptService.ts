import axios from "axios";
import OpenAI from "openai";
import { getFirestore, FieldValue } from "firebase-admin/firestore";
import { v4 as uuidv4 } from "uuid";
import fs from "fs";
import path from "path";

const FAMILY_MEMBERS = ['全家', '江雪卿', '黃喬裕', '陳愉婷', '黃宣綾', '黃宣綸', '黃郁婷', '郭力維', '黃郁慈', '郭品佑', '郭品彤'];

const MEMBER_COLORS: Record<string, string> = {
  '全家': '#111827',
  '江雪卿': '#E11D48',
  '黃喬裕': '#2563EB',
  '陳愉婷': '#059669',
  '黃宣綾': '#D97706',
  '黃宣綸': '#7C3AED',
  '黃郁婷': '#DB2777',
  '郭力維': '#4B5563',
  '黃郁慈': '#EA580C',
  '郭品佑': '#84CC16',
  '郭品彤': '#06B6D4',
};

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

import { getApps } from "firebase-admin/app";

/**
 * Lazy-retrieve Firebase DB instance safely
 */
function getDb() {
  try {
    if (getApps().length > 0) {
      // Just check if we can get Firestore
      // Read the databaseId from config if it exists
      let databaseId = "(default)";
      try {
        const configPath = path.join(process.cwd(), 'firebase-applet-config.json');
        if (fs.existsSync(configPath)) {
          const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
          if (config.databaseId) {
            databaseId = config.databaseId;
          }
        }
      } catch (e) {
        console.warn("⚠️ Could not read firebase config in gptService");
      }
      const db = getFirestore(databaseId);
      return db;
    }
  } catch (e) {
    console.warn("⚠️ Could not lazy-init Firestore in gptService:", e);
  }
  return null;
}

/**
 * Fetch calendar context from Firestore as a readable string
 */
async function getCalendarEventsContext(): Promise<string> {
  const db = getDb();
  if (!db) {
    return "【系統提示】：目前無法連線至 Firestore 資料庫，無法取得最新行程。";
  }

  try {
    const snapshot = await db.collection("events").get();
    const events = snapshot.docs.map((doc: any) => ({
      id: doc.id,
      ...doc.data()
    }));

    if (events.length === 0) {
      return "目前行事曆上沒有任何行程。";
    }

    // Sort by date then time
    events.sort((a: any, b: any) => {
      const dateCompare = (a.start_date || "").localeCompare(b.start_date || "");
      if (dateCompare !== 0) return dateCompare;
      return (a.time || "").localeCompare(b.time || "");
    });

    let context = "【目前家庭行事曆上的行程表】:\n";
    events.forEach((e: any) => {
      const importantTag = e.is_important ? " (⚠️重要)" : "";
      const dateStr = e.start_date === e.end_date ? e.start_date : `${e.start_date} 至 ${e.end_date}`;
      context += `- ID: ${e.id} | 日期: ${dateStr} | 成員: ${e.member_name} | 標題: ${e.title} | 時間: ${e.time || "整天"}${importantTag}`;
      if (e.companions) context += ` | 同行伴同者: ${e.companions}`;
      if (e.description) context += ` | 備註: ${e.description}`;
      context += "\n";
    });

    return context;
  } catch (err: any) {
    console.error("❌ Failed to query calendar context in gptService:", err.message);
    return "【系統提示】：讀取行事曆行程時發生錯誤。";
  }
}

/**
 * Executes database actions parsed from ChatGPT's response
 */
export async function executeGptAction(actionType: "create" | "update" | "delete", data: any): Promise<{ success: boolean; message: string; eventId?: string }> {
  const db = getDb();
  if (!db) {
    return { success: false, message: "資料庫尚未初始化，暫時無法變更行程。" };
  }

  try {
    if (actionType === "create") {
      const id = uuidv4();
      const member = FAMILY_MEMBERS.includes(data.member_name) ? data.member_name : FAMILY_MEMBERS[0];
      const color = MEMBER_COLORS[member] || '#4F46E5';
      
      const newEvent = {
        title: data.title || "未命名行程",
        description: data.description || "",
        start_date: data.start_date || new Date().toISOString().split("T")[0],
        end_date: data.end_date || data.start_date || new Date().toISOString().split("T")[0],
        time: data.time || "",
        member_name: member,
        color: color,
        companions: data.companions || "",
        is_important: !!data.is_important,
        createdAt: FieldValue.serverTimestamp()
      };

      await db.collection("events").doc(id).set(newEvent);
      return { success: true, message: `已成功新增行程「${newEvent.title}」(${newEvent.start_date} - ${newEvent.member_name})`, eventId: id };
    } 
    
    if (actionType === "update") {
      if (!data.id) return { success: false, message: "更新行程失敗：缺少行程 ID。" };
      
      const updateData: any = {
        updatedAt: FieldValue.serverTimestamp()
      };
      
      if (data.title !== undefined) updateData.title = data.title;
      if (data.description !== undefined) updateData.description = data.description;
      if (data.start_date !== undefined) updateData.start_date = data.start_date;
      if (data.end_date !== undefined) updateData.end_date = data.end_date;
      if (data.time !== undefined) updateData.time = data.time;
      if (data.companions !== undefined) updateData.companions = data.companions;
      if (data.is_important !== undefined) updateData.is_important = !!data.is_important;
      
      if (data.member_name !== undefined && FAMILY_MEMBERS.includes(data.member_name)) {
        updateData.member_name = data.member_name;
        updateData.color = MEMBER_COLORS[data.member_name] || '#4F46E5';
      }

      await db.collection("events").doc(data.id).update(updateData);
      return { success: true, message: `已成功更新行程ID「${data.id}」`, eventId: data.id };
    }

    if (actionType === "delete") {
      const targetId = data.id || data; // accept either object with id or raw id string
      if (!targetId) return { success: false, message: "刪除行程失敗：缺少行程 ID。" };

      await db.collection("events").doc(targetId).delete();
      return { success: true, message: `已成功刪除行程！` };
    }

    return { success: false, message: "不支援的指令動作。" };
  } catch (e: any) {
    console.error("❌ executeGptAction Error:", e);
    return { success: false, message: `執行變更失敗: ${e.message}` };
  }
}

/**
 * Query OpenAI ChatGPT
 */
export async function askChatGPT(
  userQuery: string, 
  history: ChatMessage[] = [],
  currentYear?: number
): Promise<{ reply: string; actionExecuted?: string }> {
  // Check API Key
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey || apiKey.trim() === "" || apiKey === "YOUR_OPENAI_API_KEY_HERE") {
    return {
      reply: "⚠️ 系統尚未設定 ChatGPT API 金鑰。\n請至 AI Studio 專案 Settings -> Secrets 設定 `OPENAI_API_KEY` 變數以啟用此功能。"
    };
  }

  try {
    const tz = "Asia/Taipei";
    const currentLocTime = new Date().toLocaleString("en-US", { timeZone: tz });
    const todayDate = new Date(currentLocTime);
    const todayStr = todayDate.toLocaleDateString("zh-TW", { year: "numeric", month: "2-digit", day: "2-digit" }).replace(/\//g, "-");
    const currentYearNum = currentYear || todayDate.getFullYear();

    const calendarContext = await getCalendarEventsContext();

    const systemPrompt = `你是家庭行事曆的「ChatGPT 智慧小幫手」，一個貼心、親切、幽默且專業的 AI 家庭秘書。
你的工作是協助家庭成員（江雪卿、黃喬裕、陳愉婷、黃宣綾、黃宣綸、黃郁婷、郭力維、黃郁慈、郭品佑、郭品彤 等人）查詢、新增、變更或刪除他們的行程與排班。

【重要環境資訊】
- 今天本地日期是：${todayStr} (星期${["日", "一", "二", "三", "四", "五", "六"][todayDate.getDay()]})
- 今年年份是：${currentYearNum}
- 家庭成員名單（請只能設定給這幾位成員）：${FAMILY_MEMBERS.join(", ")}
  （如果成員的名字不在裡面，請禮貌地告知，並詢問要設定給哪一個家庭成員。'全家'也是合法的對象。注意：若是語音辨識造成的同音錯字（如喬玉->黃喬裕、宣倫->黃宣綸），請自動進行模糊比對並修正為正確的成員名稱）

${calendarContext}

【自動排程＆功能指示】
你可以直接代表用戶新增、修改或刪除行程！當你判斷用戶想要對行程做出「新增（排休、上班、活動等）」、「修改/變更」或「刪除」動作時，你必須在「說給用戶聽的日常問候話語」完畢後，在回答的最底端，另起一行，寫上標記：
[JSON_ACTION]
然後緊接著輸出一行且只有一行的 JSON block（不要有 Markdown code block 標記），格式規定如下：

1. 新增行程 (action: "create"):
   {"action": "create", "data": {"title": "必填（例如: 排休、上班、去醫院、買菜）", "member_name": "必填（名字必須完全對應家庭成員，如: 黃喬裕）", "start_date": "必填（格式為 YYYY-MM-DD，若為明天請換算為相應日期。非整天行程也必須填寫日期）", "end_date": "選填（預設跟 start_date 同一天）", "time": "選填（例如 14:30，或時間段 14:30 - 16:00）", "companions": "選填（同行的人）", "description": "選填（備註資訊）", "is_important": false}}

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

    const apiMessages = [
      { role: "system", content: systemPrompt },
      ...history.map(h => ({ role: h.role, content: h.content })),
      { role: "user", content: userQuery }
    ];

    const response = await axios.post(
      "https://api.openai.com/v1/chat/completions",
      {
        model: "gpt-4o-mini",
        messages: apiMessages,
        temperature: 0.7,
        max_tokens: 1000
      },
      {
        headers: {
          "Authorization": `Bearer ${apiKey}`,
          "Content-Type": "application/json"
        },
        timeout: 15000
      }
    );

    let assistantReply = response.data.choices[0].message.content || "";
    let actionExecutedText = "";

    // Parse JSON_ACTION if any
    const actionMarker = "[JSON_ACTION]";
    if (assistantReply.includes(actionMarker)) {
      const parts = assistantReply.split(actionMarker);
      const speech = parts[0].trim();
      const actionJsonStr = parts[1].trim();

      assistantReply = speech; // Strip JSON block from conversational reply

      try {
        const actionObj = JSON.parse(actionJsonStr);
        if (actionObj && actionObj.action && actionObj.data) {
          const actionResult = await executeGptAction(actionObj.action, actionObj.data);
          if (actionResult.success) {
            actionExecutedText = actionResult.message;
            assistantReply += `\n\n✨ 【自動排程動作】：${actionResult.message} 😊`;
          } else {
            assistantReply += `\n\n⚠️ 【排程動作失敗】：${actionResult.message}`;
          }
        }
      } catch (err: any) {
        console.error("❌ Failed to parse ChatGPT action JSON:", actionJsonStr, err.message);
      }
    }

    return {
      reply: assistantReply,
      actionExecuted: actionExecutedText || undefined
    };
  } catch (error: any) {
    console.error("❌ askChatGPT Error:", error.response?.data || error.message);
    const apiErr = error.response?.data?.error?.message || error.message;
    return {
      reply: `❌ 詢問 ChatGPT 時發生錯誤：${apiErr}\n（請檢查金鑰設定或是網路。)`
    };
  }
}

/**
 * Transcribe Audio using OpenAI Whisper
 */
export async function transcribeAudio(audioBuffer: Buffer): Promise<string> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey || apiKey.trim() === "" || apiKey === "YOUR_OPENAI_API_KEY_HERE") {
    throw new Error("⚠️ 系統尚未設定 ChatGPT API 金鑰，無法辨識語音。");
  }

  const openai = new OpenAI({ apiKey });

  try {
    const file = await OpenAI.toFile(audioBuffer, "audio.m4a");
    const response = await openai.audio.transcriptions.create({
      file: file as any,
      model: "whisper-1",
      language: "zh",
      prompt: "家庭成員名單：" + FAMILY_MEMBERS.join("，")
    });
    return response.text;
  } catch (error: any) {
    console.error("❌ transcribeAudio Error:", error.message);
    throw new Error(`語音辨識失敗: ${error.message}`);
  }
}
