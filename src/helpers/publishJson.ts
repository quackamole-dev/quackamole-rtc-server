import { TemplatedApp, WebSocket } from 'uWebSockets.js';

export const publishJson = <T>(context: WebSocket | TemplatedApp, topic: string, message: T): void => {
  context.publish(topic, JSON.stringify(message));
};
