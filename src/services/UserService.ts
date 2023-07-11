import { randomUUID } from 'crypto';
import * as Quack from 'quackamole-shared-types';

export class UserService {
  static instance: UserService;
  private readonly users: Map<string, Quack.IUser> = new Map();
  private readonly userSecretToUserIdMap: Map<string, string> = new Map();

  constructor() {
    UserService.instance = this;
  }

  createUser(displayName: string): [Quack.IUser, string] {
    console.log('creating user', displayName);
    const id = randomUUID();
    const secret = randomUUID();
    this.userSecretToUserIdMap.set(secret, id);
    const user = { id, displayName, status: 'online', lastSeen: Date.now() };
    this.users.set(id, user);
    return [user, secret];
  }

  updateDisplayName(userId: string, newDisplayName: string): string | undefined {
    const user = this.getUserById(userId);
    if (newDisplayName.length > 20) return 'Display name too long';
    if (newDisplayName.length < 3) return 'Display name too short';
    if (user) user.displayName = newDisplayName;
  }

  getUserById(id: string): Quack.IUser | undefined {
    return this.users.get(id);
  }

  getUsersById(ids: string[]): Quack.IUser[] {
    return ids
      .map(id => this.users.get(id))
      .filter(u => Boolean(u)) as Quack.IUser[];
  }

  getUserBySecret(secret: string): Quack.IUser | undefined {
    console.log('getUserBySecret', this.userSecretToUserIdMap);
    const id = this.userSecretToUserIdMap.get(secret);
    if (!id) return;
    return this.getUserById(id);
  }

  validateSecret(secret: string, userId: string): boolean {
    const id = this.userSecretToUserIdMap.get(secret);
    return id === userId && id !== undefined;
  }
}
