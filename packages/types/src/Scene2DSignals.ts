import type { Entity } from './Entity';
import type { Signal } from './Signal';

export interface Scene2DSignals extends Entity {
  onFullscreenChanged: Signal<() => void>;
  onOrientationChanged: Signal<() => void>;
  onResize: Signal<() => void>;
}
