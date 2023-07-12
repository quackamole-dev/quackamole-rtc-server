import { IErrorResponseMessage, IRoomEventJoinMessage, IRoomJoinResponseMessage, RoomJoinErrorCode, RequestMessage } from 'quackamole-shared-types';
import { USocket } from '../QuackamoleServer';
import { publishJson } from '../helpers/publishJson';
import { sendJson } from '../helpers/sendJson';
import { RoomService } from '../services/RoomService';
import { UserService } from '../services/UserService';
import { MessageHandler } from '.';

export const handleRoomJoin: MessageHandler = (ws: USocket, { type, awaitId, body }: RequestMessage): void => {
  if (type !== 'request__room_join') throw new Error(`wrong action ${type} for handler handleRoomBroadcast`);
  if (!body?.roomId) throw new Error('invalid roomId');
  const wsUserData = ws.getUserData();
  const roomId = body.roomId;
  const error: RoomJoinErrorCode | undefined = RoomService.instance.join(wsUserData.id, roomId);

  if (error) {
    console.log(`Socket ${wsUserData.id} failed joining roomID: ${roomId}:`, error);
    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-ignore
    return sendJson<IErrorResponseMessage>(ws, JSON.stringify({ type: 'response__error', awaitId, code: 400, message: error, requestType: type }));
    // TODO FIXME I used to stringify twice leading to no errors being sent to the client. Now it is fixed here when uncommented but the client needs to be fixed too
  }

  const topic = `rooms/${roomId}`;
  ws.subscribe(topic);
  wsUserData.roomIds.push(roomId);
  console.log(`Socket ${wsUserData.id} joined roomID: ${roomId}`);
  const room = RoomService.instance.getRoomById(roomId);
  if (!room) throw new Error(`Room ${roomId} not found`);
  const users = UserService.instance.getUsersById(room.joinedUsers);
  sendJson<IRoomJoinResponseMessage>(ws, { type: 'response__room_join', awaitId, room, users, requestType: type });
  publishJson<IRoomEventJoinMessage>(ws, topic, { type: 'room_event__user_joined', roomId, data: { user: wsUserData.user }, timestamp: Date.now() });
};
