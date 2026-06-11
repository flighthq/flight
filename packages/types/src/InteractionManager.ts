import type { InputSignals } from './InputSignals';
import type { InteractionSignals } from './InteractionSignals';
import type { KeyboardData } from './KeyboardData';
import type { PointerData, PointerType } from './PointerData';
import type { SceneNode } from './SceneNode';

export type InteractionSignalName = keyof InteractionSignals;
export type AnyInteractionSignalSlot = (value: PointerData | KeyboardData) => void;

export interface InteractionManager<SceneKind extends symbol = symbol, Traits extends object = object> {
  doubleClickDelay: number;
  enabled: boolean;
  pointerCaptures: Map<number, SceneNode<SceneKind, Traits>>;
  pointerStates: Map<number, InteractionPointerState<SceneKind, Traits>>;
  root: SceneNode<SceneKind, Traits>;
  signalSubscriberCounts: Map<InteractionSignalName, number>;
  trackedSignalSlots: Map<
    SceneNode<SceneKind, Traits>,
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

export interface InteractionPointerState<SceneKind extends symbol = symbol, Traits extends object = object> {
  lastClickTarget: SceneNode<SceneKind, Traits> | null;
  lastClickTime: number;
  pointerDownTarget: SceneNode<SceneKind, Traits> | null;
  pointerOverTarget: SceneNode<SceneKind, Traits> | null;
}
