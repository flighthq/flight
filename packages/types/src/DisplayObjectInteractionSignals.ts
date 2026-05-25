import type { PointerData } from './PointerData';
import type { Signal } from './Signal';

export interface DisplayObjectInteractionSignals {
  onPointerDown: Signal<(data: Readonly<PointerData>) => void>;
}
