import { SocketId } from '../_core/SockerServer';
import { randomUUID } from 'crypto';
import { UserId } from './UserService';
import { IPlugin, PluginService } from './PluginService';


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
      metadata: {}
    },
    'dummy-room-id-2': {
      id: 'dummy-room-id-2',
      adminId: 'admin-dummy-room-id-2',
      name: 'dummy room name 2',
      maxUsers: 4,
      joinedUsers: [],
      adminUsers: [],
      metadata: {}
    },
  };

  private readonly adminIdToRoomIdMap: Record<string, string> = {};

  constructor() {
    RoomService.instance = this;
  }

  createRoom(roomRaw: Partial<IBaseRoom>): IAdminRoom {
    const room: IAdminRoom = {
      id: randomUUID(),
      adminId: randomUUID(),
      name: roomRaw.name || 'default room name',
      maxUsers: roomRaw.maxUsers || 4,
      joinedUsers: [],
      adminUsers: [],
      metadata: {}
    };

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

  join(socketId: SocketId, roomId: RoomId, adminId?: string): RoomJoinErrorCode {
    const room: IAdminRoom | undefined = this.rooms[roomId];
    if (!room) return 'does_not_exist';
    if (room.joinedUsers.includes(socketId)) return 'already_joined';
    if (room.joinedUsers.length >= room.maxUsers) return 'already_full';
    if (adminId && room.adminId !== adminId) return 'invalid_admin_id';
    this.rooms[roomId].joinedUsers.push(socketId);
    adminId && this.rooms[roomId].adminUsers.push(socketId);
  }

  setPlugin(roomId: RoomId, plugin: IPlugin | null, userId: UserId, iframeId: string): [IPlugin | null, PluginSetErrorCode] {
    const room: IBaseRoom | undefined = this.getRoomById(roomId);
    // if (!this.isAdminUser(roomId, userId)) return [null, 'permission_denied']; // TODO fix join as admin
    if (!room) return [null, 'room_not_found'];
    const pluginDb: IPlugin | undefined = PluginService.instance.getPluginById(plugin?.id);
    if (plugin && !pluginDb) return [null, 'plugin_not_found_in_db'];
    room.metadata[`plugin-${iframeId}`] = plugin;
    return [pluginDb || null, null]
  }

  isAdminUser(roomId: string, userId: string): boolean {
    const room: IBaseRoom | undefined = this.getRoomById(roomId);
    if (!room) return false;
    return room.adminUsers.includes(userId);
  }

  leave(socketId: SocketId, roomIds: RoomId[]): void {
    for (const roomId of roomIds) {
      const room: IBaseRoom | undefined = this.getRoomById(roomId);
      if (!room) continue;
      this.rooms[roomId].joinedUsers = room.joinedUsers.filter(id => id !== socketId);
    }
  }
}

export interface IBaseRoom {
  id: RoomId;
  name: string;
  maxUsers: number;
  joinedUsers: string[]; // TODO make IUser but maybe only when retrieving or on demand?
  adminUsers: string[];
  plugin?: IPlugin;
  metadata: Record<string, unknown>;
  parentRoom?: IBaseRoom;
  childRooms?: IBaseRoom[];
}

export interface IAdminRoom extends IBaseRoom {
  adminId: RoomId; // TODO implement
}

export type RoomJoinErrorCode = 'wrong_password' | 'already_full' | 'does_not_exist' | 'already_joined' | 'invalid_admin_id' | null | undefined;
export type PluginSetErrorCode = 'room_not_found' | 'permission_denied' | 'plugin_not_found_in_db' | null | undefined;

export type RoomId = string;
