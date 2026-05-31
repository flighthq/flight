import type { Signal } from './Signal';

export interface StageSignals {
  onFullscreenChanged: Signal<() => void>;
  onOrientationChanged: Signal<() => void>;
  onResize: Signal<() => void>;
}
