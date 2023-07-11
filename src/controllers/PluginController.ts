import { HttpRequest, HttpResponse } from 'uWebSockets.js';
import { HttpHandler } from '../routes';
import { PluginService } from '../services/PluginService';

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export const list: HttpHandler = async (res: HttpResponse, req: HttpRequest) => {
  const serialized = JSON.stringify(PluginService.instance.getAll());
  return res.writeHeader('Content-Type', 'application/json').end(serialized);
};
