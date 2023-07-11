import {HttpRequest} from 'uWebSockets.js';
// import {isJWTValid} from '../helpers/checkJwt';

// eslint-disable-next-line @typescript-eslint/no-unused-vars
const isAuthenticated = async (req: HttpRequest): Promise<boolean> => {
  // const token = req.getHeader('token');
  // console.log('-----------token header', token);
  // return isJWTValid(token);
  // TODO implement some kind of token validation and loginWithCustomId/anonymousLogin pattern
  //  E.g https://github.com/uNetworking/uWebSockets.js/discussions/112#discussioncomment-177626
  return true;
};

export default isAuthenticated;
