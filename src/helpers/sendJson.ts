import { USocket } from '../QuackamoleServer';

export const sendJson = <T>(ws: USocket, message: T): void => {
  ws.send(JSON.stringify(message));
};
