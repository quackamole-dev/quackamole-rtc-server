import { WebSocket } from 'uWebSockets.js';

export class SocketService {
  static instance: SocketService;
  readonly sockets: Map<string, WebSocket> = new Map();

  constructor() {
    SocketService.instance = this;
  }

  //   getSocket(id: string): WebSocket | undefined {
  //     return this.sockets.get(id);
  //   }

//   deleteSocket(id: string): boolean {
//     return this.sockets.delete(id);
//   }
}
