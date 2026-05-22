import { appPromise } from '../server.js';

export const config = {
  api: {
    bodyParser: false,
  },
};

export const maxDuration = 60; // 60 seconds (Hobby max is 10s or 60s, depending on plan, but this overrides default)

export default async (req: any, res: any) => {
  const app = await appPromise;
  return app(req, res);
};
