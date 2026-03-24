import { middleware } from '@line/bot-sdk';
try {
  const mw = middleware({ channelAccessToken: '', channelSecret: '' });
  console.log("Middleware Success");
} catch (e) {
  console.error("Middleware Error:", e.message);
}
