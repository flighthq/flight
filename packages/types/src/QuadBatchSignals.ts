import type { Entity } from './Entity.ts';
import type { Signal } from './Signal.ts';

export interface QuadBatchSignals extends Entity {
  onCleared: Signal<void>;
  onInstanceAppended: Signal<number>;
  onInstanceRemoved: Signal<readonly [index: number, swapSource: number]>;
}
