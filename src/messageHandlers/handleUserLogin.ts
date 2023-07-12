import { IUser, IUserLoginResponseMessage, RequestMessage } from 'quackamole-shared-types';
import { WebSocket } from 'uWebSockets.js';
import { sendJson } from '../helpers/sendJson';
import { SocketService } from '../services/SocketService';
import { UserService } from '../services/UserService';
import { MessageHandler } from '.';

export const handleUserLogin: MessageHandler = (ws: WebSocket, message: RequestMessage): void => {
  if (message.type !== 'request__user_login') throw new Error(`wrong action ${message.type} for handler handleRoomBroadcast`);
  const user = UserService.instance.getUserBySecret(message.body.secret);
  if (!user) {
    sendJson<IUserLoginResponseMessage>(ws, { type: 'response__user_login', awaitId: message.awaitId, user: {} as IUser, token: '', requestType: message.type });
    return;
  }

  ws.user = user;
  ws.id = user.id;
  SocketService.instance.sockets.set(ws.id, ws);
  sendJson<IUserLoginResponseMessage>(ws, { type: 'response__user_login', awaitId: message.awaitId, user, token: 'dummy', requestType: message.type });
};
