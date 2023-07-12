import { TemplatedApp } from 'uWebSockets.js';
import { USocket } from '../QuackamoleServer';

export const publishJson = <T>(context: USocket | TemplatedApp, topic: string, message: T): void => {
  context.publish(topic, JSON.stringify(message));
};
