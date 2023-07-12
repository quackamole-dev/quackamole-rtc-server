
import * as PluginController from '../controllers/PluginController';
import {isAuthenticated} from '../permissions/isAuthenticated';
import { IRoute } from './index';

export const BasePluginRoute = '/plugins';

export const PluginRoutes: IRoute[] = [
  {
    method: 'get',
    route: `${BasePluginRoute}`,
    handler: PluginController.list,
    permission: isAuthenticated,
  },
];
