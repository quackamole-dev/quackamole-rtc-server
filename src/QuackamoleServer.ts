import { randomUUID } from 'crypto';
import fs from 'fs';
import path from 'path';
import { lookup } from 'mime-types';
import { IRoomEventLeaveMessage, RequestMessage } from 'quackamole-shared-types';
import { App, SSLApp, TemplatedApp, WebSocket, us_listen_socket_close } from 'uWebSockets.js';
import { publishJson } from './helpers/publishJson';
import { setCorsHeaders } from './helpers/setCorsHeaders';
import { messageHandlers } from './messageHandlers';
import {Routes} from './routes';
import { PluginService } from './services/PluginService';
import { RoomService } from './services/RoomService';
import { SocketService } from './services/SocketService';
import { UserService } from './services/UserService';

export class QuackamoleServer {
  private listenSocket: unknown = null;
  private readonly app: TemplatedApp;
  private readonly port: number = 12000;
  private readonly sslEnabled: boolean;

  constructor(cert_file_name = '', key_file_name = '', port = 12000) {
    this.port = port;

    const filepathCert = path.resolve(__dirname, cert_file_name);
    const filepathKey = path.resolve(__dirname, key_file_name);

    this.sslEnabled = Boolean(cert_file_name && key_file_name && fs.existsSync(filepathCert) && fs.existsSync(filepathKey));
    cert_file_name && key_file_name && !this.sslEnabled && console.warn('ssl cert or key not found');
    this.app = this.sslEnabled ? SSLApp({ cert_file_name: filepathCert, key_file_name: filepathKey }) : App();

    this.registerHttpRoutes();
    new RoomService();
    new PluginService();
    new UserService();
    new SocketService();

    this.app.ws('/ws', {
      idleTimeout: 0,
      open: this.openSocketHandler.bind(this),
      close: this.closeSocketHandler.bind(this),
      message: this.mainMessageHandler.bind(this),
      maxBackpressure: 1024 * 1024 * 4,
      maxPayloadLength: 64 * 1024,
    });
  }

  private registerHttpRoutes() {

    Routes.forEach(route => {
      this.app[route.method]('/api' + route.route, async (res, req) => {
        res.onAborted(() => console.log('aborted response'));
        try {
          if (!(await route.permission(req))) return res.writeStatus('403 Forbidden').end();

          // IMPORTANT: req cannot be used after await https://github.com/uNetworking/uWebSockets.js/discussions/328#discussioncomment-173449
          // It's available within the handler but any data needed (parameters, query, body) must be gathered before await!
          setCorsHeaders(res); // FIXME writeStatus() must be called before otherwise response with default status. Rethink where to set cors
          await route.handler(res, req);
        } catch (e) {
          // TODO ensure res.end() || res.close() can never be called multiple times, as that will crash the server
          res.writeStatus('500 Internal Server Error').end();
          console.error(e);
        }
      });
    });

    // // TODO remove or disable for PROD builds- This is to be used during development only.
    this.app.get('/*', (res, req) => {
      try {
        let requestPath = req.getUrl();
        if (requestPath == '/') requestPath = '/index.html';
        const filePath = path.join(__dirname, 'public', requestPath);
        if (!filePath.startsWith(path.resolve(__dirname, 'public'))) res.writeStatus('403 permission_denied').end();
        if (!fs.existsSync(filePath)) return res.writeStatus('404 Not Found').end();
        const content = fs.readFileSync(filePath).toString();
        const mimeType = lookup(filePath);
        res.writeHeader('Content-Type', mimeType || 'text/plain').writeStatus('200 OK').end(content);
      } catch (e) {
        res.writeStatus('500 Internal Server Error').end();
      }
    });
  }

  start(): Promise<QuackamoleServer> {
    return new Promise(res => this.app.listen(this.port, (listenSocket: unknown) => {
      console.log(`QuackamoleServer started on ${this.sslEnabled ? 'https' : 'http'}://localhost:${this.port}, listenSocket:`, listenSocket);
      this.listenSocket = listenSocket;
      setInterval(() => {
        const heapUsed = (process.memoryUsage().heapUsed / 1024 / 1024).toFixed(2);
        const heapTotal = (process.memoryUsage().heapTotal / 1024 / 1024).toFixed(2);
        const rss = (process.memoryUsage().rss / 1024 / 1024).toFixed(2);
        console.log(`Heap: ${heapUsed}/${heapTotal} MB (RSS: ${rss} MB)`);
      }, 50000);
      res(this);
    }));
  }

  stop(): QuackamoleServer {
    if (this.listenSocket) {
      us_listen_socket_close(this.listenSocket);
      console.log(`Quackamole Server stopped on ${this.sslEnabled ? 'https' : 'http'}://localhost:${this.port}, listenSocket:`, this.listenSocket);
      this.listenSocket = null;
    }
    return this;
  }

  private openSocketHandler(ws: WebSocket): void {
    ws.id = randomUUID();
    ws.roomIds = [];
    console.log('socket opened', ws.id);
  }

  private closeSocketHandler(ws: WebSocket): void {
    console.log('closing socket', ws.id);
    SocketService.instance.sockets.delete(ws.id);
    RoomService.instance.leave(ws.id, ws.roomIds);
    for (const roomId of ws.roomIds) {
      const topic = `rooms/${roomId}`;
      console.log('close socket broadcast leave room', topic, ws.id, roomId);

      publishJson<IRoomEventLeaveMessage>(this.app, topic, { type: 'room_event__user_left', roomId, timestamp: Date.now(), data: { user: ws.user } });
    }
  }

  private mainMessageHandler(ws: WebSocket, rawMessage: ArrayBuffer): void {
    const message: RequestMessage = this.parseSocketToServerMessage(ws, rawMessage);
    // TODO if there is an awaitId, send back a response to let client know the message was malformed
    if (!this.isSocketToServerMessage(message)) console.log('invalid message received', message, ws.id);
    console.log('websocket message received', message, ws.id);
    const actionHander = messageHandlers[message.type];
    if (actionHander) actionHander(ws, message);
    // TODO if there is an message.awaitId, send back a response to let client know it isn't a valid action
    else console.log('no message handler found');
  }

  private parseSocketToServerMessage(ws: WebSocket, rawMessage: ArrayBuffer): RequestMessage {
    const message: RequestMessage = JSON.parse(Buffer.from(rawMessage).toString());
    message.timestamp = Date.now();
    message.socketId = ws.id;
    return message;
  }

  private isSocketToServerMessage(message: unknown): message is RequestMessage {
    return typeof message === 'object' && message !== null && 'action' in message && 'data' in message;
  }
}
