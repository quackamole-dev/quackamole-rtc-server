import { RequestMessage } from 'quackamole-shared-types';
import {WebSocket} from 'uWebSockets.js';
import { handleRoomBroadcast } from './handleRoomBroadcast';
import { handleMessageRelay, handlePluginSet, handleRoomCreate, handleRoomJoin, handleUserLogin, handleUserRegister } from './handler';

export type MessageHandler = (ws: WebSocket, message: RequestMessage) => void;

export const messageHandlers: Record<RequestMessage['type'], MessageHandler> = {
  'request__user_register': handleUserRegister,
  'request__user_login': handleUserLogin,
  'request__room_create': handleRoomCreate,
  'request__room_join': handleRoomJoin,
  'request__room_broadcast': handleRoomBroadcast,
  'request__message_relay': handleMessageRelay,
  'request__plugin_set': handlePluginSet
};
