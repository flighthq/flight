import type { ResourceLoadReport } from './ResourceLoadReport';
import type { Signal } from './Signal';

export interface ResourceLoader {
  onCancel: Signal<() => void>;
  onComplete: Signal<(reports: readonly ResourceLoadReport[]) => void>;
  onError: Signal<(error: unknown, key: string) => void>;
  onPause: Signal<() => void>;
  onProgress: Signal<(loaded: number, total: number) => void>;
  onResume: Signal<() => void>;
}
