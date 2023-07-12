import { RequestMessage } from 'quackamole-shared-types';
import { WebSocket } from 'uWebSockets.js';
import { RoomService } from '../services/RoomService';
import { MessageHandler } from '.';

export const handleRoomCreate: MessageHandler = (ws: WebSocket, message: RequestMessage): void => {
  if (message.type !== 'request__room_create') throw new Error(`wrong action ${message.type} for handler handleRoomBroadcast`);
  RoomService.instance.createRoom(message.body);
};
