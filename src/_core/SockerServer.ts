import { IAdminRoom, IBaseRoom, PluginSetErrorCode, RoomId, RoomJoinErrorCode, RoomService } from '../services/RoomService';
import { TemplatedApp, WebSocket } from 'uWebSockets.js';
import { randomUUID } from 'crypto';
import { IUser, UserId, UserService } from '../services/UserService';

export class SocketService {
  readonly sockets: Map<string, WebSocket> = new Map();
  private userService: UserService;
  private roomService: RoomService;
  private app: TemplatedApp;

  constructor(app: TemplatedApp) {
    this.app = app;
    this.roomService = RoomService.instance;
    this.userService = UserService.instance;

    this.app.ws('/ws', {
      idleTimeout: 0,
      open: this.openSocketHandler.bind(this),
      close: this.closeSocketHandler.bind(this),
      message: this.messageHandler.bind(this),
      maxBackpressure: 1024 * 1024 * 4,
      maxPayloadLength: 64 * 1024,
    });
  }

  private openSocketHandler(ws: WebSocket): void {
    ws.id = randomUUID();
    ws.roomIds = [];
    // ws.subscribe('global'); // FIXME not used atm but maybe useful for server to ping sockets?
    // this.sockets.set(ws.id, ws);
    // Send the new socket its own id
    // ws.send(JSON.stringify({ topic: `personal`, id: ws.id, type: 'init' }));
    console.log('socket opened', ws.id);
  }

  private closeSocketHandler(ws: WebSocket): void {
    console.log('closing socket', ws.id);
    this.sockets.delete(ws.id);
    this.roomService.leave(ws.id, ws.roomIds);

    console.log('close socket', ws.id);
    for (const id of ws.roomIds) {
      const topic = `rooms/${id}`;
      console.log('close socket broadcast leave room', topic, ws.id, id);
      const roomEventMessage: IRoomEventLeaveMessage = { type: 'room_event', roomId: id, eventType: 'user_left', data: { user: ws.user } };
      this.app.publish(topic, JSON.stringify(roomEventMessage));
    }
  }

  private messageHandler(ws: WebSocket, rawMessage: ArrayBuffer): void {
    const message: SocketToServerMessage = this.parseMessage(ws, rawMessage);
    console.log('websocket message received', message, ws.id);
    if (message.action === 'room_create') this.handleRoomCreate(ws, message as ICreateRoomMessage);
    else if (message.action === 'room_join') this.handleRoomJoin(ws, message as IRoomJoinMessage);
    else if (message.action === 'room_broadcast') this.handleRoomBroadcast(ws, message as IBroadcastMessage);
    else if (message.action === 'message_relay') this.handleMessageRelay(ws, message as IMessageRelayMessage);
    else if (message.action === 'user_register') this.handleUserRegister(ws, message as IUserRegisterMessage);
    else if (message.action === 'user_login') this.handleUserLogin(ws, message as IUserLoginMessage);
    else if (message.action === 'plugin_set') this.handlePluginSet(ws, message as IPluginSetMessage);
    else console.log(`no message handler found`);
  }

  private parseMessage(ws: WebSocket, rawMessage: ArrayBuffer): SocketToServerMessage {
    const message: SocketToServerMessage = JSON.parse(Buffer.from(rawMessage).toString());
    message.timestamp = Date.now();
    message.socketId = ws.id;
    return message;
  }

  private handleRoomBroadcast(ws: WebSocket, message: IBroadcastMessage): void {
    for (const id of message.roomIds) {
      const topic = `rooms/${id}`;
      ws.publish(topic, JSON.stringify({ topic, type: 'broadcast', data: message.data }));
    }
  }

  private handleMessageRelay(ws: WebSocket, message: IMessageRelayMessage): void {
    console.log('----handleMSRELAY 1');
    if (!message.receiverIds?.length) return; // FIXME this should return a bad request message
    console.log('----handleMSRELAY 2');
    const topic = `rooms/${message.roomId}`;
    if (!ws.getTopics().some(t => t === topic)) return;
    console.log('----handleMSRELAY 3');
    const receiverSockets: WebSocket[] = [];

    for (const receiverId of message.receiverIds) {
      if (receiverId === ws.id) continue; // no point in sending message to yourself
      const receiverSocket = this.sockets.get(receiverId);
      console.log('----handleMSRELAY receiverSocket', this.sockets);
      if (!receiverSocket) continue;
      if (!receiverSocket.getTopics().some(t => t === topic)) continue;
      console.log('----handleMSRELAY receiverSocket after check shared topic', receiverSocket?.id);

      receiverSockets.push(receiverSocket);
    }

    console.log('----handleMSRELAY 4', receiverSockets.length);


    if (receiverSockets.length !== message.receiverIds.length) return; // TODO return error message
    console.log('----handleMSRELAY 5');
    const deliveryMessage: IMessageRelayDeliveryMessage = { type: 'message_relay_delivery', senderId: ws.id, data: message.data, awaitId: '', errors: [] };
    const stringifiedMessage = JSON.stringify(deliveryMessage);
    console.log('---------handleMessageRelay - delivery message', deliveryMessage);
    receiverSockets.forEach(s => s.send(stringifiedMessage));
  }

  private handleRoomCreate(ws: WebSocket, message: ICreateRoomMessage): void {
    this.roomService.createRoom(message.data);
  }

  private handleRoomJoin(ws: WebSocket, message: IRoomJoinMessage): void {
    const error: RoomJoinErrorCode = this.roomService.join(ws.id, message.data.roomId);

    if (error) {
      console.log(`Socket ${ws.id} failed joining roomID: ${message.data.roomId}:`, error);
      const res: IBaseResponseMessage = { type: 'room_join_response', awaitId: message.awaitId!, errors: [error] };
      ws.send(JSON.stringify(JSON.stringify(res)));
      return;
    }

    const topic = `rooms/${message.data.roomId}`;
    ws.subscribe(topic);
    ws.roomIds.push(message.data.roomId);
    console.log(`Socket ${ws.id} joined roomID: ${message.data.roomId}`);
    const room = RoomService.instance.getRoomById(message.data.roomId);
    if (!room) throw new Error(`Room ${message.data.roomId} not found`);
    const res: IRoomJoinResponseMessage = { type: 'room_join_response', awaitId: message.awaitId!, room, errors: [] };
    ws.send(JSON.stringify(res));
    const roomEventMessage: IRoomEventJoinMessage = { type: 'room_event', roomId: message.data.roomId, eventType: 'user_joined', data: { user: ws.user } };
    ws.publish(topic, JSON.stringify(roomEventMessage));
  }

  private handleUserRegister(ws: WebSocket, message: IUserRegisterMessage): void {
    const [user, secret] = this.userService.createUser(message.data.displayName);
    ws.user = user;
    ws.secret = secret
    const res: IUserRegisterResponseMessage = { type: 'user_register_response', awaitId: message.awaitId!, user, secret, errors: [] };
    console.log('---------reg res', res);
    ws.send(JSON.stringify(res));
  }

  private handleUserLogin(ws: WebSocket, message: IUserLoginMessage): void {
    const user = this.userService.getUserBySecret(message.data.secret);
    if (!user) {
      const res: IUserLoginResponseMessage = { type: 'user_login_response', awaitId: message.awaitId!, user: {} as IUser, token: '', errors: ['does_not_exist'] };
      return ws.send(JSON.stringify(res)) as any;
    }

    ws.user = user;
    ws.id = user.id;
    this.sockets.set(ws.id, ws);
    const res: IUserLoginResponseMessage = { type: 'user_login_response', awaitId: message.awaitId!, user, token: 'dummy', errors: [] };
    ws.send(JSON.stringify(res));
  }

  private handlePluginSet(ws: WebSocket, message: IPluginSetMessage): void {
    const { roomId, pluginId } = message.data;
    const error: PluginSetErrorCode = this.roomService.setPlugin(roomId, pluginId, ws.user.id);
    if (error) {
      const res: IPluginSetResponseMessage = { type: 'plugin_set_response', awaitId: message.awaitId!, roomId, pluginId, errors: [error] };
      return ws.send(JSON.stringify(res)) as any;
    }

    const res: IPluginSetResponseMessage = { type: 'plugin_set_response', awaitId: message.awaitId!, roomId, pluginId, errors: [] };
    ws.send(JSON.stringify(res));
    const roomEventMessage: IRoomEventPluginSet = { type: 'room_event', roomId: message.data.roomId, eventType: 'plugin_set', data: { roomId, pluginId } };
    ws.publish(`rooms/${roomId}`, JSON.stringify(roomEventMessage));
  }
}


export type SocketId = string;

export interface IBaseResponseMessage {
  type: string;
  awaitId: string;
  errors: string[];
}

export interface IUserRegisterResponseMessage extends IBaseResponseMessage {
  type: 'user_register_response';
  user: IUser;
  secret: string;
}

export interface IUserLoginResponseMessage extends IBaseResponseMessage {
  type: 'user_login_response';
  user: IUser;
  token: string;
}

export interface IRoomJoinResponseMessage extends IBaseResponseMessage {
  type: 'room_join_response';
  room: IBaseRoom;
  // error: RoomJoinErrorCode;
}

export interface IRoomCreateResponseMessage {
  type: 'room_create_response';
  room: IAdminRoom;
}

export interface IMessageRelayDeliveryMessage extends IBaseResponseMessage {
  type: 'message_relay_delivery';
  senderId: SocketId;
  data: unknown;
}

export interface IPluginSetResponseMessage extends IBaseResponseMessage {
  type: 'plugin_set_response';
  roomId: RoomId;
  pluginId: string;
}

///////////////////////////////////////////

export interface IBaseRoomEventMessage {
  type: 'room_event';
  roomId: RoomId;
  eventType: 'user_joined' | 'user_left' | 'user_data_changed' | 'admin_settings_changed' | 'plugin_set';
}

export interface IRoomEventJoinMessage extends IBaseRoomEventMessage {
  eventType: 'user_joined';
  data: { user: IUser };
}

export interface IRoomEventLeaveMessage extends IBaseRoomEventMessage {
  eventType: 'user_left';
  data: { user: IUser };
}

export interface IRoomEventUserDataChangeMessage extends IBaseRoomEventMessage {
  eventType: 'user_data_changed';
  data: { user: IUser, changedProperties: (keyof IUser)[] };
}

export interface IRoomEventPluginSet extends IBaseRoomEventMessage {
  eventType: 'plugin_set';
  data: { roomId: RoomId, pluginId: string };
}

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

export type Actions = 'room_create' | 'room_join' | 'room_broadcast' | 'message_relay' | 'user_register' | 'user_login';

export type SocketToServerMessage = IMessageRelayMessage | ICreateRoomMessage | IRoomJoinMessage | IBroadcastMessage;

interface IBaseSocketToServerMessage {
  timestamp: number;
  socketId: SocketId;
  action: Actions;
  awaitId?: string;
  data?: Record<string, unknown> | string | number | unknown;
}

export interface IBroadcastMessage extends IBaseSocketToServerMessage {
  roomIds: RoomId[];
}

export interface IMessageRelayMessage extends IBaseSocketToServerMessage {
  roomId: RoomId;
  receiverIds?: SocketId[];
}

export interface ICreateRoomMessage extends IBaseSocketToServerMessage {
  data: Partial<IBaseRoom>;
}

export interface IRoomJoinMessage extends IBaseSocketToServerMessage {
  data: { roomId: string };
}

export interface IUserRegisterMessage extends IBaseSocketToServerMessage {
  data: { displayName: string };
}

export interface IUserLoginMessage extends IBaseSocketToServerMessage {
  data: { secret: string };
}

export interface IPluginSetMessage extends IBaseSocketToServerMessage {
  data: { roomId: string, pluginId: string };
}