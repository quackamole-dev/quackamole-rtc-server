import { IMessageRelayDeliveryMessage, RequestMessage } from 'quackamole-shared-types';
import { USocket } from '../QuackamoleServer';
import { SocketService } from '../services/SocketService';
import { MessageHandler } from '.';

export const handleMessageRelay: MessageHandler = (ws: USocket, message: RequestMessage): void => {
  if (message.type !== 'request__message_relay') throw new Error(`wrong action ${message.type} for handler handleRoomBroadcast`);
  if (!message.body.receiverIds?.length) return; // FIXME this should return a bad request message
  const topic = `rooms/${message.body.roomId}`;
  if (!ws.getTopics().some(t => t === topic)) return;
  const receiverSockets: USocket[] = [];

  const wsUserData = ws.getUserData();
  for (const receiverId of message.body.receiverIds) {
    if (receiverId === wsUserData.id) continue; // no point in sending message to yourself
    const receiverSocket = SocketService.instance.sockets.get(receiverId);
    if (!receiverSocket) continue;
    if (!receiverSocket.getTopics().some(t => t === topic)) continue;
    receiverSockets.push(receiverSocket);
  }

  if (receiverSockets.length !== message.body.receiverIds.length) return; // TODO return error message
  const deliveryMessage: IMessageRelayDeliveryMessage = { type: 'message_relay_delivery', senderId: wsUserData.id, relayData: message.body.relayData, awaitId: '', roomId: message.body.roomId };
  const stringifiedMessage = JSON.stringify(deliveryMessage);
  receiverSockets.forEach(s => s.send(stringifiedMessage));
};
