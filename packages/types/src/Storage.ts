// Key/value persistence seam. Free functions in @flighthq/storage delegate to the active
// StorageBackend (web localStorage default or a native host's). Storage is a synchronous capability —
// localStorage is sync — so these return values directly rather than Promises. Writes resolve to false
// when the host denies or lacks access (private mode, quota) rather than throwing; reads return null.
export interface StorageBackend {
  getItem(key: string): string | null;
  setItem(key: string, value: string): boolean;
  removeItem(key: string): boolean;
  clear(): boolean;
  keys(): string[];
}
