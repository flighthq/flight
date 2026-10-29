import type { Entity } from './Entity.ts';
import type { FocusEventData } from './FocusEventData.ts';
import type { KeyboardEventData } from './KeyboardEventData.ts';
import type { PointerEventData } from './PointerEventData.ts';
import type { Signal } from './Signal.ts';

export interface InteractionSignals extends Entity {
  onClick: Signal<Readonly<PointerEventData>>;
  onContextMenu: Signal<Readonly<PointerEventData>>;
  onDoubleClick: Signal<Readonly<PointerEventData>>;
  onFocusIn: Signal<Readonly<FocusEventData>>;
  onFocusOut: Signal<Readonly<FocusEventData>>;
  onKeyDown: Signal<Readonly<KeyboardEventData>>;
  onKeyUp: Signal<Readonly<KeyboardEventData>>;
  onPointerCancel: Signal<Readonly<PointerEventData>>;
  onPointerDoubleClick: Signal<Readonly<PointerEventData>>;
  onPointerDown: Signal<Readonly<PointerEventData>>;
  onPointerMove: Signal<Readonly<PointerEventData>>;
  onPointerOut: Signal<Readonly<PointerEventData>>;
  onPointerOver: Signal<Readonly<PointerEventData>>;
  onPointerRollOut: Signal<Readonly<PointerEventData>>;
  onPointerRollOver: Signal<Readonly<PointerEventData>>;
  onPointerUp: Signal<Readonly<PointerEventData>>;
  onReleaseOutside: Signal<Readonly<PointerEventData>>;
  onWheel: Signal<Readonly<PointerEventData>>;
}
