import { IBroadcastMessage, RequestMessage } from 'quackamole-shared-types';
import { USocket } from '../QuackamoleServer';
import { publishJson } from '../helpers/publishJson';
import { MessageHandler } from '.';

export const handleRoomBroadcast: MessageHandler = (ws: USocket, message: RequestMessage): void => {
  if (message.type !== 'request__room_broadcast') throw new Error(`wrong action ${message.type} for handler handleRoomBroadcast`);
  for (const id of message.body.roomIds) {
    const topic = `rooms/${id}`;
    publishJson<{ topic: string; type: 'broadcast'; data: IBroadcastMessage['body']; }>(ws, topic, { topic, type: 'broadcast', data: message.body });
  }
};
