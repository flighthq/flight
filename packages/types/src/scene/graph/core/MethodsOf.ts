export type MethodsOf<T> = {
  [K in keyof T as T[K] extends (...args: any) => any ? K : never]: T[K]; // eslint-disable-line
};
