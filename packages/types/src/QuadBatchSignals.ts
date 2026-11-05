import type { Signal } from '@flighthq/signals/contract';

import type { Entity } from './Entity.ts';

export interface QuadBatchSignals extends Entity {
  onCleared: Signal<void>;
  onInstanceAppended: Signal<number>;
  onInstanceRemoved: Signal<readonly [index: number, swapSource: number]>;
}
