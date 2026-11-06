import type { Camera2D } from '@flighthq/camera/contract';
import type { EntityRaw, EntityRuntime, EntityRuntimeKey } from '@flighthq/entity/contract';
import type { Rectangle, Vector2Like } from '@flighthq/geometry/contract';
import type { NodeAny } from '@flighthq/node/contract';
import type { Scene2D } from '@flighthq/scene2d/contract';
import type { SelectionState } from '@flighthq/selection/contract';
import type { Signal } from '@flighthq/signals/contract';

declare const GizmoStateNodeTypeKey: unique symbol;

export type GizmoAlignment = 'bottom' | 'horizontal-center' | 'left' | 'right' | 'top' | 'vertical-center';

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

/** The closest vertical and horizontal smart guides for one moving bounds rectangle. */
export interface GizmoSmartGuideResult {
  deltaX: number;
  deltaY: number;
  guideX: number | null;
  guideY: number | null;
}

export type GizmoTransformMode = 'rotate' | 'scale' | 'translate';

/**
 * Projects the graph features needed by the 2D gizmo without narrowing selection identity to a
 * concrete graph family. Bounds and origins are world-space; rotation is authoring-layer degrees.
 */
export interface GizmoNode2DFeatures<NodeType extends NodeAny = NodeAny> {
  getWorldBoundsRectangle: (out: Rectangle, node: Readonly<NodeType>) => boolean;
  getWorldOrigin: (out: Vector2Like, node: Readonly<NodeType>) => void;
  getWorldRotation: (node: Readonly<NodeType>) => number;
}

export interface GizmoCreateOptions<NodeType extends NodeAny = NodeAny> {
  camera: Readonly<Camera2D>;
  features: Readonly<GizmoNode2DFeatures<NodeType>>;
  overlayScene: Scene2D;
  selection: SelectionState<NodeType>;
  viewportHeight: number;
  viewportWidth: number;
}

export interface GizmoSignals {
  /** Rotation deltas are always authoring-layer degrees, including snapped values. */
  onRotate: Signal<number>;
  onScale: Signal<readonly [scaleX: number, scaleY: number]>;
  /** Brackets exactly one transform command; operation details arrive on the delta signals. */
  onTransformBegin: Signal<void>;
  onTransformEnd: Signal<void>;
  onTranslate: Signal<readonly [deltaX: number, deltaY: number]>;
}

/**
 * Opaque gizmo controller state. Use the gizmo setters to configure it and call `updateGizmo`
 * once per frame while selection or camera data moves.
 */
export interface GizmoState<NodeType extends NodeAny = NodeAny> extends EntityRaw {
  [EntityRuntimeKey]: EntityRuntime | undefined;
  readonly [GizmoStateNodeTypeKey]?: NodeType;
}
