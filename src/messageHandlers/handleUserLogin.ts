import { IUser, IUserLoginResponseMessage, RequestMessage } from 'quackamole-shared-types';
import { USocket } from '../QuackamoleServer';
import { sendJson } from '../helpers/sendJson';
import { SocketService } from '../services/SocketService';
import { UserService } from '../services/UserService';
import { MessageHandler } from '.';

export const handleUserLogin: MessageHandler = (ws: USocket, message: RequestMessage): void => {
  if (message.type !== 'request__user_login') throw new Error(`wrong action ${message.type} for handler handleRoomBroadcast`);
  const user = UserService.instance.getUserBySecret(message.body.secret);
  if (!user) {
    sendJson<IUserLoginResponseMessage>(ws, { type: 'response__user_login', awaitId: message.awaitId, user: {} as IUser, token: '', requestType: message.type });
    return;
  }

  const wsUserData = ws.getUserData();
  wsUserData.user = user;
  wsUserData.id = user.id;
  SocketService.instance.sockets.set(wsUserData.id, ws);
  sendJson<IUserLoginResponseMessage>(ws, { type: 'response__user_login', awaitId: message.awaitId, user, token: 'dummy', requestType: message.type });
};
