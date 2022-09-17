import {IRoom, RoomId, RoomJoinErrorCode, RoomService} from '../services/RoomService';
import {TemplatedApp, WebSocket} from "uWebSockets.js";
import {randomUUID} from "crypto";


export class SocketController {
  readonly sockets: Map<string, WebSocket> = new Map();
  private app: TemplatedApp;

  constructor(app: TemplatedApp) {
    this.app = app;

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
    this.sockets.set(ws.id, ws);
    // Send the new socket its own id
    ws.send(JSON.stringify({topic: `personal`, id: ws.id, type: 'init'}));
    console.log('socket joined', ws.id);
  }

  private closeSocketHandler(ws: WebSocket): void {
    console.log('closing socket', ws.id);
    this.sockets.delete(ws.id);
    RoomService.instance.leave(ws.id, ws.roomIds);

    console.log('close socket', ws.id);
    for (const id of ws.roomIds) {
      const topic = `rooms/${id}`;
      console.log('close socket broadcast leave room', topic, ws.id, id);
      this.app.publish(topic, JSON.stringify({topic, type: 'leave_room', socketId: ws.id, roomId: id}));
    }
  }

  messageHandler(ws: WebSocket, rawMessage: ArrayBuffer): void {
    const message: ISocketMessage = this.parseMessage(ws, rawMessage);
    console.log('websocket message received from dummy-client listener', message, ws.id);
    if (message.action === 'broadcast') this.handleBroadcast(ws, message as IBroadcastMessage);
    else if (message.action === 'relay') this.handleRelay(ws, message as IRelayMessage);
    else if (message.action === 'create_room') this.handleCreateRoom(ws, message as ICreateRoomMessage);
    else if (message.action === 'join_room') this.handleJoinRoom(ws, message as IJoinRoomMessage);
    else console.log(`no message handler found`);
  }

  private parseMessage(ws: WebSocket, rawMessage: ArrayBuffer): ISocketMessage {
    const message: ISocketMessage = JSON.parse(Buffer.from(rawMessage).toString());
    message.timestamp = Date.now();
    message.socketId = ws.id;
    return message;
  }

  private handleBroadcast(ws: WebSocket, message: IBroadcastMessage): void {
    for (const id of message.roomIds) {
      const topic = `rooms/${id}`;
      ws.publish(topic, JSON.stringify({topic, type: 'broadcast', data: message.data}));
    }
  }

  // TODO consider changing clientToServer messages to include the topic instead of differentiating them by type. It's inconsistent!
  private handleRelay(ws: WebSocket, message: IRelayMessage): void {
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
    receiverSockets.forEach(s => s.send(JSON.stringify({topic, roomId: message.roomId, type: 'relay', data: message.data})));
    // TODO allow deferring this until all receivers acknowledge having received the message. Promise.all() ?
  }

  private handleCreateRoom(ws: WebSocket, message: ICreateRoomMessage): void {
    RoomService.instance.createRoom(message.data);
  }

  private handleJoinRoom(ws: WebSocket, message: IJoinRoomMessage): void {
    const error: RoomJoinErrorCode = RoomService.instance.join(ws.id, message.roomId);

    if (error)  {
      console.log(`Socket ${ws.id} failed joining roomID: ${message.roomId}:`, error);
      ws.send(JSON.stringify({topic: 'personal', type: 'join_room', awaitId: message.awaitId, error}));
      return;
    }

    const topic = `rooms/${message.roomId}`;
    ws.subscribe(topic);
    ws.roomIds.push(message.roomId);
    console.log(`Socket ${ws.id} joined roomID: ${message.roomId}`);
    const room = RoomService.instance.getRoomById(message.roomId);
    ws.send(JSON.stringify({topic: 'personal', type: 'join_room', room, awaitId: message.awaitId}));
    ws.publish(topic, JSON.stringify({topic, type: 'join_room', roomId: message.roomId, socketId: ws.id}));
  }

  private isBroadcastMessage(message: ISocketMessage): message is IBroadcastMessage {
    // used when message should be sent to all sockets in a room
    return message.action === 'broadcast';
  }

  private isRelayMessage(message: ISocketMessage): message is IRelayMessage {
    // used when there is a need for more control over which sockets should receive the message
    return message.action === 'relay';
  }

  private isJoinRoomMessage(message: ISocketMessage): message is IJoinRoomMessage {
    return message.action === 'join_room';
  }

  private isCreateRoomMessage(message: ISocketMessage): message is ICreateRoomMessage {
    return message.action === 'create_room';
  }
}

export type SocketId = string;

export type Actions = 'create_room' | 'join_room' | 'relay' | 'broadcast';

export type ISocketMessage = IRelayMessage | ICreateRoomMessage | IJoinRoomMessage | IBroadcastMessage;

interface IBaseSocketMessage {
  /**
   * Time when message was first processed by server. Set by the server.
   */
  timestamp: number;
  /**
   * Lets server know what the message is about, so it can delegate it to the responsible handler for further actions.
   */
  action: Actions;
  /**
   * Identifies the socket which sent this message. Set by the server as client cannot be trusted here.
   */
  socketId: SocketId;
  /**
   * Set by client. Server will include this id with the response to the client message, allowing client to await the response.
   */
  awaitId?: string;

  data?: Record<string, unknown> | string | number;
}


export interface IBroadcastMessage extends IBaseSocketMessage {
  /**
   * Users can only send messages to other users if they joined the same room.
   */
  roomIds: RoomId[];
}

export interface IRelayMessage extends IBaseSocketMessage {
  roomId: RoomId;
  /**
   * List of sockets which should receive the payload.
   */
  receiverIds?: SocketId[];
}


export interface ICreateRoomMessage extends IBaseSocketMessage {
  data: Partial<IRoom>;
}


export interface IJoinRoomMessage extends IBaseSocketMessage {
  roomId: RoomId;
  // password: string;
}
