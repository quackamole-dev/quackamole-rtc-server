import {HttpRequest, HttpResponse} from 'uWebSockets.js';
import {RoomRoutes} from './RoomRoutes';
import { PluginRoutes } from './PluginRoutes';

export type HttpHandler = (res: HttpResponse, req: HttpRequest) => Promise<HttpResponse>;

export interface IRoute {
  method: 'get' | 'post' | 'options' | 'del' | 'patch' | 'put';
  route: string,
  handler: HttpHandler,
  // Intended for fundamental permission checks: isAdmin, isAuthenticated, hasRoleXYZ etc
  // Checking whether UserA is allowed to update some object belonging to UserB is out of scope and needs to be verified in the handler fn
  // In the future it might make sense to add standardized checks for retrieve/update/delete by id requests:
  // - isOwner: verify whether requesting user owns the resource they are trying to update
  // - isWhitelisted: verify whether requesting user was whitelisted by owning user to change the resource
  //   (maybe to specific at the "framework" level. TBD)
  permission: (req: HttpRequest) => Promise<boolean>,
  // serializer: typeof BaseSerializer,
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export const placeholderHandler = async (res: HttpResponse, req: HttpRequest): Promise<HttpResponse> => {
  throw Error('handler not implemented');
};

const Routes = [
  ...RoomRoutes,
  ...PluginRoutes
];

export default Routes;
