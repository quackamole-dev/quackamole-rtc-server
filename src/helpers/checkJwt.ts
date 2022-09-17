// import * as jwt from 'jsonwebtoken';
// import config from '../config';
//
// export const isJWTValid = (token: string): boolean => {
//   let jwtPayload;
//   try {
//     jwtPayload = jwt.verify(token, config.JWT_SECRET);
//     console.log('jwt payload', jwtPayload);
//     return true;
//   } catch (error) {
//     return false;
//   }
//
//   // const { userId, username } = jwtPayload;
//   // const newToken = jwt.sign({ userId, username }, config.JWT_SECRET, {
//   //   expiresIn: "6h"
//   // });
// };
