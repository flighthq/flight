export interface ResourceLoadHandle<T> {
  key: string;
  promise: Promise<T>;
}
