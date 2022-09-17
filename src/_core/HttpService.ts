import * as uWS from 'uWebSockets.js';
import {IRoom, RoomId, RoomService} from '../services/RoomService';


export class HttpService {
  private app: uWS.TemplatedApp;
  private readonly instance: HttpService;

  constructor(app: uWS.TemplatedApp) {
    this.app = app;
    this.instance = this;
  }

  init(): void {
    this.app.get('/', async (response, req) => {
      response.writeStatus('200 OK').end('Api base route');
    });

    this.app.get('/socket', async (response, request) => {
      const rooms = RoomService.instance.getAllRooms(); // Note that it will return the room passwords as well but it does not matter atm.
      response.writeStatus('200 OK').end(JSON.stringify(rooms));
    });

    this.app.get('/rooms', async (response, request) => {
      const rooms = RoomService.instance.getAllRooms();
      response.writeStatus('200 OK').end(JSON.stringify(rooms));
    });

    this.app.post('/rooms', async (response, request) => {
      this.parseBody<Partial<IRoom>>(response, data => {
        const roomRef = RoomService.instance.createRoom(data);
        if (roomRef) {
          response.writeStatus('201 created').end(JSON.stringify(roomRef));
        } else {
          response.onAborted(() => console.error('something went wrong while creating the room'));
          response.writeStatus('400 Bad Request').close(); // res.close calls onAborted
        }

      }, () => console.log('failed to create room'));
    });

    this.app.get('/rooms/:id', async (response, request) => {
      const id: RoomId = request.getParameter(0);
      const roomRef: IRoom | undefined = RoomService.instance.getRoomById(id);
      if (roomRef) {
        response.writeStatus('200 OK').end(JSON.stringify(roomRef));
      } else {
        response.writeStatus('404 Not Found').end();
      }
    });

    this.app.patch('/rooms/:id', async (response, request) => {
      const id: string = request.getParameter(0);
      const roomRef = RoomService.instance.getRoomById(id);

      if (roomRef) {
        this.parseBody<Partial<IRoom>>(response, data => {
          RoomService.instance.updateRoom(id, data);
          response.writeStatus('200 OK').end(JSON.stringify(roomRef));
        }, () => console.log(`Update room "${id}" failed`));
      } else {
        response.writeStatus('404 Not Found').close(); // res.close calls onAborted
      }
    });
  }

  // https://github.com/uNetworking/uWebSockets.js/blob/master/examples/JsonPost.js
  // TODO make this Promise based
  parseBody<T>(res: uWS.HttpResponse, successCB: (body: T) => void, errorCB: () => void): void {
    let buffer: Buffer;
    res.onData((ab, isLast) => {
      const chunk: Buffer = Buffer.from(ab);
      if (isLast) {
        let json;
        try {
          json = JSON.parse((buffer ? Buffer.concat([buffer, chunk]) : chunk).toString());
        } catch (e) {
          res.writeStatus('400 Bad Request').close(); // res.close calls onAborted
          return;
        }
        successCB(json);
      } else {
        buffer = Buffer.concat(buffer ? [buffer, chunk] : [chunk]);
      }
    });
    res.onAborted(errorCB); // register error callback
  }
}


// router.get('/', (request, response) => {
//   response.send('Api base route');
// });
//
// router.post('/rooms', (request, response) => {
//   const {name, password, maxUsers} = request.body;
//
//   const roomData = {name, password, maxUsers};
//   const roomRef = roomManager.createRoom(roomData);
//
//   if (roomRef) {
//     const {password, ...otherRoomProperties} = roomRef;
//     response.status(201).json(otherRoomProperties);
//   } else {
//     response.sendStatus(400);
//   }
// });
//
// router.get('/rooms', (request, response) => {
//   // FIXME in the future differentiate between listed/unlisted rooms
//   const rooms = roomManager.getAllRooms(); // Note that it will return the room passwords as well but it does not matter atm.
//   response.status(200).json(rooms);
// });
//
// router.get('/rooms/:id', (request, response) => {
//   const room = roomManager.getRoomById(request.params.id);
//
//   if (room) {
//     response.status(200).json(room);
//   } else {
//     response.sendStatus(404);
//   }
// });
//
// router.patch('/rooms/:id', (request, response) => {
//   // FIXME only allow authorized people to change room data (for the beginning only people in the room, if there is a way to verify that)
//   const room = roomManager.getRoomById(request.params.id);
//
//   if (room) {
//     roomManager.updateRoom(room.id, request.body);
//     response.status(200).json(room);
//   } else {
//     response.sendStatus(404);
//   }
// });
//
// module.exports = router;
