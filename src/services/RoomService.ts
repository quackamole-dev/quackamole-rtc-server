import * as Quack from 'quackamole-shared-types';
import { randomUUID } from 'crypto';
import { PluginService } from './PluginService';

export class RoomService {
  static instance: RoomService;
  private readonly rooms: Record<Quack.RoomId, Quack.IAdminRoom> = {
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

  private readonly adminIdToRoomIdMap: Record<Quack.UserId, Quack.RoomId> = {};

  constructor() {
    RoomService.instance = this;
  }

  createRoom(roomRaw: Partial<Quack.IBaseRoom>): Quack.IAdminRoom {
    const room: Quack.IAdminRoom = {
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

  getRoomById(roomId: Quack.RoomId): Quack.IBaseRoom | undefined {
    const asAdmin = Boolean(this.adminIdToRoomIdMap[roomId]);
    const id = asAdmin ? this.adminIdToRoomIdMap[roomId] : roomId;

    const room = this.rooms[id];
    if (!room) return;
    return room; // TODO maybe return more data if asAdmin is true?
  }

  getAllRooms(): Quack.IBaseRoom[] {
    return Object.values(this.rooms);
  }

  updateRoom(id: string, data: Partial<Quack.IBaseRoom>): Quack.IBaseRoom | undefined {
    if (!id) return;
    const room: Quack.IBaseRoom | undefined = this.getRoomById(id);
    if (!room) return;
    room.name = data.name || room.name;
    room.maxUsers = data.maxUsers || room.maxUsers;

    return room;
  }

  join(socketId: Quack.SocketId, roomId: Quack.RoomId, adminId?: string): Quack.RoomJoinErrorCode {
    const room: Quack.IAdminRoom | undefined = this.rooms[roomId];
    if (!room) return 'does_not_exist';
    if (room.joinedUsers.includes(socketId)) return 'already_joined';
    if (room.joinedUsers.length >= room.maxUsers) return 'already_full';
    if (adminId && room.adminId !== adminId) return 'invalid_admin_id';
    this.rooms[roomId].joinedUsers.push(socketId);
    adminId && this.rooms[roomId].adminUsers.push(socketId);
  }

  setPlugin(roomId: Quack.RoomId, plugin: Quack.IPlugin | null, userId: Quack.UserId, iframeId: string): [Quack.IPlugin | null, Quack.PluginSetErrorCode] {
    const room: Quack.IBaseRoom | undefined = this.getRoomById(roomId);
    // if (!this.isAdminUser(roomId, userId)) return [null, 'permission_denied']; // TODO fix join as admin
    if (!room) return [null, 'room_not_found'];
    const pluginDb: Quack.IPlugin | undefined = PluginService.instance.getPluginById(plugin?.id);
    if (plugin && !pluginDb) return [null, 'plugin_not_found_in_db'];
    room.metadata[`plugin-${iframeId}`] = plugin;
    return [pluginDb || null, null];
  }

  isAdminUser(roomId: string, userId: string): boolean {
    const room: Quack.IBaseRoom | undefined = this.getRoomById(roomId);
    if (!room) return false;
    return room.adminUsers.includes(userId);
  }

  leave(socketId: Quack.SocketId, roomIds: Quack.RoomId[]): void {
    for (const roomId of roomIds) {
      const room: Quack.IBaseRoom | undefined = this.getRoomById(roomId);
      if (!room) continue;
      this.rooms[roomId].joinedUsers = room.joinedUsers.filter(id => id !== socketId);
    }
  }
}
