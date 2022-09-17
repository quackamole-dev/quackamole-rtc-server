import * as RoomController from '../controllers/RoomController';
import isAuthenticated from '../permissions/isAuthenticated';
import {IRoute} from './index';
import isAdmin from "../permissions/isAdmin";

export const BaseRoomRoute = '/rooms';

export const RoomRoutes: IRoute[] = [
  {
    method: 'post',
    route: `${BaseRoomRoute}`,
    handler: RoomController.create,
    permission: isAuthenticated,
  },
  {
    method: 'get',
    route: `${BaseRoomRoute}`,
    handler: RoomController.list,
    permission: isAdmin, // TODO
  },
  {
    method: 'get',
    route: `${BaseRoomRoute}/:id`,
    handler: RoomController.retrieve,
    permission: isAdmin, // TODO
  },
];
