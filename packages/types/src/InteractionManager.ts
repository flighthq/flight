import type { InputSignals } from './InputSignals';
import type { InteractionSignals } from './InteractionSignals';
import type { KeyboardData } from './KeyboardData';
import type { Node } from './Node';
import type { PointerData, PointerType } from './PointerData';

export type InteractionSignalName = keyof InteractionSignals;
export type AnyInteractionSignalSlot = (value: PointerData | KeyboardData) => void;

export interface InteractionManager<Kind extends symbol = symbol, Traits extends object = object> {
  doubleClickDelay: number;
  enabled: boolean;
  pointerCaptures: Map<number, Node<Kind, Traits>>;
  pointerStates: Map<number, InteractionPointerState<Kind, Traits>>;
  root: Node<Kind, Traits>;
  signalSubscriberCounts: Map<InteractionSignalName, number>;
  trackedSignalSlots: Map<
    Node<Kind, Traits>,
    Map<InteractionSignalName, Map<AnyInteractionSignalSlot, AnyInteractionSignalSlot>>
  >;
  trackedSubscribersOnly: boolean;
}

export interface InteractionManagerOptions {
  enabled?: boolean;
  trackedSubscribersOnly?: boolean;
}

export type InteractionInputSource = Pick<
  InputSignals,
  'onKeyDown' | 'onKeyUp' | 'onPointerCancel' | 'onPointerDown' | 'onPointerMove' | 'onPointerUp' | 'onWheel'
>;

export interface InteractionPointerOptions {
  altKey?: boolean;
  buttons?: number;
  ctrlKey?: boolean;
  metaKey?: boolean;
  pointerId?: number;
  pointerType?: PointerType;
  shiftKey?: boolean;
}

export interface InteractionPointerState<Kind extends symbol = symbol, Traits extends object = object> {
  lastClickTarget: Node<Kind, Traits> | null;
  lastClickTime: number;
  pointerDownTarget: Node<Kind, Traits> | null;
  pointerOverTarget: Node<Kind, Traits> | null;
}
