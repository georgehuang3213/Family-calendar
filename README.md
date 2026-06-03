# 家庭活動行事曆

家庭成員共用的活動 / 排班同步行事曆,整合 LINE Bot 推播、ChatGPT 智慧排程、語音輸入、天氣與台灣假日。

技術:React 19 + Vite + Express + Firebase Firestore + LINE Messaging API + OpenAI。

---

## 🔐 安全設定(重要,務必先讀)

本專案的資料(全家行程)**只能透過後端 API 存取**,且後端 API 受「家庭通行碼」保護。
請務必完成以下三件事,否則 App 會封鎖所有 API(回傳 503)以保護資料:

### 1. 部署 Firestore 安全規則
[firestore.rules](firestore.rules) 已設定為「拒絕所有用戶端直接存取」(只允許後端 admin SDK)。
修改後必須部署才會生效:

```bash
firebase deploy --only firestore:rules
```

> 也可以在 Firebase 主控台 → Firestore Database → 規則,貼上 `firestore.rules` 內容後按「發布」。

### 2. 設定環境變數
在本機請建立 `.env`(已被 `.gitignore` 忽略,不會被提交);在 Vercel 請於專案 Settings → Environment Variables 設定:

| 變數 | 用途 | 必填 |
|---|---|---|
| `FAMILY_ACCESS_KEY` | **家庭共用通行碼**。全家共用這一組密碼,每台裝置輸入一次。建議用長一點的隨機字串。 | ✅ |
| `CRON_SECRET` | 保護每日推播 / 提醒的 cron 端點。設一組隨機字串即可(Vercel Cron 會自動帶上)。 | ✅ |
| `FIREBASE_SERVICE_ACCOUNT_KEY` | Firebase 服務帳戶 JSON(整段貼上)。後端存取 Firestore 用。 | ✅ |
| `OPENAI_API_KEY` | ChatGPT 對話 / 排程 / 語音辨識。 | 選填 |
| `LINE_CHANNEL_ACCESS_TOKEN` | LINE Messaging API 推播用。 | 選填 |
| `LINE_CHANNEL_SECRET` | LINE webhook 簽章驗證(32 碼)。 | 選填 |
| `LINE_GROUP_ID` | 要推播的 LINE 群組 ID(以 C/U/R 開頭)。 | 選填 |

### 3. 第一次進入
打開網頁會看到登入畫面,輸入你設定的 `FAMILY_ACCESS_KEY` 即可。通行碼會記在該裝置的瀏覽器中,下次自動帶入。

> 安全提醒:`FAMILY_ACCESS_KEY` 與 `CRON_SECRET` 等真正的密鑰只放在後端環境變數,不會出現在前端程式碼或 bundle 中。

---

## 本機開發

需求:Node.js

```bash
npm install
npm run dev
```

伺服器會在 http://localhost:3000 啟動(同時提供前端與 API)。

## 部署

部署於 Vercel(見 [vercel.json](vercel.json))。每日早上 07:00(台北時間)會自動推播當日行程到 LINE 群組。
