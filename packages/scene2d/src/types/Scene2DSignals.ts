import type { Signal } from '@flighthq/signals/contract';

import type { Scene2DEntity } from './Scene2DEntity.ts';
export interface Scene2DSignals extends Scene2DEntity {
  onFullscreenChanged: Signal<void>;
  onOrientationChanged: Signal<void>;
  onResize: Signal<void>;
}
