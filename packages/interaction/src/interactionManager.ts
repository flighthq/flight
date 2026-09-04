import { allocateEntity, finishEntity } from '@flighthq/entity/contract';
import { inverseMatrixTransformPointXY } from '@flighthq/geometry/contract';
import { getNodeParent, getNodeRuntime, getNodeWorldMatrix } from '@flighthq/node/contract';
import { connectSignal, createSignal, disconnectSignal, emitSignal, isSlotConnected } from '@flighthq/signals/contract';
import type {
  AnyInteractionSignalSlot,
  Cursor,
  FocusEventData,
  HasTransform2DRuntime,
  InputKeyboardData,
  InputPointerData,
  InteractionConnectGuard,
  InteractionDispatchLayer,
  InteractionDispatchLayerOptions,
  InteractionInputSource,
  InteractionManager,
  InteractionManagerOptions,
  InteractionPointerOptions,
  InteractionPointerState,
  InteractionSignalName,
  InteractionSignals,
  KeyboardEventData,
  NodeAny,
  NodeRuntime,
  PointerEventData,
  Signal,
  SignalConnectOptions,
  Transform2DNode,
} from '@flighthq/types/contract';

import { findGraphHitTarget, findGraphHitTargetPrecise } from './hitTests';
import { findSpatialInteractionTarget } from './interactionSpatialIndex';
import { getNodeCursor, getNodeInteractionState } from './nodeInteractionState';

export function captureInteractionPointer<N extends NodeAny>(
  manager: InteractionManager<N>,
  pointerId: number,
  target: N,
): void {
  manager.pointerCaptures.set(pointerId, target);
}

/**
 * Wires an input source's pointer/keyboard signals into an interaction manager, forwarding each
 * event to the matching dispatch function.
 *
 * Coordinate space: the pointer coordinates on an `InputPointerData` from the DOM input backend are
 * CSS pixels (see `attachPointerInput`), while hit testing runs in the scene's device-pixel space.
 * `coordScale` bridges the two and is multiplied into every forwarded pointer coordinate; pass the
 * canvas's backing-store scale — typically `window.devicePixelRatio`, matching how the renderer
 * sizes its drawing buffer. The default `1` is correct only when the backing store is unscaled.
 *
 * This scales but does not translate: it assumes the pointer coordinates are already canvas-local
 * (origin at the canvas's top-left). A backend delivering viewport-relative coordinates for a canvas
 * not at the viewport origin must subtract the canvas bounding-rect offset per event before this
 * point, since that offset moves with scroll and layout.
 */
export function connectInputToInteraction<N extends NodeAny>(
  input: InteractionInputSource,
  manager: InteractionManager<N>,
  coordScale: number = 1,
): () => void {
  const sx = (v: number) => v * coordScale;
  const onKeyDown = (data: Readonly<InputKeyboardData>) =>
    dispatchInteractionKeyDown(manager, data.key, data.keyCode, data);
  const onKeyUp = (data: Readonly<InputKeyboardData>) =>
    dispatchInteractionKeyUp(manager, data.key, data.keyCode, data);
  const onPointerCancel = (data: Readonly<InputPointerData>) =>
    dispatchInteractionPointerCancel(manager, sx(data.x), sx(data.y), data);
  const onPointerDown = (data: Readonly<InputPointerData>) =>
    dispatchInteractionPointerDown(manager, sx(data.x), sx(data.y), data.button, data);
  const onPointerMove = (data: Readonly<InputPointerData>) =>
    dispatchInteractionPointerMove(manager, sx(data.x), sx(data.y), data.button, data);
  const onPointerUp = (data: Readonly<InputPointerData>) =>
    dispatchInteractionPointerUp(manager, sx(data.x), sx(data.y), data.button, data.timeStamp, data);
  const onWheel = (data: Readonly<InputPointerData>) =>
    dispatchInteractionWheel(manager, sx(data.x), sx(data.y), data.deltaX, data.deltaY, data);

  connectSignal(input.onKeyDown, onKeyDown);
  connectSignal(input.onKeyUp, onKeyUp);
  connectSignal(input.onPointerCancel, onPointerCancel);
  connectSignal(input.onPointerDown, onPointerDown);
  connectSignal(input.onPointerMove, onPointerMove);
  connectSignal(input.onPointerUp, onPointerUp);
  connectSignal(input.onWheel, onWheel);

  return () => {
    disconnectSignal(input.onKeyDown, onKeyDown);
    disconnectSignal(input.onKeyUp, onKeyUp);
    disconnectSignal(input.onPointerCancel, onPointerCancel);
    disconnectSignal(input.onPointerDown, onPointerDown);
    disconnectSignal(input.onPointerMove, onPointerMove);
    disconnectSignal(input.onPointerUp, onPointerUp);
    disconnectSignal(input.onWheel, onWheel);
    resetInteractionClickStates(manager);
  };
}

/**
 * Adds a priority-ordered layer before Flight signal dispatch and returns an idempotent disconnect.
 * Equal priorities retain connection order. Each dispatch snapshots the current list: additions wait
 * for the next dispatch, while a layer removed during the walk still receives the current one.
 */
export function connectInteractionDispatchLayer<N extends NodeAny>(
  manager: InteractionManager<N>,
  layer: InteractionDispatchLayer<N>,
  options: Readonly<InteractionDispatchLayerOptions> = {},
): () => void {
  const entry = { layer, priority: options.priority ?? 0 };
  const layers = (manager.dispatchLayers ??= []);
  let index = 0;
  while (index < layers.length && entry.priority <= layers[index]!.priority) index++;
  layers.splice(index, 0, entry);

  let connected = true;
  return () => {
    if (!connected) return;
    connected = false;
    const current = manager.dispatchLayers;
    if (current === null) return;
    const currentIndex = current.indexOf(entry);
    if (currentIndex === -1) return;
    current.splice(currentIndex, 1);
    if (current.length === 0) manager.dispatchLayers = null;
  };
}

export function connectInteractionSignal<N extends NodeAny, Name extends InteractionSignalName>(
  manager: InteractionManager<N>,
  target: N,
  name: Name,
  slot: InteractionSignalSlot<Name>,
  options?: Readonly<SignalConnectOptions>,
): void {
  const signal = enableInteractionSignals(target)[name] as Signal<InteractionSignalSlot<Name>>;
  const trackedSlot = getTrackedInteractionSignalSlot(manager, target, name, slot);
  if (trackedSlot !== null && isSlotConnected(signal, trackedSlot as InteractionSignalSlot<Name>)) return;

  if (isSlotConnected(signal, slot)) {
    setTrackedInteractionSignalSlot(manager, target, name, slot, slot);
    incrementInteractionSignalSubscriberCount(manager, name);
    return;
  }

  const connectedSlot =
    options?.once === true
      ? (data: InteractionSignalPayload<Name>) => {
          slot(data);
          removeTrackedInteractionSignalSlot(manager, target, name, slot);
          decrementInteractionSignalSubscriberCount(manager, name);
        }
      : slot;

  connectSignal(signal, connectedSlot, options);
  setTrackedInteractionSignalSlot(manager, target, name, slot, connectedSlot);
  incrementInteractionSignalSubscriberCount(manager, name);

  // Diagnostics seam: the guard module (separately imported) fills this to catch listeners on nodes
  // with no hit path. Null in production, so no `@flighthq/log` weight on the base bundle.
  interactionConnectGuard?.(target, name);
}

export function createInteractionManager<N extends NodeAny>(
  root: N,
  options: Readonly<InteractionManagerOptions> = {},
): InteractionManager<N> {
  const out = allocateEntity<unknown>();
  out.cursorBackend = options.cursorBackend ?? null;
  out.cursorTarget = null;
  out.dispatchLayers = null;
  out.doubleClickDelay = options.doubleClickDelay ?? 500;
  out.doubleClickDistance = options.doubleClickDistance ?? 4;
  out.enabled = options.enabled ?? true;
  out.pointerCaptures = new Map();
  out.pointerStates = new Map();
  out.precise = options.precise ?? false;
  out.root = root;
  out.spatialIndex = options.spatialIndex ?? null;
  out.signalSubscriberCounts = new Map();
  out.trackedSignalSlots = new Map();
  out.trackedSubscribersOnly = options.trackedSubscribersOnly ?? false;
  return finishEntity(out);
}

export function createInteractionSignals(): InteractionSignals {
  const out = allocateEntity<InteractionSignals>();
  out.onClick = createSignal();
  out.onContextMenu = createSignal();
  out.onDoubleClick = createSignal();
  out.onFocusIn = createSignal();
  out.onFocusOut = createSignal();
  out.onKeyDown = createSignal();
  out.onKeyUp = createSignal();
  out.onPointerCancel = createSignal();
  out.onPointerDoubleClick = createSignal();
  out.onPointerDown = createSignal();
  out.onPointerMove = createSignal();
  out.onPointerOut = createSignal();
  out.onPointerOver = createSignal();
  out.onPointerRollOut = createSignal();
  out.onPointerRollOver = createSignal();
  out.onPointerUp = createSignal();
  out.onReleaseOutside = createSignal();
  out.onWheel = createSignal();
  return finishEntity(out);
}

export function disconnectInteractionSignal<N extends NodeAny, Name extends InteractionSignalName>(
  manager: InteractionManager<N>,
  target: N,
  name: Name,
  slot: InteractionSignalSlot<Name>,
): void {
  const signal = getInteractionSignal(target, name) as Signal<InteractionSignalSlot<Name>> | null;
  if (signal === null) return;

  const trackedSlot = getTrackedInteractionSignalSlot(manager, target, name, slot);
  const connectedSlot = (trackedSlot ?? slot) as InteractionSignalSlot<Name>;
  if (!isSlotConnected(signal, connectedSlot)) return;

  disconnectSignal(signal, connectedSlot);
  removeTrackedInteractionSignalSlot(manager, target, name, slot);
  decrementInteractionSignalSubscriberCount(manager, name);
}

export function dispatchInteractionContextMenu<N extends NodeAny>(
  manager: InteractionManager<N>,
  x: number,
  y: number,
  button: number = 2,
  options?: Readonly<InteractionPointerOptions>,
): void {
  dispatchPointerSignalAt(manager, 'onContextMenu', x, y, button, 0, 0, options);
}

export function dispatchInteractionKeyDown<N extends NodeAny>(
  manager: InteractionManager<N>,
  key: string,
  keyCode: number = 0,
  modifiers?: Readonly<Partial<KeyboardEventData>>,
): void {
  dispatchKeyboardSignal(manager, 'onKeyDown', key, keyCode, modifiers);
}

export function dispatchInteractionKeyUp<N extends NodeAny>(
  manager: InteractionManager<N>,
  key: string,
  keyCode: number = 0,
  modifiers?: Readonly<Partial<KeyboardEventData>>,
): void {
  dispatchKeyboardSignal(manager, 'onKeyUp', key, keyCode, modifiers);
}

export function dispatchInteractionPointerCancel<N extends NodeAny>(
  manager: InteractionManager<N>,
  x: number,
  y: number,
  options?: Readonly<InteractionPointerOptions>,
): void {
  const pointerId = options?.pointerId ?? 0;
  const existingState = manager.pointerStates.get(pointerId);
  if (existingState !== undefined) resetInteractionClickState(existingState);
  if (!isPointerSignalNeeded(manager, cancelSignalNames)) return;

  const state = existingState ?? getInteractionPointerState(manager, pointerId);
  const captured = manager.pointerCaptures.get(pointerId) ?? null;
  const oldTarget = state.pointerOverTarget;
  const target = captured ?? state.pointerDownTarget ?? oldTarget;
  state.pointerDownTarget = null;
  state.pointerOverTarget = null;
  manager.pointerCaptures.delete(pointerId);

  setPointerData(target, null, x, y, -1, 0, 0, options);
  if (target !== null) {
    if (
      manager.dispatchLayers === null ||
      dispatchInteractionLayers(manager, target, 'onPointerCancel', _pointerData)
    ) {
      emitInteractionSignal(target, manager.root, 'onPointerCancel', _pointerData);
    }
  }
  if (oldTarget !== null) {
    dispatchPointerRolloverChange(manager, oldTarget, null);
  }
}

export function dispatchInteractionPointerDown<N extends NodeAny>(
  manager: InteractionManager<N>,
  x: number,
  y: number,
  button: number = 0,
  options?: Readonly<InteractionPointerOptions>,
): void {
  if (!isPointerSignalNeeded(manager, downSignalNames)) return;

  const pointerId = options?.pointerId ?? 0;
  const state = getInteractionPointerState(manager, pointerId);
  const target = findInteractionTarget(manager, x, y, pointerId);
  resetPointerDoubleClickIfInvalid(manager, state, target, x, y, button, options?.timeStamp);
  if (target === null) return;

  state.pointerDownTarget = target;
  setPointerData(target, null, x, y, button, 0, 0, options);
  if (manager.dispatchLayers === null || dispatchInteractionLayers(manager, target, 'onPointerDown', _pointerData)) {
    emitInteractionSignal(target, manager.root, 'onPointerDown', _pointerData);
  }
}

export function dispatchInteractionPointerMove<N extends NodeAny>(
  manager: InteractionManager<N>,
  x: number,
  y: number,
  button: number = 0,
  options?: Readonly<InteractionPointerOptions>,
): void {
  // Run the move body when a rollover subscriber needs it OR a cursor backend is active — a scene that
  // only changes the cursor on hover (no move/over/out listeners) must still resolve the rollover.
  if (!isPointerSignalNeeded(manager, moveSignalNames) && !(manager.enabled && manager.cursorBackend !== null)) {
    return;
  }

  const pointerId = options?.pointerId ?? 0;
  const state = getInteractionPointerState(manager, pointerId);
  const oldTarget = state.pointerOverTarget;
  const target = findInteractionTarget(manager, x, y, pointerId);
  resetPointerDoubleClickIfInvalid(manager, state, target, x, y, button, options?.timeStamp);
  if (target === null && oldTarget === null) return;

  state.pointerOverTarget = target;
  setPointerData(target, null, x, y, button, 0, 0, options);

  if (target !== oldTarget) {
    dispatchPointerRolloverChange(manager, oldTarget, target);
  }

  if (target !== null) {
    if (manager.dispatchLayers === null || dispatchInteractionLayers(manager, target, 'onPointerMove', _pointerData)) {
      emitInteractionSignal(target, manager.root, 'onPointerMove', _pointerData);
    }
  }
}

export function dispatchInteractionPointerUp<N extends NodeAny>(
  manager: InteractionManager<N>,
  x: number,
  y: number,
  button: number = 0,
  time?: number,
  options?: Readonly<InteractionPointerOptions>,
): void {
  if (!isPointerSignalNeeded(manager, upSignalNames)) return;

  const clickTime = time ?? options?.timeStamp ?? 0;
  const pointerId = options?.pointerId ?? 0;
  const state = getInteractionPointerState(manager, pointerId);
  const downTarget = state.pointerDownTarget;
  const target = findInteractionTarget(manager, x, y, pointerId);
  resetPointerDoubleClickIfInvalid(manager, state, target, x, y, button, clickTime);
  state.pointerDownTarget = null;
  setPointerData(target ?? downTarget, null, x, y, button, 0, 0, options);

  if (target !== null) {
    if (manager.dispatchLayers === null || dispatchInteractionLayers(manager, target, 'onPointerUp', _pointerData)) {
      emitInteractionSignal(target, manager.root, 'onPointerUp', _pointerData);
    }
  }

  if (downTarget === null) return;

  if (target === downTarget) {
    if (manager.dispatchLayers === null || dispatchInteractionLayers(manager, target, 'onClick', _pointerData)) {
      emitInteractionSignal(target, manager.root, 'onClick', _pointerData);
    }
    const legacyElapsed = clickTime - state.lastClickTime;
    if (state.lastClickTarget === target && legacyElapsed >= 0 && legacyElapsed <= manager.doubleClickDelay) {
      if (
        manager.dispatchLayers === null ||
        dispatchInteractionLayers(manager, target, 'onDoubleClick', _pointerData)
      ) {
        emitInteractionSignal(target, manager.root, 'onDoubleClick', _pointerData);
      }
      state.lastClickTarget = null;
      state.lastClickTime = -Infinity;
    } else {
      state.lastClickTarget = target;
      state.lastClickTime = clickTime;
    }
    dispatchPointerDoubleClick(manager, state, target, x, y, button, clickTime);
  } else {
    resetInteractionClickState(state);
    if (
      manager.dispatchLayers === null ||
      dispatchInteractionLayers(manager, downTarget, 'onReleaseOutside', _pointerData)
    ) {
      emitInteractionSignal(downTarget, manager.root, 'onReleaseOutside', _pointerData);
    }
  }
}

export function dispatchInteractionWheel<N extends NodeAny>(
  manager: InteractionManager<N>,
  x: number,
  y: number,
  deltaX: number = 0,
  deltaY: number = 0,
  options?: Readonly<InteractionPointerOptions>,
): void {
  dispatchPointerSignalAt(manager, 'onWheel', x, y, 0, deltaX, deltaY, options);
}

export function enableInteractionSignals<N extends NodeAny>(source: N): InteractionSignals {
  const runtime = getNodeRuntime(source) as NodeRuntime<NodeAny>;
  return (runtime.interactionSignals ??= createInteractionSignals());
}

export function getInteractionSignals<N extends NodeAny>(source: N): InteractionSignals | null {
  return (getNodeRuntime(source) as NodeRuntime<NodeAny>).interactionSignals;
}

/** Re-resolves and immediately applies the cursor for the manager's current rollover target. */
export function invalidateInteractionCursor<N extends NodeAny>(manager: InteractionManager<N>): void {
  applyInteractionCursor(manager, manager.cursorTarget);
}

export function releaseInteractionPointer<N extends NodeAny>(manager: InteractionManager<N>, pointerId: number): void {
  manager.pointerCaptures.delete(pointerId);
  const state = manager.pointerStates.get(pointerId);
  if (state !== undefined) resetInteractionClickState(state);
}

/**
 * Installs the connect-time guard hook consulted by `connectInteractionSignal`; `null` uninstalls it.
 * This is the diagnostics seam — `enableInteractionGuards` (a separately-imported module that depends on
 * `@flighthq/log`) provides the implementation, so the core carries no message or log weight.
 **/
export function setInteractionConnectGuard(guard: InteractionConnectGuard | null): void {
  interactionConnectGuard = guard;
}

function dispatchKeyboardSignal<N extends NodeAny>(
  manager: InteractionManager<N>,
  name: KeyboardSignalName,
  key: string,
  keyCode: number,
  modifiers?: Readonly<Partial<KeyboardEventData>>,
): void {
  if (!manager.enabled || (manager.dispatchLayers === null && !hasInteractionSignalSubscriber(manager, name))) return;
  setKeyboardData(key, keyCode, modifiers);
  if (manager.dispatchLayers === null || dispatchInteractionLayers(manager, manager.root, name, _keyboardData)) {
    emitInteractionSignal(manager.root, manager.root, name, _keyboardData);
  }
}

function dispatchPointerRolloverChange<N extends NodeAny>(
  manager: InteractionManager<N>,
  oldTarget: N | null,
  target: N | null,
): void {
  if (oldTarget !== null) {
    if (
      manager.dispatchLayers === null ||
      dispatchInteractionLayers(manager, oldTarget, 'onPointerOut', _pointerData)
    ) {
      emitInteractionSignal(oldTarget, manager.root, 'onPointerOut', _pointerData);
    }
  }

  const oldChain = oldTarget !== null ? getInteractionChain(oldTarget, manager.root) : [];
  const newChain = target !== null ? getInteractionChain(target, manager.root) : [];

  for (const node of oldChain) {
    if (newChain.indexOf(node) === -1) {
      setInteractionSignalCurrentTarget(_pointerData, node, node);
      if (
        manager.dispatchLayers === null ||
        dispatchInteractionLayers(manager, node, 'onPointerRollOut', _pointerData)
      ) {
        emitInteractionSignalDirect(node, 'onPointerRollOut', _pointerData);
      }
    }
  }

  for (let i = newChain.length - 1; i >= 0; i--) {
    const node = newChain[i]!;
    if (oldChain.indexOf(node) === -1) {
      setInteractionSignalCurrentTarget(_pointerData, node, node);
      if (
        manager.dispatchLayers === null ||
        dispatchInteractionLayers(manager, node, 'onPointerRollOver', _pointerData)
      ) {
        emitInteractionSignalDirect(node, 'onPointerRollOver', _pointerData);
      }
    }
  }

  if (target !== null) {
    if (manager.dispatchLayers === null || dispatchInteractionLayers(manager, target, 'onPointerOver', _pointerData)) {
      emitInteractionSignal(target, manager.root, 'onPointerOver', _pointerData);
    }
  }

  manager.cursorTarget = target;
  applyInteractionCursor(manager, target);
}

/**
 * Applies the cursor resolved for the current rollover target through the manager's cursor backend.
 * No-op when no backend is installed. A `null` target (pointer left everything) clears to the default.
 **/
function applyInteractionCursor<N extends NodeAny>(manager: InteractionManager<N>, target: N | null): void {
  const backend = manager.cursorBackend;
  if (backend === null) return;
  backend.setCursor(resolveInteractionCursor(target, manager.root));
}

/**
 * Resolves the effective rollover cursor: the nearest cursor set on `target` or any of its ancestors
 * up to `root` (innermost wins). Returns `null` when none is set, so the backend clears to its default.
 **/
function resolveInteractionCursor<N extends NodeAny>(target: N | null, root: N): Cursor | null {
  let current: N | null = target;
  while (current !== null) {
    const cursor = getNodeCursor(current);
    if (cursor !== null) return cursor;
    if (current === root) break;
    current = getNodeParent(current) as N | null;
  }
  return null;
}

function dispatchPointerSignalAt<N extends NodeAny>(
  manager: InteractionManager<N>,
  name: PointerSignalName,
  x: number,
  y: number,
  button: number,
  deltaX: number = 0,
  deltaY: number = 0,
  options?: Readonly<InteractionPointerOptions>,
): void {
  if (!isPointerSignalNeeded(manager, [name])) return;

  const target = findInteractionTarget(manager, x, y, options?.pointerId ?? 0);
  if (target === null) return;

  setPointerData(target, null, x, y, button, deltaX, deltaY, options);
  if (manager.dispatchLayers === null || dispatchInteractionLayers(manager, target, name, _pointerData)) {
    emitInteractionSignal(target, manager.root, name, _pointerData);
  }
}

function emitInteractionSignal<N extends NodeAny, Name extends InteractionSignalName>(
  target: N,
  root: N,
  name: Name,
  data: InteractionSignalPayload<Name>,
): void {
  let current: N | null = target;
  while (current !== null) {
    setInteractionSignalCurrentTarget(data, target, current);
    emitInteractionSignalDirect(current, name, data);
    if (isInteractionSignalCancelled(current, name)) break;
    if (current === root) break;
    current = getNodeParent(current) as N | null;
  }
}

function emitInteractionSignalDirect<N extends NodeAny, Name extends InteractionSignalName>(
  target: N,
  name: Name,
  data: InteractionSignalPayload<Name>,
): void {
  const signal = getInteractionSignal(target, name);
  if (signal !== null) emitSignal(signal as Signal<(value: InteractionSignalPayload<Name>) => void>, data);
}

function dispatchInteractionLayers<N extends NodeAny, Name extends InteractionSignalName>(
  manager: InteractionManager<N>,
  target: N,
  name: Name,
  data: InteractionSignalPayload<Name>,
): boolean {
  const layers = manager.dispatchLayers;
  if (layers === null) return true;
  const snapshot = layers.slice();
  for (let i = 0; i < snapshot.length; i++) {
    if (!snapshot[i]!.layer(target, name, data)) return false;
  }
  return true;
}

function decrementInteractionSignalSubscriberCount<N extends NodeAny>(
  manager: InteractionManager<N>,
  name: InteractionSignalName,
): void {
  const count = manager.signalSubscriberCounts.get(name) ?? 0;
  if (count <= 1) {
    manager.signalSubscriberCounts.delete(name);
  } else {
    manager.signalSubscriberCounts.set(name, count - 1);
  }
}

function findInteractionTarget<N extends NodeAny>(
  manager: InteractionManager<N>,
  x: number,
  y: number,
  pointerId: number,
): N | null {
  if (!manager.enabled) return null;
  const captured = manager.pointerCaptures.get(pointerId);
  if (captured !== undefined) return captured;
  if (manager.spatialIndex !== null) return findSpatialInteractionTarget(manager, x, y, manager.precise) as N | null;
  const root = manager.root;
  return (manager.precise ? findGraphHitTargetPrecise(root, x, y) : findGraphHitTarget(root, x, y)) as N | null;
}

function dispatchPointerDoubleClick<N extends NodeAny>(
  manager: InteractionManager<N>,
  state: InteractionPointerState<N>,
  target: N,
  x: number,
  y: number,
  button: number,
  time: number,
): void {
  const interactionState = getNodeInteractionState(target);
  if (interactionState?.pointerDoubleClickEnabled !== true) {
    resetPointerDoubleClickState(state);
    return;
  }

  if (isPointerDoubleClickCandidateValid(manager, state, target, x, y, button, time)) {
    resetPointerDoubleClickState(state);
    if (
      manager.dispatchLayers === null ||
      dispatchInteractionLayers(manager, target, 'onPointerDoubleClick', _pointerData)
    ) {
      emitInteractionSignal(target, manager.root, 'onPointerDoubleClick', _pointerData);
    }
    return;
  }

  state.lastPointerClickButton = button;
  state.lastPointerClickInteractionState = interactionState;
  state.lastPointerClickTarget = target;
  state.lastPointerClickTime = time;
  state.lastPointerClickX = x;
  state.lastPointerClickY = y;
}

function isPointerDoubleClickCandidateValid<N extends NodeAny>(
  manager: InteractionManager<N>,
  state: InteractionPointerState<N>,
  target: N | null,
  x: number,
  y: number,
  button: number,
  time?: number,
): boolean {
  if (target === null || state.lastPointerClickTarget !== target || state.lastPointerClickButton !== button) {
    return false;
  }

  const interactionState = getNodeInteractionState(target);
  if (
    interactionState?.pointerDoubleClickEnabled !== true ||
    interactionState !== state.lastPointerClickInteractionState
  ) {
    return false;
  }

  const dx = x - state.lastPointerClickX;
  const dy = y - state.lastPointerClickY;
  if (dx * dx + dy * dy > manager.doubleClickDistance * manager.doubleClickDistance) return false;

  if (time !== undefined) {
    const elapsed = time - state.lastPointerClickTime;
    if (elapsed < 0 || elapsed > manager.doubleClickDelay) return false;
  }

  return true;
}

function resetInteractionClickState<N extends NodeAny>(state: InteractionPointerState<N>): void {
  state.lastClickTarget = null;
  state.lastClickTime = -Infinity;
  resetPointerDoubleClickState(state);
}

function resetInteractionClickStates<N extends NodeAny>(manager: InteractionManager<N>): void {
  for (const state of manager.pointerStates.values()) resetInteractionClickState(state);
}

function resetPointerDoubleClickIfInvalid<N extends NodeAny>(
  manager: InteractionManager<N>,
  state: InteractionPointerState<N>,
  target: N | null,
  x: number,
  y: number,
  button: number,
  time?: number,
): void {
  if (
    state.lastPointerClickTarget !== null &&
    !isPointerDoubleClickCandidateValid(manager, state, target, x, y, button, time)
  ) {
    resetPointerDoubleClickState(state);
  }
}

function resetPointerDoubleClickState<N extends NodeAny>(state: InteractionPointerState<N>): void {
  state.lastPointerClickButton = -1;
  state.lastPointerClickInteractionState = null;
  state.lastPointerClickTarget = null;
  state.lastPointerClickTime = -Infinity;
  state.lastPointerClickX = 0;
  state.lastPointerClickY = 0;
}

function getInteractionPointerState<N extends NodeAny>(
  manager: InteractionManager<N>,
  pointerId: number,
): InteractionPointerState<N> {
  let state = manager.pointerStates.get(pointerId);
  if (state === undefined) {
    state = {
      lastClickTarget: null,
      lastClickTime: -Infinity,
      lastPointerClickButton: -1,
      lastPointerClickInteractionState: null,
      lastPointerClickTarget: null,
      lastPointerClickTime: -Infinity,
      lastPointerClickX: 0,
      lastPointerClickY: 0,
      pointerDownTarget: null,
      pointerOverTarget: null,
    };
    manager.pointerStates.set(pointerId, state);
  }
  return state;
}

function getInteractionChain<N extends NodeAny>(target: N, root: N): N[] {
  const out: N[] = [];
  let current: N | null = target;
  while (current !== null) {
    out.push(current);
    if (current === root) break;
    current = getNodeParent(current) as N | null;
  }
  return out;
}

function getInteractionSignal<N extends NodeAny, Name extends InteractionSignalName>(
  source: Readonly<N>,
  name: Name,
): InteractionSignals[Name] | null {
  const signals = getNodeRuntime(source).interactionSignals;
  return signals !== null ? signals[name] : null;
}

function getTrackedInteractionSignalSlot<N extends NodeAny, Name extends InteractionSignalName>(
  manager: InteractionManager<N>,
  target: N,
  name: Name,
  slot: InteractionSignalSlot<Name>,
): AnyInteractionSignalSlot | null {
  return (
    manager.trackedSignalSlots
      .get(target)
      ?.get(name)
      ?.get(slot as AnyInteractionSignalSlot) ?? null
  );
}

function hasInteractionSignalSubscriber<N extends NodeAny>(
  manager: InteractionManager<N>,
  name: InteractionSignalName,
): boolean {
  if ((manager.signalSubscriberCounts.get(name) ?? 0) > 0) return true;
  if (manager.trackedSubscribersOnly) return false;
  return hasInteractionSignalSubscriberInGraph(manager.root, name);
}

function hasInteractionSignalSubscriberInGraph<N extends NodeAny>(
  source: Readonly<N>,
  name: InteractionSignalName,
): boolean {
  const signal = getInteractionSignal(source, name);
  if (signal?.data !== null && signal !== null) return true;

  const children = getNodeRuntime(source).children;
  if (children !== null) {
    for (const child of children) {
      if (hasInteractionSignalSubscriberInGraph(child as N, name)) return true;
    }
  }

  return false;
}

function incrementInteractionSignalSubscriberCount<N extends NodeAny>(
  manager: InteractionManager<N>,
  name: InteractionSignalName,
): void {
  manager.signalSubscriberCounts.set(name, (manager.signalSubscriberCounts.get(name) ?? 0) + 1);
}

function isInteractionSignalCancelled<N extends NodeAny>(source: Readonly<N>, name: InteractionSignalName): boolean {
  return getInteractionSignal(source, name)?.data?.cancelled === true;
}

function isPointerSignalNeeded<N extends NodeAny>(
  manager: InteractionManager<N>,
  names: readonly InteractionSignalName[],
): boolean {
  if (!manager.enabled) {
    resetInteractionClickStates(manager);
    return false;
  }
  if (manager.dispatchLayers !== null) return true;
  for (const name of names) {
    if (hasInteractionSignalSubscriber(manager, name)) return true;
  }
  return false;
}

function removeTrackedInteractionSignalSlot<N extends NodeAny, Name extends InteractionSignalName>(
  manager: InteractionManager<N>,
  target: N,
  name: Name,
  slot: InteractionSignalSlot<Name>,
): void {
  const targetSlots = manager.trackedSignalSlots.get(target);
  const signalSlots = targetSlots?.get(name);
  if (signalSlots === undefined) return;

  signalSlots.delete(slot as AnyInteractionSignalSlot);
  if (signalSlots.size === 0) targetSlots!.delete(name);
  if (targetSlots!.size === 0) manager.trackedSignalSlots.delete(target);
}

function setKeyboardData(
  key: string,
  keyCode: number,
  modifiers: Readonly<Partial<KeyboardEventData>> | undefined,
): void {
  _keyboardData.altKey = modifiers?.altKey ?? false;
  _keyboardData.ctrlKey = modifiers?.ctrlKey ?? false;
  _keyboardData.key = key;
  _keyboardData.keyCode = keyCode;
  _keyboardData.metaKey = modifiers?.metaKey ?? false;
  _keyboardData.shiftKey = modifiers?.shiftKey ?? false;
}

function setInteractionSignalCurrentTarget<Name extends InteractionSignalName>(
  data: InteractionSignalPayload<Name>,
  target: NodeAny,
  currentTarget: NodeAny,
): void {
  if ('currentTarget' in data) {
    const pointerData = data as PointerEventData;
    pointerData.target = target;
    pointerData.currentTarget = currentTarget;
    setPointerDataLocalPosition(pointerData, currentTarget);
  }
}

function setPointerData(
  target: NodeAny | null,
  currentTarget: NodeAny | null,
  x: number,
  y: number,
  button: number,
  deltaX: number = 0,
  deltaY: number = 0,
  options?: Readonly<InteractionPointerOptions>,
): void {
  _pointerData.altKey = options?.altKey ?? false;
  _pointerData.button = button;
  _pointerData.buttons = options?.buttons ?? (button >= 0 ? 1 << button : 0);
  _pointerData.ctrlKey = options?.ctrlKey ?? false;
  _pointerData.currentTarget = currentTarget;
  _pointerData.deltaX = deltaX;
  _pointerData.deltaY = deltaY;
  _pointerData.localX = x;
  _pointerData.localY = y;
  _pointerData.metaKey = options?.metaKey ?? false;
  _pointerData.pointerId = options?.pointerId ?? 0;
  _pointerData.pointerType = options?.pointerType ?? 'mouse';
  _pointerData.shiftKey = options?.shiftKey ?? false;
  _pointerData.target = target;
  _pointerData.worldX = x;
  _pointerData.worldY = y;
  _pointerData.x = x;
  _pointerData.y = y;
  if (currentTarget !== null) setPointerDataLocalPosition(_pointerData, currentTarget);
}

function setTrackedInteractionSignalSlot<N extends NodeAny, Name extends InteractionSignalName>(
  manager: InteractionManager<N>,
  target: N,
  name: Name,
  slot: InteractionSignalSlot<Name>,
  connectedSlot: InteractionSignalSlot<Name>,
): void {
  let targetSlots = manager.trackedSignalSlots.get(target);
  if (targetSlots === undefined) {
    targetSlots = new Map();
    manager.trackedSignalSlots.set(target, targetSlots);
  }

  let signalSlots = targetSlots.get(name);
  if (signalSlots === undefined) {
    signalSlots = new Map();
    targetSlots.set(name, signalSlots);
  }

  signalSlots.set(slot as AnyInteractionSignalSlot, connectedSlot as AnyInteractionSignalSlot);
}

function setPointerDataLocalPosition(data: PointerEventData, currentTarget: NodeAny): void {
  if (!isTransform2DNode(currentTarget)) {
    data.localX = data.worldX;
    data.localY = data.worldY;
    return;
  }
  inverseMatrixTransformPointXY(_localPoint, getNodeWorldMatrix(currentTarget), data.worldX, data.worldY);
  data.localX = _localPoint.x;
  data.localY = _localPoint.y;
}

function isTransform2DNode(source: Readonly<NodeAny>): source is Transform2DNode {
  const runtime = getNodeRuntime(source);
  return hasTransform2DRuntime(runtime);
}

function hasTransform2DRuntime(
  runtime: Readonly<NodeRuntime>,
): runtime is Readonly<NodeRuntime & HasTransform2DRuntime> {
  return 'worldMatrix' in runtime;
}

type KeyboardSignalName = 'onKeyDown' | 'onKeyUp';
type FocusSignalName = 'onFocusIn' | 'onFocusOut';
type PointerSignalName = Exclude<InteractionSignalName, KeyboardSignalName | FocusSignalName>;

type InteractionSignalPayload<Name extends InteractionSignalName> = Name extends KeyboardSignalName
  ? Readonly<KeyboardEventData>
  : Name extends FocusSignalName
    ? Readonly<FocusEventData>
    : Readonly<PointerEventData>;
type InteractionSignalSlot<Name extends InteractionSignalName> = (value: InteractionSignalPayload<Name>) => void;

let interactionConnectGuard: InteractionConnectGuard | null = null;

const cancelSignalNames = ['onPointerCancel', 'onPointerOut', 'onPointerRollOut'] as const;
const downSignalNames = [
  'onClick',
  'onDoubleClick',
  'onPointerCancel',
  'onPointerDoubleClick',
  'onPointerDown',
  'onReleaseOutside',
] as const;
const moveSignalNames = [
  'onPointerDoubleClick',
  'onPointerMove',
  'onPointerOut',
  'onPointerOver',
  'onPointerRollOut',
  'onPointerRollOver',
] as const;
const upSignalNames = ['onClick', 'onDoubleClick', 'onPointerDoubleClick', 'onPointerUp', 'onReleaseOutside'] as const;

const _keyboardData: KeyboardEventData = {
  altKey: false,
  ctrlKey: false,
  key: '',
  keyCode: 0,
  metaKey: false,
  shiftKey: false,
};
const _localPoint = { x: 0, y: 0 };
const _pointerData: PointerEventData = {
  altKey: false,
  button: 0,
  buttons: 0,
  ctrlKey: false,
  currentTarget: null,
  deltaX: 0,
  deltaY: 0,
  localX: 0,
  localY: 0,
  metaKey: false,
  pointerId: 0,
  pointerType: 'mouse',
  shiftKey: false,
  target: null,
  worldX: 0,
  worldY: 0,
  x: 0,
  y: 0,
};
