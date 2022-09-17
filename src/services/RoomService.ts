import {SocketId} from '../_core/SocketService';
import {randomUUID} from "crypto";


export class RoomService {
  static instance: RoomService;
  private readonly rooms: Record<RoomId, IRoom> = {
    'dummy-room-id': {
      id: 'dummy-room-id',
      name: 'dummy room name',
      maxUsers: 4,
      joinedUsers: [],
    },
    'dummy-room-id-2': {
      id: 'dummy-room-id-2',
      name: 'dummy room name 2',
      maxUsers: 4,
      joinedUsers: [],
    }
  };

  constructor() {
    RoomService.instance = this;
  }

  createRoom(roomRaw: Partial<IRoom>): IRoom {
    const room: IRoom = this.sanitize(roomRaw);
    this.rooms[room.id] = room;
    console.log(`Room: ${room.name} was created. RoomId: ${room.id}`);
    return room;
  }

  getRoomById(roomId: RoomId): IRoom | undefined {
    const room = this.rooms[roomId];
    if (!room) return;
    return room;
  }

  getAllRooms(): IRoom[] {
    return Object.values(this.rooms);
  }

  updateRoom(id: string, data: Partial<IRoom>): IRoom | undefined {
    if (!id) return;
    const room: IRoom | undefined = this.getRoomById(id);
    if (!room) return;

    room.name = data.name || room.name;
    room.maxUsers = data.maxUsers || room.maxUsers;

    return room;
  }

  join(socketId: SocketId, roomId: RoomId): RoomJoinErrorCode {
    const room: IRoom | undefined = this.rooms[roomId];
    if (!room) return 'does_not_exist';
    else if (room.joinedUsers.includes(socketId)) return 'already_joined';
    else if (room.joinedUsers.length >= room.maxUsers) return 'already_full';
    else this.rooms[roomId].joinedUsers.push(socketId);
  }

  leave(socketId: SocketId, roomIds: RoomId[]): void {
    for (const roomId of roomIds) {
      const room: IRoom | undefined = this.getRoomById(roomId);
      if (!room) continue;
      this.rooms[roomId].joinedUsers = room.joinedUsers.filter(id => id !== socketId);
    }
  }

  private sanitize(rawRoomData: Partial<IRoom>): IRoom {
    return {
      id: randomUUID(),
      // adminId: randomUUID(),
      name: rawRoomData.name || 'default room name',
      maxUsers: rawRoomData.maxUsers || 4,
      joinedUsers: [],
    };
  }
}

export interface IRoom {
  id: RoomId;
  // adminId?: RoomId; // TODO implement
  name: string;
  maxUsers: number;
  joinedUsers: string[]; // TODO make IUser?
  metadata?: JSON;
  parentRoom?: IRoom;
  childRooms?: IRoom[];
}

export type RoomJoinErrorCode = 'wrong_password' | 'already_full' | 'does_not_exist' | 'already_joined' | null | undefined;

export type RoomId = string;
