import type { KeyboardEventData } from './KeyboardEventData';
import type { PointerEventData } from './PointerEventData';
import type { Signal } from './Signal';

export interface InteractionSignals {
  onClick: Signal<(data: Readonly<PointerEventData>) => void>;
  onContextMenu: Signal<(data: Readonly<PointerEventData>) => void>;
  onDoubleClick: Signal<(data: Readonly<PointerEventData>) => void>;
  onKeyDown: Signal<(data: Readonly<KeyboardEventData>) => void>;
  onKeyUp: Signal<(data: Readonly<KeyboardEventData>) => void>;
  onPointerCancel: Signal<(data: Readonly<PointerEventData>) => void>;
  onPointerDown: Signal<(data: Readonly<PointerEventData>) => void>;
  onPointerMove: Signal<(data: Readonly<PointerEventData>) => void>;
  onPointerOut: Signal<(data: Readonly<PointerEventData>) => void>;
  onPointerOver: Signal<(data: Readonly<PointerEventData>) => void>;
  onPointerRollOut: Signal<(data: Readonly<PointerEventData>) => void>;
  onPointerRollOver: Signal<(data: Readonly<PointerEventData>) => void>;
  onPointerUp: Signal<(data: Readonly<PointerEventData>) => void>;
  onReleaseOutside: Signal<(data: Readonly<PointerEventData>) => void>;
  onWheel: Signal<(data: Readonly<PointerEventData>) => void>;
}
