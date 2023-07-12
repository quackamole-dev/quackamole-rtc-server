import { IErrorResponseMessage, IMessageRelayDeliveryMessage, IPluginSetResponseMessage, IRoomEventJoinMessage, IRoomEventPluginSet, IRoomJoinResponseMessage, IUser, IUserLoginResponseMessage, IUserRegisterResponseMessage, RoomJoinErrorCode, RequestMessage, UserRegisterErrorCode } from 'quackamole-shared-types';
import { WebSocket } from 'uWebSockets.js';
import { publishJson } from '../helpers/publishJson';
import { sendJson } from '../helpers/sendJson';
import { RoomService } from '../services/RoomService';
import { SocketService } from '../services/SocketService';
import { UserService } from '../services/UserService';
import { MessageHandler } from '.';

export const handleMessageRelay: MessageHandler = (ws: WebSocket, message: RequestMessage): void => {
  if (message.type !== 'request__message_relay') throw new Error(`wrong action ${message.type} for handler handleRoomBroadcast`);
  if (!message.body.receiverIds?.length) return; // FIXME this should return a bad request message
  const topic = `rooms/${message.body.roomId}`;
  if (!ws.getTopics().some(t => t === topic)) return;
  const receiverSockets: WebSocket[] = [];

  for (const receiverId of message.body.receiverIds) {
    if (receiverId === ws.id) continue; // no point in sending message to yourself
    const receiverSocket = SocketService.instance.sockets.get(receiverId);
    if (!receiverSocket) continue;
    if (!receiverSocket.getTopics().some(t => t === topic)) continue;
    receiverSockets.push(receiverSocket);
  }

  if (receiverSockets.length !== message.body.receiverIds.length) return; // TODO return error message
  const deliveryMessage: IMessageRelayDeliveryMessage = { type: 'message_relay_delivery', senderId: ws.id, relayData: message.body.relayData, awaitId: '', roomId: message.body.roomId };
  const stringifiedMessage = JSON.stringify(deliveryMessage);
  receiverSockets.forEach(s => s.send(stringifiedMessage));
};

export const handleRoomCreate: MessageHandler = (ws: WebSocket, message: RequestMessage): void => {
  if (message.type !== 'request__room_create') throw new Error(`wrong action ${message.type} for handler handleRoomBroadcast`);
  RoomService.instance.createRoom(message.body);
};

export const handleRoomJoin: MessageHandler = (ws: WebSocket, {type, awaitId, body}: RequestMessage): void =>  {
  if (type !== 'request__room_join') throw new Error(`wrong action ${type} for handler handleRoomBroadcast`);
  if (!body?.roomId) throw new Error('invalid roomId');
  const roomId = body.roomId;
  const error: RoomJoinErrorCode | undefined = RoomService.instance.join(ws.id, roomId);

  if (error) {
    console.log(`Socket ${ws.id} failed joining roomID: ${roomId}:`, error);
    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-ignore
    return sendJson<IErrorResponseMessage>(ws, JSON.stringify({ type: 'response__error', awaitId, code: 400, message: error, requestType: type }));
    // TODO FIXME I used to stringify twice leading to no errors being sent to the client. Now it is fixed here when uncommented but the client needs to be fixed too
  }

  const topic = `rooms/${roomId}`;
  ws.subscribe(topic);
  ws.roomIds.push(roomId);
  console.log(`Socket ${ws.id} joined roomID: ${roomId}`);
  const room = RoomService.instance.getRoomById(roomId);
  if (!room) throw new Error(`Room ${roomId} not found`);
  const users = UserService.instance.getUsersById(room.joinedUsers);
  sendJson<IRoomJoinResponseMessage>(ws, { type: 'response__room_join', awaitId, room, users, requestType: type });
  publishJson<IRoomEventJoinMessage>(ws, topic, { type: 'room_event__user_joined', roomId, data: { user: ws.user }, timestamp: Date.now() });
};

export const handleUserRegister: MessageHandler = (ws: WebSocket, {type, awaitId, body}: RequestMessage): void =>  {
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

export const handleUserLogin: MessageHandler = (ws: WebSocket, message: RequestMessage): void =>  {
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

export const handlePluginSet: MessageHandler = (ws: WebSocket, message: RequestMessage): void =>  {
  if (message.type !== 'request__plugin_set') throw new Error(`wrong action ${message.type} for handler handleRoomBroadcast`);
  const { roomId, plugin, iframeId } = message.body;
  const [pluginDb, error] = RoomService.instance.setPlugin(roomId, plugin, ws.user.id, iframeId);
  if (error) return sendJson<IErrorResponseMessage>(ws, { type: 'response__error', awaitId: message.awaitId, requestType: message.type, code: 400, message: error });
  sendJson<IPluginSetResponseMessage>(ws, { type: 'response__plugin_set', awaitId: message.awaitId, roomId, iframeId, plugin: pluginDb, requestType: message.type});
  publishJson< IRoomEventPluginSet>(ws, `rooms/${roomId}`, { type: 'room_event__plugin_set', roomId: message.body.roomId, timestamp: Date.now(), data: { iframeId, plugin: pluginDb } });
};
