/* eslint-disable @typescript-eslint/no-non-null-assertion */
import * as Q from 'quackamole-shared-types';
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
    console.log('socket opened', ws.id);
  }

  private closeSocketHandler(ws: WebSocket): void {
    console.log('closing socket', ws.id);
    this.sockets.delete(ws.id);
    this.roomService.leave(ws.id, ws.roomIds);
    for (const id of ws.roomIds) {
      const topic = `rooms/${id}`;
      console.log('close socket broadcast leave room', topic, ws.id, id);
      this.publishJson<Q.IRoomEventLeaveMessage>(this.app, topic, { type: 'room_event', roomId: id, eventType: 'user_left', data: { user: ws.user } });
    }
  }

  private messageHandler(ws: WebSocket, rawMessage: ArrayBuffer): void {
    const message: Q.SocketToServerMessage = this.parseMessage(ws, rawMessage);
    console.log('websocket message received', message, ws.id);
    if (message.action === 'room_create') this.handleRoomCreate(ws, message as Q.ICreateRoomMessage);
    else if (message.action === 'room_join') this.handleRoomJoin(ws, message as Q.IRoomJoinMessage);
    else if (message.action === 'room_broadcast') this.handleRoomBroadcast(ws, message as Q.IBroadcastMessage);
    else if (message.action === 'message_relay') this.handleMessageRelay(ws, message as Q.IMessageRelayMessage);
    else if (message.action === 'user_register') this.handleUserRegister(ws, message as Q.IUserRegisterMessage);
    else if (message.action === 'user_login') this.handleUserLogin(ws, message as Q.IUserLoginMessage);
    else if (message.action === 'plugin_set') this.handlePluginSet(ws, message as Q.IPluginSetMessage);
    else console.log('no message handler found');
  }

  private parseMessage(ws: WebSocket, rawMessage: ArrayBuffer): Q.SocketToServerMessage {
    const message: Q.SocketToServerMessage = JSON.parse(Buffer.from(rawMessage).toString());
    message.timestamp = Date.now();
    message.socketId = ws.id;
    return message;
  }

  private handleRoomBroadcast(ws: WebSocket, message: Q.IBroadcastMessage): void {
    for (const id of message.roomIds) {
      const topic = `rooms/${id}`;
      this.publishJson<{topic: string, type: 'broadcast', data: Q.IBroadcastMessage['data']}>(ws, topic, { topic, type: 'broadcast', data: message.data });
    }
  }

  private handleMessageRelay(ws: WebSocket, message: Q.IMessageRelayMessage): void {
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
    const deliveryMessage: Q.IMessageRelayDeliveryMessage = { type: 'message_relay_delivery', senderId: ws.id, data: message.data, awaitId: '', errors: [] };
    const stringifiedMessage = JSON.stringify(deliveryMessage);
    receiverSockets.forEach(s => s.send(stringifiedMessage));
  }

  private handleRoomCreate(ws: WebSocket, message: Q.ICreateRoomMessage): void {
    this.roomService.createRoom(message.data);
  }

  private handleRoomJoin(ws: WebSocket, message: Q.IRoomJoinMessage): void {
    const error: Q.RoomJoinErrorCode = this.roomService.join(ws.id, message.data.roomId);

    if (error) {
      console.log(`Socket ${ws.id} failed joining roomID: ${message.data.roomId}:`, error);
      const res: Q.IBaseResponseMessage = { type: 'room_join_response', awaitId: message.awaitId!, errors: [error] };
      ws.send(JSON.stringify(JSON.stringify(res)));
      return;
      // TODO FIXME I used to stringify twice leading to no errors being sent to the client. Now it is fixed here when uncommented but the client needs to be fixed too
      // return this.sendJson<Q.IBaseResponseMessage>(ws, { type: 'room_join_response', awaitId: message.awaitId!, errors: [error] });
    }

    const topic = `rooms/${message.data.roomId}`;
    ws.subscribe(topic);
    ws.roomIds.push(message.data.roomId);
    console.log(`Socket ${ws.id} joined roomID: ${message.data.roomId}`);
    const room = RoomService.instance.getRoomById(message.data.roomId);
    if (!room) throw new Error(`Room ${message.data.roomId} not found`);
    const users = UserService.instance.getUsersById(room.joinedUsers);
    this.sendJson<Q.IRoomJoinResponseMessage>(ws, { type: 'room_join_response', awaitId: message.awaitId!, room, users, errors: [] });
    this.publishJson<Q.IRoomEventJoinMessage>(ws, topic, { type: 'room_event', roomId: message.data.roomId, eventType: 'user_joined', data: { user: ws.user } });
  }

  private handleUserRegister(ws: WebSocket, message: Q.IUserRegisterMessage): void {
    const errors: Q.UserRegisterErrorCode[] = [];
    if (!message.data.displayName) errors.push('missing_display_name');
    if (message.data.displayName.length < 3) errors.push('display_name_too_short');
    if (message.data.displayName.length > 16) errors.push('display_name_too_long');
    if (errors.length) return this.sendJson<Q.IUserRegisterResponseMessage>(ws, { type: 'user_register_response', awaitId: message.awaitId!, user: {} as Q.IUser, secret: '', errors });

    const [user, secret] = this.userService.createUser(message.data.displayName);
    ws.user = user;
    ws.secret = secret;
    this.sendJson<Q.IUserRegisterResponseMessage>(ws, { type: 'user_register_response', awaitId: message.awaitId!, user, secret, errors: [] });
  }

  private handleUserLogin(ws: WebSocket, message: Q.IUserLoginMessage): void {
    const user = this.userService.getUserBySecret(message.data.secret);
    if (!user) {
      this.sendJson<Q.IUserLoginResponseMessage>(ws, { type: 'user_login_response', awaitId: message.awaitId!, user: {} as Q.IUser, token: '', errors: ['user_not_found'] });
      return;
    }

    ws.user = user;
    ws.id = user.id;
    this.sockets.set(ws.id, ws);
    this.sendJson<Q.IUserLoginResponseMessage>(ws, { type: 'user_login_response', awaitId: message.awaitId!, user, token: 'dummy', errors: [] });
  }

  private handlePluginSet(ws: WebSocket, message: Q.IPluginSetMessage): void {
    const { roomId, plugin, iframeId } = message.data;
    const [pluginDb, error] = this.roomService.setPlugin(roomId, plugin, ws.user.id, iframeId);
    if (error) return this.sendJson<Q.IPluginSetResponseMessage>(ws, { type: 'plugin_set_response', awaitId: message.awaitId!, roomId, iframeId, plugin: pluginDb, errors: [error] });
    this.sendJson<Q.IPluginSetResponseMessage>(ws, { type: 'plugin_set_response', awaitId: message.awaitId!, roomId, iframeId, plugin: pluginDb, errors: []});
    this.publishJson< Q.IRoomEventPluginSet>(ws, `rooms/${roomId}`, { type: 'room_event', roomId: message.data.roomId, eventType: 'plugin_set', data: { roomId, iframeId, plugin: pluginDb } });
  }

  private sendJson<T>(ws: WebSocket, message: T): void {
    ws.send(JSON.stringify(message));
  }

  private publishJson<T>(context: WebSocket | TemplatedApp, topic: string, message: T): void {
    context.publish(topic, JSON.stringify(message));
  }
}
