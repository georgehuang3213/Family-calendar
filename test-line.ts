import { Client } from '@line/bot-sdk';
try {
  const client = new Client({ channelAccessToken: '', channelSecret: '' });
  console.log("Success");
} catch (e) {
  console.error("Error:", e.message);
}
