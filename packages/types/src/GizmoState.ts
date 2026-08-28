import type { Camera2D } from './Camera2D';
import type { Entity } from './Entity';
import type { HierarchyNodeAny } from './HierarchyNode';
import type { Rectangle } from './Rectangle';
import type { Scene2D } from './Scene2D';
import type { SelectionState } from './SelectionState';
import type { Signal } from './Signal';
import type { Vector2Like } from './Vector2';

declare const GizmoStateNodeTypeKey: unique symbol;

export type GizmoHandleKind =
  | 'rotate'
  | 'scale-x'
  | 'scale-xy'
  | 'scale-y'
  | 'translate-x'
  | 'translate-xy'
  | 'translate-y';

export type GizmoMode = 'none' | GizmoTransformMode;

export type GizmoPivot = 'center' | 'custom' | 'origin';

export type GizmoSpace = 'local' | 'world';

export type GizmoTransformMode = 'rotate' | 'scale' | 'translate';

/**
 * Projects the graph features needed by the 2D gizmo without narrowing selection identity to a
 * concrete graph family. Bounds and origins are world-space; rotation is authoring-layer degrees.
 */
export interface GizmoNode2DFeatures<NodeType extends HierarchyNodeAny = HierarchyNodeAny> {
  getWorldBoundsRectangle: (out: Rectangle, node: Readonly<NodeType>) => boolean;
  getWorldOrigin: (out: Vector2Like, node: Readonly<NodeType>) => void;
  getWorldRotation: (node: Readonly<NodeType>) => number;
}

export interface GizmoCreateOptions<NodeType extends HierarchyNodeAny = HierarchyNodeAny> {
  camera: Readonly<Camera2D>;
  features: Readonly<GizmoNode2DFeatures<NodeType>>;
  overlayScene: Scene2D;
  selection: SelectionState<NodeType>;
}

export interface GizmoSignals {
  /** Rotation deltas are always authoring-layer degrees, including snapped values. */
  onRotate: Signal<(degrees: number) => void>;
  onScale: Signal<(scaleX: number, scaleY: number) => void>;
  /** Brackets exactly one transform command; operation details arrive on the delta signals. */
  onTransformBegin: Signal<() => void>;
  onTransformEnd: Signal<() => void>;
  onTranslate: Signal<(deltaX: number, deltaY: number) => void>;
}

/**
 * Opaque gizmo controller state. Use the gizmo setters to configure it and call `updateGizmo`
 * once per frame while selection or camera data moves.
 */
export interface GizmoState<NodeType extends HierarchyNodeAny = HierarchyNodeAny> extends Entity {
  readonly [GizmoStateNodeTypeKey]?: NodeType;
}
