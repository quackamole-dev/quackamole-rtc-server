export class QuackamoleError<T extends string | undefined> extends Error {
  name = 'QuackamoleError';
  code: number;

  constructor(message: T, code: number) {
    super(message);
    this.code = code;
  }
}
