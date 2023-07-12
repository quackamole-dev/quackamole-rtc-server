import { IErrorResponseMessage, IPluginSetResponseMessage, IRoomEventPluginSet, RequestMessage } from 'quackamole-shared-types';
import { WebSocket } from 'uWebSockets.js';
import { publishJson } from '../helpers/publishJson';
import { sendJson } from '../helpers/sendJson';
import { RoomService } from '../services/RoomService';
import { MessageHandler } from '.';

export const handlePluginSet: MessageHandler = (ws: WebSocket, message: RequestMessage): void => {
  if (message.type !== 'request__plugin_set') throw new Error(`wrong action ${message.type} for handler handleRoomBroadcast`);
  const { roomId, plugin, iframeId } = message.body;
  const [pluginDb, error] = RoomService.instance.setPlugin(roomId, plugin, ws.user.id, iframeId);
  if (error) return sendJson<IErrorResponseMessage>(ws, { type: 'response__error', awaitId: message.awaitId, requestType: message.type, code: 400, message: error });
  sendJson<IPluginSetResponseMessage>(ws, { type: 'response__plugin_set', awaitId: message.awaitId, roomId, iframeId, plugin: pluginDb, requestType: message.type });
  publishJson<IRoomEventPluginSet>(ws, `rooms/${roomId}`, { type: 'room_event__plugin_set', roomId: message.body.roomId, timestamp: Date.now(), data: { iframeId, plugin: pluginDb } });
};
