import {SocketId} from '../_core/SocketService';
import {randomUUID} from 'crypto';


export class RoomService {
  static instance: RoomService;
  private readonly rooms: Record<RoomId, IAdminRoom> = {
    'dummy-room-id': {
      id: 'dummy-room-id',
      adminId: 'admin-dummy-room-id',
      name: 'dummy room name',
      maxUsers: 4,
      joinedUsers: [],
      adminUsers: [],
    },
    'dummy-room-id-2': {
      id: 'dummy-room-id-2',
      adminId: 'admin-dummy-room-id-2',
      name: 'dummy room name 2',
      maxUsers: 4,
      joinedUsers: [],
      adminUsers: [],
    },
  };

  private readonly adminIdToRoomIdMap: Record<string, string> = {};

  constructor() {
    RoomService.instance = this;
  }

  createRoom(roomRaw: Partial<IBaseRoom>): IAdminRoom {
    const room: IAdminRoom = this.sanitize(roomRaw);
    this.rooms[room.id] = room;
    this.adminIdToRoomIdMap[room.adminId] = room.id;
    console.log(`Room: ${room.name} was created. RoomId: ${room.id}`);
    return room;
  }

  getRoomById(roomId: RoomId): IBaseRoom | undefined {
    const asAdmin: boolean = Boolean(this.adminIdToRoomIdMap[roomId]);
    const id = asAdmin ? this.adminIdToRoomIdMap[roomId] : roomId;

    const room = this.rooms[id];
    if (!room) return;
    return room; // TODO maybe return more data if asAdmin is true?
  }

  getAllRooms(): IBaseRoom[] {
    return Object.values(this.rooms);
  }

  updateRoom(id: string, data: Partial<IBaseRoom>): IBaseRoom | undefined {
    if (!id) return;
    const room: IBaseRoom | undefined = this.getRoomById(id);
    if (!room) return;

    room.name = data.name || room.name;
    room.maxUsers = data.maxUsers || room.maxUsers;

    return room;
  }

  join(socketId: SocketId, roomId: RoomId): RoomJoinErrorCode {
    const asAdmin: boolean = Boolean(this.adminIdToRoomIdMap[roomId]);
    const id = asAdmin ? this.adminIdToRoomIdMap[roomId] : roomId;

    const room: IBaseRoom | undefined = this.rooms[id];
    if (!room) return 'does_not_exist';
    if (room.joinedUsers.includes(socketId)) return 'already_joined';
    if (room.joinedUsers.length >= room.maxUsers) return 'already_full';

    this.rooms[id].joinedUsers.push(socketId);
    asAdmin && this.rooms[id].adminUsers.push(socketId);
  }

  leave(socketId: SocketId, roomIds: RoomId[]): void {
    for (const roomId of roomIds) {
      const room: IBaseRoom | undefined = this.getRoomById(roomId);
      if (!room) continue;
      this.rooms[roomId].joinedUsers = room.joinedUsers.filter(id => id !== socketId);
    }
  }

  private sanitize(rawRoomData: Partial<IAdminRoom>): IAdminRoom {
    return {
      id: randomUUID(),
      adminId: randomUUID(),
      name: rawRoomData.name || 'default room name',
      maxUsers: rawRoomData.maxUsers || 4,
      joinedUsers: [],
      adminUsers: [],
    };
  }
}

export interface IBaseRoom {
  id: RoomId;
  name: string;
  maxUsers: number;
  joinedUsers: string[]; // TODO make IUser but maybe only when retrieving or on demand?
  adminUsers: string[];
  metadata?: JSON;
  parentRoom?: IBaseRoom;
  childRooms?: IBaseRoom[];
}

export interface IAdminRoom extends IBaseRoom {
  adminId: RoomId; // TODO implement
}

export type RoomJoinErrorCode = 'wrong_password' | 'already_full' | 'does_not_exist' | 'already_joined' | null | undefined;

export type RoomId = string;
