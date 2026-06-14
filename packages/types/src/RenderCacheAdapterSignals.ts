import type { Signal } from './Signal';

export type RenderCacheAdapterSignals = {
  onPrepare: Signal<() => void>;
};
