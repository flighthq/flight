import type { Signal } from '@flighthq/signals/contract';

import type { Entity } from './Entity.ts';

export interface Scene2DSignals extends Entity {
  onFullscreenChanged: Signal<void>;
  onOrientationChanged: Signal<void>;
  onResize: Signal<void>;
}
