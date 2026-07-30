import type { ResourceLoadBytesReporter } from './ResourceLoadBytesReporter';

export interface ResourceLoadItem<T> {
  bytesHint?: number;
  group?: string;
  key?: string;
  // Performs the load. `signal` aborts it; `reportBytes` is how it reports its own transfer progress,
  // and a factory with nothing to report simply declares one parameter and ignores it.
  load: (signal: AbortSignal, reportBytes: ResourceLoadBytesReporter) => Promise<T>;
  // Called with each figure the factory reports through `reportBytes`. `total` falls back to
  // `bytesHint` when the factory reports only how much has arrived.
  onBytesProgress?: (loaded: number, total: number) => void;
  priority?: number;
  retries?: number;
  timeoutMs?: number;
  weight?: number;
}
