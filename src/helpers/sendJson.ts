import { WebSocket } from 'uWebSockets.js';

export const sendJson = <T>(ws: WebSocket, message: T): void => {
  ws.send(JSON.stringify(message));
};
