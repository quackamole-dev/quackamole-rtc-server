import fs from 'fs';
import path from 'path';
import {App, SSLApp, TemplatedApp, us_listen_socket_close} from 'uWebSockets.js';
import Routes from '../routes';
import {RoomService} from '../services/RoomService';
import {SocketService} from './SocketService';
import {setCorsHeaders} from '../helpers/setCorsHeaders';


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
    this.app = this.sslEnabled ? SSLApp({cert_file_name: filepathCert, key_file_name: filepathKey}) : App();

    this.registerHttpRoutes();
    new RoomService();
    new SocketService(this.app);
  }

  private registerHttpRoutes() {

    // this.app.get('/*', (res, req) => {
    //   /* It does Http as well */
    //   res.writeStatus('200 OK').writeHeader('IsExample', 'Yes').end('Hello there!');
    // })

    Routes.forEach(route => {
      this.app[route.method](route.route, async (res, req) => {
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

    this.app.get('/', async res => { // TODO remove, this is temporary for experimenting
      try {
        const filepath = path.resolve(__dirname, `../../dummy-client/index.html`);
        let content = fs.readFileSync(filepath).toString();
        // if (this.sslEnabled) content = content.split(`http://localhost:`).join(`https://localhost:`);
        // if (this.port !== 12000) content = content.split(`:12000`).join(`:${this.port}`);
        res.writeHeader('Content-Type', 'text/html').writeStatus('200 OK').end(content);
      } catch (e) {
        res.writeStatus('404 Not Found').end();
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
}
