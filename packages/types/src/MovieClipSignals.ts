import type { Signal } from './Signal';

export interface MovieClipSignals {
  onEnterFrame: Signal<() => void>;
  onExitFrame: Signal<() => void>;
  onFrameConstructed: Signal<() => void>;
}
