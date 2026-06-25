export interface ResourceLoadItem<T> {
  bytesHint?: number;
  group?: string;
  key?: string;
  load: (signal: AbortSignal) => Promise<T>;
  onBytesProgress?: (loaded: number, total: number) => void;
  priority?: number;
  retries?: number;
  timeoutMs?: number;
  weight?: number;
}
