import type { InputSignals } from './InputSignals';
import type { InteractionSignals } from './InteractionSignals';
import type { KeyboardEventData } from './KeyboardEventData';
import type { Node, NodeAny, NodeTraits } from './Node';
import type { PointerEventData, PointerType } from './PointerEventData';

export type InteractionSignalName = keyof InteractionSignals;
export type AnyInteractionSignalSlot = (value: PointerEventData | KeyboardEventData) => void;

export interface InteractionManager<N extends NodeAny = Node<NodeTraits>> {
  doubleClickDelay: number;
  enabled: boolean;
  pointerCaptures: Map<number, N>;
  pointerStates: Map<number, InteractionPointerState<N>>;
  root: N;
  signalSubscriberCounts: Map<InteractionSignalName, number>;
  trackedSignalSlots: Map<N, Map<InteractionSignalName, Map<AnyInteractionSignalSlot, AnyInteractionSignalSlot>>>;
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

export interface InteractionPointerState<N extends NodeAny = Node<NodeTraits>> {
  lastClickTarget: N | null;
  lastClickTime: number;
  pointerDownTarget: N | null;
  pointerOverTarget: N | null;
}
