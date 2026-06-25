import type { Signal } from './Signal';

export interface SpriteSignals {
  onFrameChanged: Signal<(id: number) => void>;
}
