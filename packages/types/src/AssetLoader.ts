import type { Signal } from './Signal';

export interface AssetLoader {
  onComplete: Signal<() => void>;
  onError: Signal<(error: unknown) => void>;
  onProgress: Signal<(loaded: number, total: number) => void>;
}
