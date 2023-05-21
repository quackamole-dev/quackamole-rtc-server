import {HttpResponse} from 'uWebSockets.js';

export const parseBodyString = (res: HttpResponse): Promise<string> => new Promise((resolve, reject) => {
  let buffer: Buffer;
  res.onData((ab, isLast) => {
    const chunk = Buffer.from(ab);
    if (isLast) {
      resolve((buffer ? Buffer.concat([buffer, chunk]) : chunk).toString());
    } else {
      const concatValue = buffer ? [buffer, chunk] : [chunk];
      buffer = Buffer.concat(concatValue);
    }
  });
  res.onAborted(() => reject(null));
});

export const parseBodyObj = async <T>(res: HttpResponse): Promise<T> => {
  try {
    const raw = await parseBodyString(res);
    return (raw === '' ? {} : JSON.parse(raw)) as T;
  } catch (e) {
    return {} as T;
  }
};
