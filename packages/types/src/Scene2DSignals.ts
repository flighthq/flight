import type { Signal } from './Signal';

export interface Scene2DSignals {
  onFullscreenChanged: Signal<() => void>;
  onOrientationChanged: Signal<() => void>;
  onResize: Signal<() => void>;
}
