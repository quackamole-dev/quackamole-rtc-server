import { USocket } from '../QuackamoleServer';

export class SocketService {
  static instance: SocketService;
  readonly sockets: Map<string, USocket> = new Map();

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
