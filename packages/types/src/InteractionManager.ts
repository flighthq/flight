import type { CursorBackend } from './Cursor';
import type { InputSignals } from './InputSignals';
import type { InteractionSignals } from './InteractionSignals';
import type { KeyboardEventData } from './KeyboardEventData';
import type { Node, NodeAny, NodeTraits } from './Node';
import type { PointerEventData, PointerType } from './PointerEventData';
import type { SpatialIndex } from './Spatial';

export type InteractionSignalName = keyof InteractionSignals;
export type AnyInteractionSignalSlot = (value: PointerEventData | KeyboardEventData) => void;

export interface InteractionManager<N extends NodeAny = Node<NodeTraits>> {
  // Active cursor backend for this manager's canvas; `null` disables cursor resolution. Per-manager
  // (not a global) so each manager owns its own canvas's cursor zone. Rollover resolves the innermost
  // ancestor's `NodeInteractionState.cursor` and applies it here.
  cursorBackend: CursorBackend | null;
  doubleClickDelay: number;
  enabled: boolean;
  pointerCaptures: Map<number, N>;
  pointerStates: Map<number, InteractionPointerState<N>>;
  // When true, pointer dispatch resolves targets with the precise (exact geometry) hit walk instead of
  // the coarse bbox walk — so a listener fires only on a real hit. `false` (default) uses coarse.
  precise: boolean;
  root: N;
  // Opt-in broadphase. When set, pointer picking queries this index (populated by
  // `refreshInteractionSpatialIndex`) instead of walking the whole tree — the 240 Hz acceleration for
  // large scenes. `null` (default) uses the linear tree walk.
  spatialIndex: SpatialIndex | null;
  signalSubscriberCounts: Map<InteractionSignalName, number>;
  trackedSignalSlots: Map<N, Map<InteractionSignalName, Map<AnyInteractionSignalSlot, AnyInteractionSignalSlot>>>;
  trackedSubscribersOnly: boolean;
}

export interface InteractionManagerOptions {
  cursorBackend?: CursorBackend | null;
  enabled?: boolean;
  precise?: boolean;
  spatialIndex?: SpatialIndex | null;
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
