import type { CursorBackend } from './Cursor';
import type { FocusEventData } from './FocusEventData';
import type { InputSignals } from './InputSignals';
import type { InteractionSignals } from './InteractionSignals';
import type { KeyboardEventData } from './KeyboardEventData';
import type { Node, NodeAny, NodeTraits } from './Node';
import type { NodeInteractionState } from './NodeInteractionState';
import type { PointerEventData, PointerType } from './PointerEventData';
import type { SpatialIndex2D } from './Spatial';

export type InteractionSignalName = keyof InteractionSignals;
export type AnyInteractionSignalSlot = (value: PointerEventData | KeyboardEventData | FocusEventData) => void;
export type InteractionDispatchLayer<N extends NodeAny = Node<NodeTraits>> = (
  target: N,
  name: InteractionSignalName,
  data: Readonly<PointerEventData | KeyboardEventData | FocusEventData>,
) => boolean;

export interface InteractionDispatchLayerOptions {
  priority?: number;
}

export interface InteractionManager<N extends NodeAny = Node<NodeTraits>> {
  // Active cursor backend for this manager's canvas; `null` disables cursor resolution. Per-manager
  // (not a global) so each manager owns its own canvas's cursor zone. Rollover resolves the innermost
  // ancestor's `NodeInteractionState.cursor` and applies it here.
  cursorBackend: CursorBackend | null;
  // Last rollover target that drove this manager's cursor. Kept separately from per-pointer state
  // because one canvas has one cursor even when the manager tracks several pointer identities.
  cursorTarget: N | null;
  // Priority-descending dispatch middleware, allocated only when a consumer connects the first layer.
  dispatchLayers: Array<{ layer: InteractionDispatchLayer<N>; priority: number }> | null;
  // Inclusive maximum elapsed time, in input-timestamp units, between qualifying pointer clicks.
  doubleClickDelay: number;
  // Inclusive maximum distance, in dispatched pointer-coordinate units, between qualifying clicks.
  doubleClickDistance: number;
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
  spatialIndex: SpatialIndex2D | null;
  signalSubscriberCounts: Map<InteractionSignalName, number>;
  trackedSignalSlots: Map<N, Map<InteractionSignalName, Map<AnyInteractionSignalSlot, AnyInteractionSignalSlot>>>;
  trackedSubscribersOnly: boolean;
}

export interface InteractionManagerOptions {
  cursorBackend?: CursorBackend | null;
  doubleClickDelay?: number;
  doubleClickDistance?: number;
  enabled?: boolean;
  precise?: boolean;
  spatialIndex?: SpatialIndex2D | null;
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
  timeStamp?: number;
}

export interface InteractionPointerState<N extends NodeAny = Node<NodeTraits>> {
  lastClickTarget: N | null;
  lastClickTime: number;
  lastPointerClickButton: number;
  lastPointerClickInteractionState: NodeInteractionState | null;
  lastPointerClickTarget: N | null;
  lastPointerClickTime: number;
  lastPointerClickX: number;
  lastPointerClickY: number;
  pointerDownTarget: N | null;
  pointerOverTarget: N | null;
}
