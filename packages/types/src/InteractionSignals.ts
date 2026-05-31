import type { KeyboardData } from './KeyboardData';
import type { PointerData } from './PointerData';
import type { Signal } from './Signal';

export interface InteractionSignals {
  onClick: Signal<(data: Readonly<PointerData>) => void>;
  onContextMenu: Signal<(data: Readonly<PointerData>) => void>;
  onDoubleClick: Signal<(data: Readonly<PointerData>) => void>;
  onKeyDown: Signal<(data: Readonly<KeyboardData>) => void>;
  onKeyUp: Signal<(data: Readonly<KeyboardData>) => void>;
  onPointerCancel: Signal<(data: Readonly<PointerData>) => void>;
  onPointerDown: Signal<(data: Readonly<PointerData>) => void>;
  onPointerMove: Signal<(data: Readonly<PointerData>) => void>;
  onPointerOut: Signal<(data: Readonly<PointerData>) => void>;
  onPointerOver: Signal<(data: Readonly<PointerData>) => void>;
  onPointerRollOut: Signal<(data: Readonly<PointerData>) => void>;
  onPointerRollOver: Signal<(data: Readonly<PointerData>) => void>;
  onPointerUp: Signal<(data: Readonly<PointerData>) => void>;
  onReleaseOutside: Signal<(data: Readonly<PointerData>) => void>;
  onWheel: Signal<(data: Readonly<PointerData>) => void>;
}
