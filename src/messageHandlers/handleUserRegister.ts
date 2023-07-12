import { IUser, IUserRegisterResponseMessage, RequestMessage, UserRegisterErrorCode } from 'quackamole-shared-types';
import { WebSocket } from 'uWebSockets.js';
import { sendJson } from '../helpers/sendJson';
import { UserService } from '../services/UserService';
import { MessageHandler } from '.';

export const handleUserRegister: MessageHandler = (ws: WebSocket, { type, awaitId, body }: RequestMessage): void => {
  if (type !== 'request__user_register') throw new Error(`wrong action ${type} for handler handleRoomBroadcast`);
  const errors: UserRegisterErrorCode[] = [];
  if (!body.displayName) errors.push('missing_display_name');
  if (body.displayName.length < 3) errors.push('display_name_too_short');
  if (body.displayName.length > 16) errors.push('display_name_too_long');
  if (errors.length) return sendJson<IUserRegisterResponseMessage>(ws, { type: 'response__user_register', awaitId, user: {} as IUser, secret: '', requestType: type });

  const [user, secret] = UserService.instance.createUser(body.displayName);
  ws.user = user;
  ws.secret = secret;
  sendJson<IUserRegisterResponseMessage>(ws, { type: 'response__user_register', awaitId, user, secret, requestType: type });
};
