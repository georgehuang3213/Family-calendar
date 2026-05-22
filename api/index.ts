import { appPromise } from '../server.js';

export const config = {
  api: {
    bodyParser: false,
  },
};

export default async (req: any, res: any) => {
  const app = await appPromise;
  return app(req, res);
};
