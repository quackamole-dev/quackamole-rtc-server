import {HttpResponse} from 'uWebSockets.js';

// FIXME when used before writeStatus(), status code is ignored
export const setCorsHeaders = (res: HttpResponse) => {
  res.writeHeader('Access-Control-Allow-Origin', '*');
  res.writeHeader('Access-Control-Allow-Headers', 'Origin, Content-Type, Accept');
  res.writeHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS, PUT, PATCH, DELETE');
  // res.writeHeader('Access-Control-Max-Age', '3600');
};
