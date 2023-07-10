import * as Quack from 'quackamole-shared-types';
import { RoomService } from '../services/RoomService';
import { TemplatedApp, WebSocket } from 'uWebSockets.js';
import { randomUUID } from 'crypto';
import { UserService } from '../services/UserService';

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
      const roomEventMessage: Quack.IRoomEventLeaveMessage = { type: 'room_event', roomId: id, eventType: 'user_left', data: { user: ws.user } };
      this.app.publish(topic, JSON.stringify(roomEventMessage));
    }
  }

  private messageHandler(ws: WebSocket, rawMessage: ArrayBuffer): void {
    const message: Quack.SocketToServerMessage = this.parseMessage(ws, rawMessage);
    console.log('websocket message received', message, ws.id);
    if (message.action === 'room_create') this.handleRoomCreate(ws, message as Quack.ICreateRoomMessage);
    else if (message.action === 'room_join') this.handleRoomJoin(ws, message as Quack.IRoomJoinMessage);
    else if (message.action === 'room_broadcast') this.handleRoomBroadcast(ws, message as Quack.IBroadcastMessage);
    else if (message.action === 'message_relay') this.handleMessageRelay(ws, message as Quack.IMessageRelayMessage);
    else if (message.action === 'user_register') this.handleUserRegister(ws, message as Quack.IUserRegisterMessage);
    else if (message.action === 'user_login') this.handleUserLogin(ws, message as Quack.IUserLoginMessage);
    else if (message.action === 'plugin_set') this.handlePluginSet(ws, message as Quack.IPluginSetMessage);
    else console.log(`no message handler found`);
  }

  private parseMessage(ws: WebSocket, rawMessage: ArrayBuffer): Quack.SocketToServerMessage {
    const message: Quack.SocketToServerMessage = JSON.parse(Buffer.from(rawMessage).toString());
    message.timestamp = Date.now();
    message.socketId = ws.id;
    return message;
  }

  private handleRoomBroadcast(ws: WebSocket, message: Quack.IBroadcastMessage): void {
    for (const id of message.roomIds) {
      const topic = `rooms/${id}`;
      ws.publish(topic, JSON.stringify({ topic, type: 'broadcast', data: message.data }));
    }
  }

  private handleMessageRelay(ws: WebSocket, message: Quack.IMessageRelayMessage): void {
    if (!message.receiverIds?.length) return; // FIXME this should return a bad request message
    const topic = `rooms/${message.roomId}`;
    if (!ws.getTopics().some(t => t === topic)) return;
    const receiverSockets: WebSocket[] = [];

    for (const receiverId of message.receiverIds) {
      if (receiverId === ws.id) continue; // no point in sending message to yourself
      const receiverSocket = this.sockets.get(receiverId);
      if (!receiverSocket) continue;
      if (!receiverSocket.getTopics().some(t => t === topic)) continue;
      receiverSockets.push(receiverSocket);
    }

    if (receiverSockets.length !== message.receiverIds.length) return; // TODO return error message
    const deliveryMessage: Quack.IMessageRelayDeliveryMessage = { type: 'message_relay_delivery', senderId: ws.id, data: message.data, awaitId: '', errors: [] };
    const stringifiedMessage = JSON.stringify(deliveryMessage);
    receiverSockets.forEach(s => s.send(stringifiedMessage));
  }

  private handleRoomCreate(ws: WebSocket, message: Quack.ICreateRoomMessage): void {
    this.roomService.createRoom(message.data);
  }

  private handleRoomJoin(ws: WebSocket, message: Quack.IRoomJoinMessage): void {
    const error: Quack.RoomJoinErrorCode = this.roomService.join(ws.id, message.data.roomId);

    if (error) {
      console.log(`Socket ${ws.id} failed joining roomID: ${message.data.roomId}:`, error);
      const res: Quack.IBaseResponseMessage = { type: 'room_join_response', awaitId: message.awaitId!, errors: [error] };
      ws.send(JSON.stringify(JSON.stringify(res)));
      return;
    }

    const topic = `rooms/${message.data.roomId}`;
    ws.subscribe(topic);
    ws.roomIds.push(message.data.roomId);
    console.log(`Socket ${ws.id} joined roomID: ${message.data.roomId}`);
    const room = RoomService.instance.getRoomById(message.data.roomId);
    if (!room) throw new Error(`Room ${message.data.roomId} not found`);
    const users = UserService.instance.getUsersById(room.joinedUsers);
    const res: Quack.IRoomJoinResponseMessage = { type: 'room_join_response', awaitId: message.awaitId!, room, users, errors: [] };
    ws.send(JSON.stringify(res));
    const roomEventMessage: Quack.IRoomEventJoinMessage = { type: 'room_event', roomId: message.data.roomId, eventType: 'user_joined', data: { user: ws.user } };
    ws.publish(topic, JSON.stringify(roomEventMessage));
  }

  private handleUserRegister(ws: WebSocket, message: Quack.IUserRegisterMessage): void {
    let errors: Quack.UserRegisterErrorCode[] = [];
    if (!message.data.displayName) errors.push('missing_display_name');
    if (message.data.displayName.length < 3) errors.push('display_name_too_short');
    if (message.data.displayName.length > 16) errors.push('display_name_too_long');

    if (errors.length) {
      const res: Quack.IUserRegisterResponseMessage = { type: 'user_register_response', awaitId: message.awaitId!, user: {} as Quack.IUser, secret: '', errors };
      ws.send(JSON.stringify(res));
    }

    const [user, secret] = this.userService.createUser(message.data.displayName);
    ws.user = user;
    ws.secret = secret
    const res: Quack.IUserRegisterResponseMessage = { type: 'user_register_response', awaitId: message.awaitId!, user, secret, errors: [] };
    ws.send(JSON.stringify(res));
  }

  private handleUserLogin(ws: WebSocket, message: Quack.IUserLoginMessage): void {
    const user = this.userService.getUserBySecret(message.data.secret);
    if (!user) {
      const res: Quack.IUserLoginResponseMessage = { type: 'user_login_response', awaitId: message.awaitId!, user: {} as Quack.IUser, token: '', errors: ['user_not_found'] };
      return ws.send(JSON.stringify(res)) as any;
    }

    ws.user = user;
    ws.id = user.id;
    this.sockets.set(ws.id, ws);
    const res: Quack.IUserLoginResponseMessage = { type: 'user_login_response', awaitId: message.awaitId!, user, token: 'dummy', errors: [] };
    ws.send(JSON.stringify(res));
  }

  private handlePluginSet(ws: WebSocket, message: Quack.IPluginSetMessage): void {
    const { roomId, plugin, iframeId } = message.data;
    const [pluginDb, error] = this.roomService.setPlugin(roomId, plugin, ws.user.id, iframeId);
    if (error) {
      const res: Quack.IPluginSetResponseMessage = { type: 'plugin_set_response', awaitId: message.awaitId!, roomId, iframeId, plugin: pluginDb, errors: [error] };
      return ws.send(JSON.stringify(res)) as any;
    }

    const res: Quack.IPluginSetResponseMessage = { type: 'plugin_set_response', awaitId: message.awaitId!, roomId, iframeId, plugin: pluginDb, errors: [] };
    ws.send(JSON.stringify(res));
    const roomEventMessage: Quack.IRoomEventPluginSet = { type: 'room_event', roomId: message.data.roomId, eventType: 'plugin_set', data: { roomId, iframeId, plugin: pluginDb } };
    ws.publish(`rooms/${roomId}`, JSON.stringify(roomEventMessage));
  }
}
