import * as Quack from 'quackamole-shared-types';
import {HttpRequest, HttpResponse} from 'uWebSockets.js';
import {parseBodyObj} from '../helpers/parseBody';
import {HttpHandler} from '../routes';
import {RoomService} from '../services/RoomService';

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export const list: HttpHandler = async (res: HttpResponse, req: HttpRequest) => {
  const serialized = JSON.stringify(RoomService.instance.getAllRooms());
  return res.writeHeader('Content-Type', 'application/json').end(serialized);
};

export const retrieve: HttpHandler = async (res: HttpResponse, req: HttpRequest) => {
  const room = RoomService.instance.getRoomById(req.getParameter(0));
  if (!room) return res.writeStatus('404 Not Found').end();
  const serialized = JSON.stringify(room);
  return res.writeStatus('200 OK').writeHeader('Content-Type', 'application/json').end(serialized);
};

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export const create: HttpHandler = async (res: HttpResponse, req: HttpRequest) => {
  const body = await parseBodyObj<Partial<Quack.IBaseRoom>>(res);
  if (!body) return res.writeStatus('404 Not Found').end();
  const room = RoomService.instance.createRoom(body);
  if (!room) return res.writeStatus('404 Not Found').end();
  const serialized = JSON.stringify(room);
  return res.writeStatus('201 created').writeHeader('Content-Type', 'application/json').end(serialized);
};
