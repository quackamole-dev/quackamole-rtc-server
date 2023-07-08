import { randomUUID } from 'crypto';


export class UserService {
  static instance: UserService;
  private readonly users: Map<string, IUser> = new Map();
  private readonly userSecretToUserIdMap: Map<string, string> = new Map();

  constructor() {
    UserService.instance = this;
  }

  createUser(displayName: string): [IUser, string] {
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
    if (user) user.displayName = newDisplayName
  }

  getUserById(id: string): IUser | undefined {
    return this.users.get(id);
  }

  getUserBySecret(secret: string): IUser | undefined {
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

export type UserId = string;

export interface IUser {
  id: UserId;
  displayName: string;
  status: string;
  lastSeen: number;
}

export interface IUserSecret {
  userId: string;
  secret: string;
}
