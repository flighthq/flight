import type { Entity } from './Entity';
import type { Signal } from './Signal';

export interface QuadBatchSignals extends Entity {
  onCleared: Signal<() => void>;
  onInstanceAppended: Signal<(index: number) => void>;
  onInstanceRemoved: Signal<(index: number, swapSource: number) => void>;
}
