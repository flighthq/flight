import type { Signal } from './Signal';

export interface QuadBatchSignals {
  onCleared: Signal<() => void>;
  onInstanceAppended: Signal<(index: number) => void>;
  onInstanceRemoved: Signal<(index: number, swapSource: number) => void>;
}
