import { appPromise } from '../server.js';

export default async (req: any, res: any) => {
  const app = await appPromise;
  return app(req, res);
};
