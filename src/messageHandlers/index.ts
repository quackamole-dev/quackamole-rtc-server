import { RequestMessage } from 'quackamole-shared-types';
import {WebSocket} from 'uWebSockets.js';
import { handleMessageRelay } from './handleMessageRelay';
import { handlePluginSet } from './handlePluginSet';
import { handleRoomBroadcast } from './handleRoomBroadcast';
import { handleRoomCreate } from './handleRoomCreate';
import { handleRoomJoin } from './handleRoomJoin';
import { handleUserLogin } from './handleUserLogin';
import { handleUserRegister } from './handleUserRegister';

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
