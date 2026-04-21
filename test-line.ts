import dotenv from "dotenv";
import { Client } from "@line/bot-sdk";
dotenv.config();

async function test() {
  const lineConfig = {
    channelAccessToken: process.env.LINE_CHANNEL_ACCESS_TOKEN || '',
    channelSecret: process.env.LINE_CHANNEL_SECRET || '',
  };
  const groupId = process.env.LINE_GROUP_ID;
  console.log("Token length:", lineConfig.channelAccessToken.length);
  console.log("Secret length:", lineConfig.channelSecret.length);
  console.log("Group ID:", groupId);

  if (!groupId) {
    console.error("Missing GROUP ID");
    return;
  }
  const client = new Client(lineConfig);
  try {
    const res = await client.pushMessage(groupId, { type: 'text', text: '伺服器測試推播' });
    console.log("Success:", res);
  } catch (e: any) {
    console.error("Failed:", e.originalError?.response?.data || e.message);
  }
}
test();
