import {HttpRequest} from 'uWebSockets.js';

const isAdmin = async (req: HttpRequest): Promise<boolean> => {
  // TODO either implement a role based system or simple boolean flag on User entity
  return true;
};

export default isAdmin;
