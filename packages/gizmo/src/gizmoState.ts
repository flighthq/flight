import { projectCamera2DPoint, unprojectCamera2DPoint } from '@flighthq/camera/contract';
import { createRectangle, createVector2 } from '@flighthq/geometry/contract';
import {
  enableInteractionSignals,
  setNodeCursor,
  setNodeHitArea,
  setNodeHitTestEnabled,
} from '@flighthq/interaction/contract';
import { DEG_TO_RAD, RAD_TO_DEG, roundTo } from '@flighthq/math/contract';
import {
  addNodeChild,
  getNodeParent,
  invalidateNodeAppearance,
  invalidateNodeLocalTransform,
  removeNodeChild,
} from '@flighthq/node/contract';
import { createDisplayObject } from '@flighthq/scene2d/contract';
import { getActiveNode, getSelectedNodes } from '@flighthq/selection/contract';
import {
  appendShapeBeginFill,
  appendShapeCircle,
  appendShapeEndFill,
  appendShapeLineStyle,
  appendShapeLineTo,
  appendShapeMoveTo,
  appendShapePolygon,
  appendShapeRectangle,
  clearShapeCommands,
  createShape,
} from '@flighthq/shape/contract';
import { connectSignal, createSignal, disconnectSignal, emitSignal } from '@flighthq/signals/contract';
import type {
  Camera2D,
  EntityRuntime,
  GizmoCreateOptions,
  GizmoHandleKind,
  GizmoMode,
  GizmoNode2DFeatures,
  GizmoPivot,
  GizmoSignals,
  GizmoSpace,
  GizmoState,
  GizmoTransformMode,
  HierarchyNodeAny,
  Node2D,
  PointerEventData,
  Rectangle,
  Scene2D,
  SelectionState,
  Shape,
  Vector2Like,
} from '@flighthq/types/contract';
import { EntityRuntimeKey } from '@flighthq/types/contract';

interface GizmoDrag {
  axisRotation: number;
  handle: GizmoHandleKind;
  mode: GizmoTransformMode;
  pivotWorldX: number;
  pivotWorldY: number;
  pivotScreenX: number;
  pivotScreenY: number;
  pointerId: number;
  screenRotation: number;
  startScreenX: number;
  startScreenY: number;
  startWorldX: number;
  startWorldY: number;
}

interface GizmoHandle {
  kind: GizmoHandleKind;
  node: Shape;
  placement: GizmoHandlePlacement;
}

type GizmoHandlePlacement =
  | 'rotate'
  | 'scale-east'
  | 'scale-north'
  | 'scale-northeast'
  | 'scale-northwest'
  | 'scale-south'
  | 'scale-southeast'
  | 'scale-southwest'
  | 'scale-west'
  | 'translate-x'
  | 'translate-xy'
  | 'translate-y';

interface GizmoRuntime<NodeType extends HierarchyNodeAny> extends EntityRuntime {
  bounds: Rectangle;
  camera: Readonly<Camera2D> | null;
  cleanups: Array<() => void>;
  customPivotX: number;
  customPivotY: number;
  disposed: boolean;
  drag: GizmoDrag | null;
  features: Readonly<GizmoNode2DFeatures<NodeType>> | null;
  handleRoot: Node2D;
  handles: GizmoHandle[];
  nodeBounds: Rectangle;
  outline: Shape;
  outlineColor: number;
  outlineEnabled: boolean;
  outlinePoints: number[];
  overlay: Scene2D | null;
  overlayRoot: Node2D;
  mode: GizmoMode;
  pivot: GizmoPivot;
  pivotScreen: Vector2Like;
  pivotWorld: Vector2Like;
  snapRotation: number;
  snapScale: number;
  snapTranslate: number;
  space: GizmoSpace;
  scratchPoint: Vector2Like;
  selection: SelectionState<NodeType> | null;
  signals: GizmoSignals;
}

export function createGizmoState<NodeType extends HierarchyNodeAny>(
  options: Readonly<GizmoCreateOptions<NodeType>>,
): GizmoState<NodeType> {
  const state = {
    [EntityRuntimeKey]: undefined,
  } as GizmoState<NodeType>;
  const overlayRoot = createDisplayObject({ name: 'GizmoRoot' });
  const outline = createShape({ name: 'GizmoSelectionOutline' });
  const handleRoot = createDisplayObject({ name: 'GizmoHandleRoot' });
  const runtime: GizmoRuntime<NodeType> = {
    binding: null,
    bounds: createRectangle(),
    camera: options.camera,
    cleanups: [],
    customPivotX: 0,
    customPivotY: 0,
    disposed: false,
    drag: null,
    features: options.features,
    handleRoot,
    handles: createGizmoHandles(handleRoot),
    mode: 'translate',
    nodeBounds: createRectangle(),
    outline,
    outlineColor: defaultOutlineColor,
    outlineEnabled: true,
    outlinePoints: new Array<number>(8).fill(Number.NaN),
    overlay: options.overlayScene,
    overlayRoot,
    pivot: 'center',
    pivotScreen: createVector2(),
    pivotWorld: createVector2(),
    snapRotation: 0,
    snapScale: 0,
    snapTranslate: 0,
    space: 'world',
    scratchPoint: createVector2(),
    selection: options.selection,
    signals: {
      onRotate: createSignal(),
      onScale: createSignal(),
      onTransformBegin: createSignal(),
      onTransformEnd: createSignal(),
      onTranslate: createSignal(),
    },
  };
  state[EntityRuntimeKey] = runtime;
  addNodeChild(overlayRoot, outline);
  addNodeChild(overlayRoot, handleRoot);
  addNodeChild(options.overlayScene.root, overlayRoot);
  connectGizmoHandles(runtime);
  updateGizmo(state);
  return state;
}

export function disposeGizmoState<NodeType extends HierarchyNodeAny>(state: GizmoState<NodeType>): void {
  const runtime = getGizmoRuntime(state);
  if (runtime.disposed) return;
  finishGizmoTransform(runtime);
  runtime.disposed = true;
  for (let i = runtime.cleanups.length - 1; i >= 0; i--) runtime.cleanups[i]();
  runtime.cleanups.length = 0;
  const parent = getNodeParent(runtime.overlayRoot);
  if (parent !== null) removeNodeChild(parent, runtime.overlayRoot);
  runtime.camera = null;
  runtime.features = null;
  runtime.overlay = null;
  runtime.selection = null;
}

export function getGizmoMode<NodeType extends HierarchyNodeAny>(state: Readonly<GizmoState<NodeType>>): GizmoMode {
  return getGizmoRuntime(state).mode;
}

export function getGizmoSignals<NodeType extends HierarchyNodeAny>(
  state: Readonly<GizmoState<NodeType>>,
): Readonly<GizmoSignals> {
  return getGizmoRuntime(state).signals;
}

export function getGizmoSpace<NodeType extends HierarchyNodeAny>(state: Readonly<GizmoState<NodeType>>): GizmoSpace {
  return getGizmoRuntime(state).space;
}

export function setGizmoCustomPivot<NodeType extends HierarchyNodeAny>(
  state: GizmoState<NodeType>,
  x: number,
  y: number,
): void {
  const runtime = getGizmoRuntime(state);
  runtime.customPivotX = x;
  runtime.customPivotY = y;
}

export function setGizmoMode<NodeType extends HierarchyNodeAny>(state: GizmoState<NodeType>, mode: GizmoMode): void {
  const runtime = getGizmoRuntime(state);
  if (runtime.mode === mode) return;
  finishGizmoTransform(runtime);
  runtime.mode = mode;
}

export function setGizmoPivot<NodeType extends HierarchyNodeAny>(state: GizmoState<NodeType>, pivot: GizmoPivot): void {
  getGizmoRuntime(state).pivot = pivot;
}

export function setGizmoSelectionOutlineColor<NodeType extends HierarchyNodeAny>(
  state: GizmoState<NodeType>,
  color: number,
): void {
  getGizmoRuntime(state).outlineColor = color >>> 0;
}

export function setGizmoSelectionOutlineEnabled<NodeType extends HierarchyNodeAny>(
  state: GizmoState<NodeType>,
  enabled: boolean,
): void {
  getGizmoRuntime(state).outlineEnabled = enabled;
}

export function setGizmoSnapRotation<NodeType extends HierarchyNodeAny>(
  state: GizmoState<NodeType>,
  degrees: number,
): void {
  getGizmoRuntime(state).snapRotation = normalizeGizmoSnap(degrees);
}

export function setGizmoSnapScale<NodeType extends HierarchyNodeAny>(state: GizmoState<NodeType>, step: number): void {
  getGizmoRuntime(state).snapScale = normalizeGizmoSnap(step);
}

export function setGizmoSnapTranslate<NodeType extends HierarchyNodeAny>(
  state: GizmoState<NodeType>,
  worldUnits: number,
): void {
  getGizmoRuntime(state).snapTranslate = normalizeGizmoSnap(worldUnits);
}

export function setGizmoSpace<NodeType extends HierarchyNodeAny>(state: GizmoState<NodeType>, space: GizmoSpace): void {
  getGizmoRuntime(state).space = space;
}

export function updateGizmo<NodeType extends HierarchyNodeAny>(state: GizmoState<NodeType>): void {
  const runtime = getGizmoRuntime(state);
  if (runtime.disposed) return;

  const selection = runtime.selection!;
  const selected = getSelectedNodes(selection);
  if (!computeGizmoBounds(runtime, selected)) {
    finishGizmoTransform(runtime);
    setGizmoNodeVisible(runtime.overlayRoot, false);
    return;
  }

  setGizmoNodeVisible(runtime.overlayRoot, true);
  resolveGizmoPivot(runtime);
  projectCamera2DPoint(runtime.camera!, runtime.pivotWorld.x, runtime.pivotWorld.y, runtime.pivotScreen);
  setGizmoNodeTransform(
    runtime.handleRoot,
    runtime.pivotScreen.x,
    runtime.pivotScreen.y,
    resolveGizmoScreenRotation(runtime),
  );
  setGizmoNodeVisible(runtime.handleRoot, runtime.mode !== 'none');
  updateGizmoHandleVisibility(runtime, runtime.mode);
  setGizmoNodeVisible(runtime.outline, runtime.outlineEnabled);
  updateGizmoOutline(runtime);
  updateGizmoHandleLayout(runtime);
}

function computeGizmoBounds<NodeType extends HierarchyNodeAny>(
  runtime: GizmoRuntime<NodeType>,
  selected: readonly NodeType[],
): boolean {
  const features = runtime.features!;
  let found = false;
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (let i = 0; i < selected.length; i++) {
    if (!features.getWorldBoundsRectangle(runtime.nodeBounds, selected[i])) continue;
    const bounds = runtime.nodeBounds;
    const x0 = Math.min(bounds.x, bounds.x + bounds.width);
    const y0 = Math.min(bounds.y, bounds.y + bounds.height);
    const x1 = Math.max(bounds.x, bounds.x + bounds.width);
    const y1 = Math.max(bounds.y, bounds.y + bounds.height);
    minX = Math.min(minX, x0);
    minY = Math.min(minY, y0);
    maxX = Math.max(maxX, x1);
    maxY = Math.max(maxY, y1);
    found = true;
  }
  if (!found) return false;
  runtime.bounds.x = minX;
  runtime.bounds.y = minY;
  runtime.bounds.width = maxX - minX;
  runtime.bounds.height = maxY - minY;
  return true;
}

function connectGizmoHandle<NodeType extends HierarchyNodeAny>(
  runtime: GizmoRuntime<NodeType>,
  handle: GizmoHandle,
): void {
  const signals = enableInteractionSignals(handle.node);
  const onPointerDown = (data: Readonly<PointerEventData>) => startGizmoTransform(runtime, handle.kind, data);
  const onPointerMove = (data: Readonly<PointerEventData>) => updateGizmoTransform(runtime, data);
  const onPointerEnd = (data: Readonly<PointerEventData>) => {
    if (runtime.drag?.pointerId === data.pointerId) finishGizmoTransform(runtime);
  };
  connectSignal(signals.onPointerDown, onPointerDown);
  connectSignal(signals.onPointerMove, onPointerMove);
  connectSignal(signals.onPointerUp, onPointerEnd);
  connectSignal(signals.onPointerCancel, onPointerEnd);
  connectSignal(signals.onReleaseOutside, onPointerEnd);
  runtime.cleanups.push(() => {
    disconnectSignal(signals.onPointerDown, onPointerDown);
    disconnectSignal(signals.onPointerMove, onPointerMove);
    disconnectSignal(signals.onPointerUp, onPointerEnd);
    disconnectSignal(signals.onPointerCancel, onPointerEnd);
    disconnectSignal(signals.onReleaseOutside, onPointerEnd);
  });
}

function connectGizmoHandles<NodeType extends HierarchyNodeAny>(runtime: GizmoRuntime<NodeType>): void {
  for (let i = 0; i < runtime.handles.length; i++) connectGizmoHandle(runtime, runtime.handles[i]);
}

function createGizmoHandle(kind: GizmoHandleKind, placement: GizmoHandlePlacement): GizmoHandle {
  const node = createShape({ name: `Gizmo${toGizmoHandleName(placement)}Handle` });
  setNodeHitTestEnabled(node, true);
  setNodeCursor(node, getGizmoHandleCursor(kind));
  drawGizmoHandle(node, kind);
  return { kind, node, placement };
}

function createGizmoHandles(handleRoot: Node2D): GizmoHandle[] {
  const handles = [
    createGizmoHandle('rotate', 'rotate'),
    createGizmoHandle('translate-x', 'translate-x'),
    createGizmoHandle('translate-y', 'translate-y'),
    createGizmoHandle('translate-xy', 'translate-xy'),
    createGizmoHandle('scale-x', 'scale-east'),
    createGizmoHandle('scale-x', 'scale-west'),
    createGizmoHandle('scale-y', 'scale-north'),
    createGizmoHandle('scale-y', 'scale-south'),
    createGizmoHandle('scale-xy', 'scale-northeast'),
    createGizmoHandle('scale-xy', 'scale-northwest'),
    createGizmoHandle('scale-xy', 'scale-southeast'),
    createGizmoHandle('scale-xy', 'scale-southwest'),
  ];
  for (let i = 0; i < handles.length; i++) addNodeChild(handleRoot, handles[i].node);
  return handles;
}

function drawGizmoAxis(shape: Shape, color: number, endX: number, endY: number): void {
  appendShapeLineStyle(shape, 2, color, 1, false, 'none');
  appendShapeMoveTo(
    shape,
    endX === 0 ? 0 : Math.sign(endX) * handleCenterSize,
    endY === 0 ? 0 : Math.sign(endY) * handleCenterSize,
  );
  appendShapeLineTo(shape, endX, endY);
}

function drawGizmoHandle(shape: Shape, kind: GizmoHandleKind): void {
  switch (kind) {
    case 'rotate':
      drawGizmoRotateHandle(shape, minimumRotateRadius);
      break;
    case 'translate-x':
      drawGizmoAxis(shape, xAxisColor, handleLength, 0);
      appendShapeBeginFill(shape, xAxisColor);
      appendShapePolygon(shape, [
        handleLength,
        0,
        handleLength - arrowSize,
        -arrowSize,
        handleLength - arrowSize,
        arrowSize,
      ]);
      appendShapeEndFill(shape);
      setNodeHitArea(
        shape,
        createRectangle(handleCenterSize, -hitThickness, handleLength - handleCenterSize, hitThickness * 2),
      );
      break;
    case 'translate-y':
      drawGizmoAxis(shape, yAxisColor, 0, -handleLength);
      appendShapeBeginFill(shape, yAxisColor);
      appendShapePolygon(shape, [
        0,
        -handleLength,
        -arrowSize,
        -handleLength + arrowSize,
        arrowSize,
        -handleLength + arrowSize,
      ]);
      appendShapeEndFill(shape);
      setNodeHitArea(
        shape,
        createRectangle(-hitThickness, -handleLength, hitThickness * 2, handleLength - handleCenterSize),
      );
      break;
    case 'translate-xy':
      appendShapeBeginFill(shape, centerColor, 0.9);
      appendShapeRectangle(shape, -handleCenterSize, -handleCenterSize, handleCenterSize * 2, handleCenterSize * 2);
      appendShapeEndFill(shape);
      setNodeHitArea(
        shape,
        createRectangle(-handleCenterSize, -handleCenterSize, handleCenterSize * 2, handleCenterSize * 2),
      );
      break;
    case 'scale-x':
      appendShapeBeginFill(shape, xAxisColor);
      appendShapeRectangle(shape, -scaleBoxSize / 2, -scaleBoxSize / 2, scaleBoxSize, scaleBoxSize);
      appendShapeEndFill(shape);
      setNodeHitArea(shape, createRectangle(-hitThickness, -hitThickness, hitThickness * 2, hitThickness * 2));
      break;
    case 'scale-y':
      appendShapeBeginFill(shape, yAxisColor);
      appendShapeRectangle(shape, -scaleBoxSize / 2, -scaleBoxSize / 2, scaleBoxSize, scaleBoxSize);
      appendShapeEndFill(shape);
      setNodeHitArea(shape, createRectangle(-hitThickness, -hitThickness, hitThickness * 2, hitThickness * 2));
      break;
    case 'scale-xy':
      appendShapeBeginFill(shape, centerColor, 0.9);
      appendShapeRectangle(shape, -scaleBoxSize / 2, -scaleBoxSize / 2, scaleBoxSize, scaleBoxSize);
      appendShapeEndFill(shape);
      setNodeHitArea(shape, createRectangle(-hitThickness, -hitThickness, hitThickness * 2, hitThickness * 2));
      break;
  }
}

function drawGizmoRotateHandle(shape: Shape, radius: number): void {
  clearShapeCommands(shape);
  appendShapeLineStyle(shape, 3, rotateColor, 1, false, 'none');
  appendShapeCircle(shape, 0, 0, radius);
  setNodeHitArea(shape, createRectangle(-radius - 6, -radius - 6, radius * 2 + 12, radius * 2 + 12));
}

function finishGizmoTransform<NodeType extends HierarchyNodeAny>(runtime: GizmoRuntime<NodeType>): void {
  if (runtime.drag === null) return;
  runtime.drag = null;
  emitSignal(runtime.signals.onTransformEnd);
}

function getGizmoHandleCursor(
  kind: GizmoHandleKind,
): 'move' | 'nesw-resize' | 'ns-resize' | 'nwse-resize' | 'ew-resize' {
  if (kind === 'translate-x') return 'ew-resize';
  if (kind === 'translate-y') return 'ns-resize';
  if (kind === 'scale-x') return 'ew-resize';
  if (kind === 'scale-y') return 'ns-resize';
  if (kind === 'scale-xy') return 'nwse-resize';
  if (kind === 'rotate') return 'nesw-resize';
  return 'move';
}

function getGizmoRuntime<NodeType extends HierarchyNodeAny>(
  state: Readonly<GizmoState<NodeType>>,
): GizmoRuntime<NodeType> {
  return state[EntityRuntimeKey] as GizmoRuntime<NodeType>;
}

function getGizmoTransformMode(kind: GizmoHandleKind): GizmoTransformMode {
  if (kind === 'rotate') return 'rotate';
  if (kind === 'scale-x' || kind === 'scale-y' || kind === 'scale-xy') return 'scale';
  return 'translate';
}

function normalizeDegrees(degrees: number): number {
  let value = degrees % 360;
  if (value > 180) value -= 360;
  else if (value < -180) value += 360;
  return value;
}

function normalizeGizmoSnap(value: number): number {
  return value > 0 && Number.isFinite(value) ? value : 0;
}

function resolveGizmoPivot<NodeType extends HierarchyNodeAny>(runtime: GizmoRuntime<NodeType>): void {
  if (runtime.mode !== 'rotate' && runtime.mode !== 'scale') {
    setGizmoPivotToBoundsCenter(runtime);
    return;
  }
  if (runtime.pivot === 'custom') {
    runtime.pivotWorld.x = runtime.customPivotX;
    runtime.pivotWorld.y = runtime.customPivotY;
    return;
  }
  if (runtime.pivot === 'origin') {
    runtime.features!.getWorldOrigin(runtime.pivotWorld, getActiveNode(runtime.selection!)!);
    return;
  }
  setGizmoPivotToBoundsCenter(runtime);
}

function setGizmoPivotToBoundsCenter<NodeType extends HierarchyNodeAny>(runtime: GizmoRuntime<NodeType>): void {
  runtime.pivotWorld.x = runtime.bounds.x + runtime.bounds.width * 0.5;
  runtime.pivotWorld.y = runtime.bounds.y + runtime.bounds.height * 0.5;
}

function resolveGizmoScreenRotation<NodeType extends HierarchyNodeAny>(runtime: GizmoRuntime<NodeType>): number {
  if (runtime.space === 'world') return 0;
  const worldRotation = runtime.features!.getWorldRotation(getActiveNode(runtime.selection!)!);
  return worldRotation - runtime.camera!.rotation * RAD_TO_DEG;
}

function setGizmoNodeTransform(node: Node2D, x: number, y: number, rotation: number): void {
  if (node.x === x && node.y === y && node.rotation === rotation) return;
  node.x = x;
  node.y = y;
  node.rotation = rotation;
  invalidateNodeLocalTransform(node);
}

function setGizmoNodeVisible(node: Node2D, visible: boolean): void {
  if (node.visible === visible) return;
  node.visible = visible;
  invalidateNodeAppearance(node);
}

function snapGizmoDelta(value: number, step: number): number {
  return step === 0 ? value : roundTo(value, step);
}

function snapGizmoScale(value: number, step: number): number {
  return step === 0 ? value : 1 + roundTo(value - 1, step);
}

function startGizmoTransform<NodeType extends HierarchyNodeAny>(
  runtime: GizmoRuntime<NodeType>,
  handle: GizmoHandleKind,
  data: Readonly<PointerEventData>,
): void {
  const mode = getGizmoTransformMode(handle);
  if (runtime.disposed || runtime.drag !== null || runtime.mode !== mode) return;
  const active = getActiveNode(runtime.selection!);
  const axisRotation =
    runtime.space === 'local' && active !== null
      ? runtime.features!.getWorldRotation(active)
      : runtime.camera!.rotation * RAD_TO_DEG;
  unprojectCamera2DPoint(runtime.camera!, data.x, data.y, runtime.scratchPoint);
  runtime.drag = {
    axisRotation,
    handle,
    mode,
    pivotWorldX: runtime.pivotWorld.x,
    pivotWorldY: runtime.pivotWorld.y,
    pivotScreenX: runtime.pivotScreen.x,
    pivotScreenY: runtime.pivotScreen.y,
    pointerId: data.pointerId,
    screenRotation: runtime.handleRoot.rotation * DEG_TO_RAD,
    startScreenX: data.x,
    startScreenY: data.y,
    startWorldX: runtime.scratchPoint.x,
    startWorldY: runtime.scratchPoint.y,
  };
  emitSignal(runtime.signals.onTransformBegin);
}

function toGizmoHandleName(placement: GizmoHandlePlacement): string {
  if (placement === 'rotate') return 'Rotate';
  if (placement === 'scale-east') return 'ScaleEast';
  if (placement === 'scale-west') return 'ScaleWest';
  if (placement === 'scale-north') return 'ScaleNorth';
  if (placement === 'scale-south') return 'ScaleSouth';
  if (placement === 'scale-northeast') return 'ScaleNortheast';
  if (placement === 'scale-northwest') return 'ScaleNorthwest';
  if (placement === 'scale-southeast') return 'ScaleSoutheast';
  if (placement === 'scale-southwest') return 'ScaleSouthwest';
  if (placement === 'translate-x') return 'TranslateX';
  if (placement === 'translate-y') return 'TranslateY';
  return 'TranslateXY';
}

function updateGizmoHandleVisibility<NodeType extends HierarchyNodeAny>(
  runtime: GizmoRuntime<NodeType>,
  mode: GizmoMode,
): void {
  for (let i = 0; i < runtime.handles.length; i++) {
    const handle = runtime.handles[i];
    setGizmoNodeVisible(handle.node, getGizmoTransformMode(handle.kind) === mode);
  }
}

function updateGizmoOutline<NodeType extends HierarchyNodeAny>(runtime: GizmoRuntime<NodeType>): void {
  const bounds = runtime.bounds;
  const points = runtime.outlinePoints;
  projectCamera2DPoint(runtime.camera!, bounds.x, bounds.y, runtime.scratchPoint);
  points[0] = runtime.scratchPoint.x;
  points[1] = runtime.scratchPoint.y;
  projectCamera2DPoint(runtime.camera!, bounds.x + bounds.width, bounds.y, runtime.scratchPoint);
  points[2] = runtime.scratchPoint.x;
  points[3] = runtime.scratchPoint.y;
  projectCamera2DPoint(runtime.camera!, bounds.x + bounds.width, bounds.y + bounds.height, runtime.scratchPoint);
  points[4] = runtime.scratchPoint.x;
  points[5] = runtime.scratchPoint.y;
  projectCamera2DPoint(runtime.camera!, bounds.x, bounds.y + bounds.height, runtime.scratchPoint);
  points[6] = runtime.scratchPoint.x;
  points[7] = runtime.scratchPoint.y;
  clearShapeCommands(runtime.outline);
  appendShapeLineStyle(
    runtime.outline,
    1,
    (runtime.outlineColor >>> 8) & 0xffffff,
    (runtime.outlineColor & 0xff) / 0xff,
    false,
    'none',
  );
  appendShapeMoveTo(runtime.outline, points[0], points[1]);
  appendShapeLineTo(runtime.outline, points[2], points[3]);
  appendShapeLineTo(runtime.outline, points[4], points[5]);
  appendShapeLineTo(runtime.outline, points[6], points[7]);
  appendShapeLineTo(runtime.outline, points[0], points[1]);
}

function updateGizmoHandleLayout<NodeType extends HierarchyNodeAny>(runtime: GizmoRuntime<NodeType>): void {
  const radians = runtime.handleRoot.rotation * DEG_TO_RAD;
  const cos = Math.cos(radians);
  const sin = Math.sin(radians);
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (let i = 0; i < runtime.outlinePoints.length; i += 2) {
    const deltaX = runtime.outlinePoints[i] - runtime.pivotScreen.x;
    const deltaY = runtime.outlinePoints[i + 1] - runtime.pivotScreen.y;
    const localX = deltaX * cos + deltaY * sin;
    const localY = -deltaX * sin + deltaY * cos;
    minX = Math.min(minX, localX);
    minY = Math.min(minY, localY);
    maxX = Math.max(maxX, localX);
    maxY = Math.max(maxY, localY);
  }
  const centerX = (minX + maxX) * 0.5;
  const centerY = (minY + maxY) * 0.5;
  const rotateRadius = Math.max(
    minimumRotateRadius,
    Math.hypot(Math.max(Math.abs(minX), Math.abs(maxX)), Math.max(Math.abs(minY), Math.abs(maxY))) + rotatePadding,
  );
  for (let i = 0; i < runtime.handles.length; i++) {
    const handle = runtime.handles[i];
    if (handle.placement === 'rotate') {
      drawGizmoRotateHandle(handle.node, rotateRadius);
    } else if (handle.placement === 'scale-east') {
      setGizmoNodeTransform(handle.node, maxX, centerY, 0);
    } else if (handle.placement === 'scale-west') {
      setGizmoNodeTransform(handle.node, minX, centerY, 0);
    } else if (handle.placement === 'scale-north') {
      setGizmoNodeTransform(handle.node, centerX, minY, 0);
    } else if (handle.placement === 'scale-south') {
      setGizmoNodeTransform(handle.node, centerX, maxY, 0);
    } else if (handle.placement === 'scale-northeast') {
      setGizmoNodeTransform(handle.node, maxX, minY, 0);
    } else if (handle.placement === 'scale-northwest') {
      setGizmoNodeTransform(handle.node, minX, minY, 0);
    } else if (handle.placement === 'scale-southeast') {
      setGizmoNodeTransform(handle.node, maxX, maxY, 0);
    } else if (handle.placement === 'scale-southwest') {
      setGizmoNodeTransform(handle.node, minX, maxY, 0);
    }
  }
}

function updateGizmoScale<NodeType extends HierarchyNodeAny>(
  runtime: GizmoRuntime<NodeType>,
  drag: Readonly<GizmoDrag>,
  screenX: number,
  screenY: number,
  uniform: boolean,
): void {
  const cos = Math.cos(drag.screenRotation);
  const sin = Math.sin(drag.screenRotation);
  const startX = drag.startScreenX - drag.pivotScreenX;
  const startY = drag.startScreenY - drag.pivotScreenY;
  const currentX = screenX - drag.pivotScreenX;
  const currentY = screenY - drag.pivotScreenY;
  const startLocalX = startX * cos + startY * sin;
  const startLocalY = -startX * sin + startY * cos;
  const currentLocalX = currentX * cos + currentY * sin;
  const currentLocalY = -currentX * sin + currentY * cos;
  let scaleX = 1;
  let scaleY = 1;
  if (drag.handle === 'scale-x') {
    if (Math.abs(startLocalX) > Number.EPSILON) scaleX = currentLocalX / startLocalX;
    if (uniform) scaleY = scaleX;
  } else if (drag.handle === 'scale-y') {
    if (Math.abs(startLocalY) > Number.EPSILON) scaleY = currentLocalY / startLocalY;
    if (uniform) scaleX = scaleY;
  } else {
    const startLength = Math.hypot(startLocalX, startLocalY);
    const currentLength = Math.hypot(currentLocalX, currentLocalY);
    const uniform = startLength > Number.EPSILON ? currentLength / startLength : 1;
    scaleX = uniform;
    scaleY = uniform;
  }
  emitSignal(
    runtime.signals.onScale,
    snapGizmoScale(scaleX, runtime.snapScale),
    snapGizmoScale(scaleY, runtime.snapScale),
  );
}

function updateGizmoTransform<NodeType extends HierarchyNodeAny>(
  runtime: GizmoRuntime<NodeType>,
  data: Readonly<PointerEventData>,
): void {
  const drag = runtime.drag;
  if (drag === null || drag.pointerId !== data.pointerId) return;
  if (drag.mode === 'translate') updateGizmoTranslation(runtime, drag, data.x, data.y);
  else if (drag.mode === 'rotate') {
    const start = Math.atan2(drag.startScreenY - drag.pivotScreenY, drag.startScreenX - drag.pivotScreenX);
    const current = Math.atan2(data.y - drag.pivotScreenY, data.x - drag.pivotScreenX);
    const degrees = normalizeDegrees((current - start) * RAD_TO_DEG);
    emitSignal(runtime.signals.onRotate, snapGizmoDelta(degrees, runtime.snapRotation));
  } else updateGizmoScale(runtime, drag, data.x, data.y, data.shiftKey);
}

function updateGizmoTranslation<NodeType extends HierarchyNodeAny>(
  runtime: GizmoRuntime<NodeType>,
  drag: Readonly<GizmoDrag>,
  screenX: number,
  screenY: number,
): void {
  unprojectCamera2DPoint(runtime.camera!, screenX, screenY, runtime.scratchPoint);
  const deltaX = runtime.scratchPoint.x - drag.startWorldX;
  const deltaY = runtime.scratchPoint.y - drag.startWorldY;
  const radians = drag.axisRotation * DEG_TO_RAD;
  const cos = Math.cos(radians);
  const sin = Math.sin(radians);
  let localX = deltaX * cos + deltaY * sin;
  let localY = -deltaX * sin + deltaY * cos;
  if (drag.handle === 'translate-x') localY = 0;
  else if (drag.handle === 'translate-y') localX = 0;
  if (runtime.snapTranslate !== 0) {
    const pivotLocalX = drag.pivotWorldX * cos + drag.pivotWorldY * sin;
    const pivotLocalY = -drag.pivotWorldX * sin + drag.pivotWorldY * cos;
    if (drag.handle !== 'translate-y') localX = roundTo(pivotLocalX + localX, runtime.snapTranslate) - pivotLocalX;
    if (drag.handle !== 'translate-x') localY = roundTo(pivotLocalY + localY, runtime.snapTranslate) - pivotLocalY;
  }
  emitSignal(runtime.signals.onTranslate, localX * cos - localY * sin, localX * sin + localY * cos);
}

const arrowSize = 7;
const centerColor = 0x42a5f5;
const handleCenterSize = 7;
const handleLength = 72;
const hitThickness = 9;
const defaultOutlineColor = 0x4488ffff;
const minimumRotateRadius = 52;
const rotatePadding = 20;
const rotateColor = 0xffca28;
const scaleBoxSize = 11;
const xAxisColor = 0xef5350;
const yAxisColor = 0x66bb6a;
