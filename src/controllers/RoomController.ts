import {HttpRequest, HttpResponse} from 'uWebSockets.js';
import {HttpHandler} from '../routes';
import {parseBodyObj} from '../helpers/parseBody';
import {IRoom, RoomService} from "../services/RoomService";


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

export const create: HttpHandler = async (res: HttpResponse, req: HttpRequest) => {
  const body = await parseBodyObj<Partial<IRoom>>(res);
  if (!body) return res.writeStatus('404 Not Found').end();
  const room = RoomService.instance.createRoom(body);
  if (!room) return res.writeStatus('404 Not Found').end();
  const serialized = JSON.stringify(room);
  return res.writeStatus('201 created').writeHeader('Content-Type', 'application/json').end(serialized);
};
