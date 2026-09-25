import type { Entity } from './Entity.ts';
import type { Signal } from './Signal.ts';

export interface QuadBatchSignals extends Entity {
  onCleared: Signal<() => void>;
  onInstanceAppended: Signal<(index: number) => void>;
  onInstanceRemoved: Signal<(index: number, swapSource: number) => void>;
}
