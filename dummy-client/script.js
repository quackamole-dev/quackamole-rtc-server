let id = null;
let socket = null;

const awaitedPromises = {};

function openSocket() {
  if (id) return console.log('socket already open', id);
  const isHttps = document.querySelector('#is-https').checked;
  socket = new WebSocket(`${isHttps ? 'wss' : 'ws'}://localhost:12000/ws`);
  socket.onopen = () => console.log('socket now open');
  socket.onmessage = async evt => {
    const data = JSON.parse(evt.data);

    if (data.awaitId) {
      // all messages with an awaitId are handled wherever they are awaited. Here we just resolve the promise
      const {resolve, reject} = awaitedPromises[data.awaitId];
      data.error ? reject(data.error) : resolve(data);
    } else if (data.topic === 'personal') {
      if (data.type === "init") id = data.id;
      console.log('personal message', data);
    } else if (data.topic.includes('rooms/')) {
      switch (data.type) {
        case 'relay':
          console.log('relay message', data);
          break;
        case 'broadcast':
          console.log('broadcast message', data);
          break;
        case 'join_room':
          console.log('joined room', data);
          break;
        case 'leave_room':
          console.log('left room', data);
          break;
        case 'rtc_offer':
          sendData([data.senderId], {type: 'rtc_answer', sdp: 'answer'}, data.roomId);
          console.log('rtc_offer message', data);
          break;
        case 'rtc_answer':
          console.log('rtc_answer message', data);
          break;
        case 'rtc_ice_candidate':
          console.log('rtc_ice_candidate message', data);
          break;
        default:
          console.log('unknown rtc message', data);
      }
    } else {
      console.log('unknown message', data);
    }
  };
}

// TODO allow awaiting until all recipients acknowledged to have received the payload with an optional flag
function sendData(receiverIdsRaw, data, roomId) {
  if (socket) {
    const receiverIds = receiverIdsRaw ? receiverIdsRaw.split(',') : null;

    if (receiverIds) {
      console.log(`Relaying the following data: ${data} to receiverIds ${receiverIds}`);
      socket.send(JSON.stringify({data, receiverIds, roomId, action: 'relay'}))
    } else {
      console.log(`Broadcasting the following data: ${data} to roomIds ${[roomId]}`);
      socket.send(JSON.stringify({data, roomIds: [roomId], action: 'broadcast'}));
    }
  }
}

async function joinRoom(roomId) {
  if (socket) {
    console.log(`Trying to join roomId ${roomId}`);
    const [message, promise] = createJoinRoomMessage(roomId);
    socket.send(JSON.stringify(message));
    try {
      const res = await promise;
      console.log('joinRoom response', res);
    } catch (err) {
      console.log('joinRoom error', err);
    }
  }
}

async function createRoom() {
  const isHttps = document.querySelector('#is-https').checked;
  try {

  const res = await fetch(`${isHttps ? 'https' : 'http'}://localhost:12000/rooms`, {
    method: 'POST', body: {}
  });

  const roomData = res.json();
  console.log('created room', roomData);
  } catch (err) {
    console.error('failed to create room', err);
  }
}

function createJoinRoomMessage(roomId) {
  const awaitId = crypto.randomUUID();
  awaitedPromises[awaitId] = {};

  const promise = new Promise((_resolve, _reject) => {
    awaitedPromises[awaitId].resolve = _resolve;
    awaitedPromises[awaitId].reject = _reject;
  });

  awaitedPromises[awaitId].promise = promise;

  return [{roomId, awaitId, action: 'join_room'}, promise];
}
