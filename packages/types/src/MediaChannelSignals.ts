import type { Signal } from './Signal';
export type MediaReadyState = 'buffering' | 'error' | 'idle' | 'ready';
export interface MediaChannelSignals {
  onBuffering: Signal<() => void>;
  onError: Signal<(error: string) => void>;
  onReady: Signal<() => void>;
  onSeeked: Signal<() => void>;
}
