import type { Entity } from './Entity.ts';
import type { Signal } from './Signal.ts';

export interface Scene2DSignals extends Entity {
  onFullscreenChanged: Signal<() => void>;
  onOrientationChanged: Signal<() => void>;
  onResize: Signal<() => void>;
}
