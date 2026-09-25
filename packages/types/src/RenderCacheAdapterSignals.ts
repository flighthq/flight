import type { Signal } from './Signal.ts';

export type RenderCacheAdapterSignals = {
  onPrepare: Signal<() => void>;
};
