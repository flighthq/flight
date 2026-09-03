import type { Entity } from './Entity';
import type { ResourceLoadReport } from './ResourceLoadReport';
import type { Signal } from './Signal';

export interface ResourceLoader extends Entity {
  onCancel: Signal<() => void>;
  onComplete: Signal<(reports: readonly ResourceLoadReport[]) => void>;
  onError: Signal<(error: unknown, key: string) => void>;
  onPause: Signal<() => void>;
  // The 0..1 weighted fraction — the same number `getResourceLoadProgress` returns, so the signal and
  // the accessor can never disagree. It used to emit (loaded, total) item counts while the accessor
  // returned the weighted fraction, so a weighted batch had two live answers to one question and the
  // caller's choice of API silently decided which. Item counts are still available, by name, from
  // `getResourceLoadCounts`.
  onProgress: Signal<(progress: number) => void>;
  onResume: Signal<() => void>;
}
