import { inverseMatrixTransformPointXY } from '@flighthq/geometry';
import { getSceneNodeRuntime, getSceneParent, getWorldTransformMatrix } from '@flighthq/scene';
import { connectSignal, createSignal, disconnectSignal, emitSignal, isSlotConnected } from '@flighthq/signals';
import type {
  GraphTransform2DNode,
  InputKeyboardData,
  InputPointerData,
  InputSignals,
  InteractionSignals,
  KeyboardData,
  PointerData,
  PointerType,
  SceneNode,
  SceneNodeRuntime,
  Signal,
  SignalConnectOptions,
} from '@flighthq/types';

import { findGraphHitTarget } from './hitTests';

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

export function capturePointer<SceneKind extends symbol, Traits extends object>(
  manager: InteractionManager<SceneKind, Traits>,
  pointerId: number,
  target: SceneNode<SceneKind, Traits>,
): void {
  manager.pointerCaptures.set(pointerId, target);
}

export function connectInputToInteraction<SceneKind extends symbol, Traits extends object>(
  input: InteractionInputSource,
  manager: InteractionManager<SceneKind, Traits>,
  coordScale: number = 1,
): () => void {
  const sx = (v: number) => v * coordScale;
  const onKeyDown = (data: Readonly<InputKeyboardData>) => dispatchKeyDown(manager, data.key, data.keyCode, data);
  const onKeyUp = (data: Readonly<InputKeyboardData>) => dispatchKeyUp(manager, data.key, data.keyCode, data);
  const onPointerCancel = (data: Readonly<InputPointerData>) =>
    dispatchPointerCancel(manager, sx(data.x), sx(data.y), data);
  const onPointerDown = (data: Readonly<InputPointerData>) =>
    dispatchPointerDown(manager, sx(data.x), sx(data.y), data.button, data);
  const onPointerMove = (data: Readonly<InputPointerData>) =>
    dispatchPointerMove(manager, sx(data.x), sx(data.y), data.button, data);
  const onPointerUp = (data: Readonly<InputPointerData>) =>
    dispatchPointerUp(manager, sx(data.x), sx(data.y), data.button, Date.now(), data);
  const onWheel = (data: Readonly<InputPointerData>) =>
    dispatchWheel(manager, sx(data.x), sx(data.y), data.deltaX, data.deltaY, data);

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
  };
}

export function connectInteractionSignal<
  SceneKind extends symbol,
  Traits extends object,
  Name extends InteractionSignalName,
>(
  manager: InteractionManager<SceneKind, Traits>,
  target: SceneNode<SceneKind, Traits>,
  name: Name,
  slot: InteractionSignalSlot<Name>,
  options?: Readonly<SignalConnectOptions>,
): void {
  const signal = getInteractionSignals(target)[name] as Signal<InteractionSignalSlot<Name>>;
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
}

export function createInteractionManager<SceneKind extends symbol, Traits extends object>(
  root: SceneNode<SceneKind, Traits>,
  options: Readonly<InteractionManagerOptions> = {},
): InteractionManager<SceneKind, Traits> {
  return {
    doubleClickDelay: 500,
    enabled: options.enabled ?? true,
    pointerCaptures: new Map(),
    pointerStates: new Map(),
    root,
    signalSubscriberCounts: new Map(),
    trackedSignalSlots: new Map(),
    trackedSubscribersOnly: options.trackedSubscribersOnly ?? false,
  };
}

export function createInteractionSignals(): InteractionSignals {
  return {
    onClick: createSignal(),
    onContextMenu: createSignal(),
    onDoubleClick: createSignal(),
    onKeyDown: createSignal(),
    onKeyUp: createSignal(),
    onPointerCancel: createSignal(),
    onPointerDown: createSignal(),
    onPointerMove: createSignal(),
    onPointerOut: createSignal(),
    onPointerOver: createSignal(),
    onPointerRollOut: createSignal(),
    onPointerRollOver: createSignal(),
    onPointerUp: createSignal(),
    onReleaseOutside: createSignal(),
    onWheel: createSignal(),
  };
}

export function disconnectInteractionSignal<
  SceneKind extends symbol,
  Traits extends object,
  Name extends InteractionSignalName,
>(
  manager: InteractionManager<SceneKind, Traits>,
  target: SceneNode<SceneKind, Traits>,
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

export function dispatchContextMenu<SceneKind extends symbol, Traits extends object>(
  manager: InteractionManager<SceneKind, Traits>,
  x: number,
  y: number,
  button: number = 2,
  options?: Readonly<InteractionPointerOptions>,
): void {
  dispatchPointerSignalAt(manager, 'onContextMenu', x, y, button, 0, 0, options);
}

export function dispatchKeyDown<SceneKind extends symbol, Traits extends object>(
  manager: InteractionManager<SceneKind, Traits>,
  key: string,
  keyCode: number = 0,
  modifiers?: Readonly<Partial<KeyboardData>>,
): void {
  dispatchKeyboardSignal(manager, 'onKeyDown', key, keyCode, modifiers);
}

export function dispatchKeyUp<SceneKind extends symbol, Traits extends object>(
  manager: InteractionManager<SceneKind, Traits>,
  key: string,
  keyCode: number = 0,
  modifiers?: Readonly<Partial<KeyboardData>>,
): void {
  dispatchKeyboardSignal(manager, 'onKeyUp', key, keyCode, modifiers);
}

export function dispatchPointerCancel<SceneKind extends symbol, Traits extends object>(
  manager: InteractionManager<SceneKind, Traits>,
  x: number,
  y: number,
  options?: Readonly<InteractionPointerOptions>,
): void {
  if (!isPointerSignalNeeded(manager, cancelSignalNames)) return;

  const pointerId = options?.pointerId ?? 0;
  const state = getInteractionPointerState(manager, pointerId);
  const captured = manager.pointerCaptures.get(pointerId) ?? null;
  const oldTarget = state.pointerOverTarget;
  const target = captured ?? state.pointerDownTarget ?? oldTarget;
  state.pointerDownTarget = null;
  state.pointerOverTarget = null;
  manager.pointerCaptures.delete(pointerId);

  setPointerData(target, null, x, y, -1, 0, 0, options);
  if (target !== null) {
    emitInteractionSignal(target, manager.root, 'onPointerCancel', _pointerData);
  }
  if (oldTarget !== null) {
    dispatchPointerRolloverChange(manager, oldTarget, null);
  }
}

export function dispatchPointerDown<SceneKind extends symbol, Traits extends object>(
  manager: InteractionManager<SceneKind, Traits>,
  x: number,
  y: number,
  button: number = 0,
  options?: Readonly<InteractionPointerOptions>,
): void {
  if (!isPointerSignalNeeded(manager, downSignalNames)) return;

  const pointerId = options?.pointerId ?? 0;
  const state = getInteractionPointerState(manager, pointerId);
  const target = findInteractionTarget(manager, x, y, pointerId);
  if (target === null) return;

  state.pointerDownTarget = target;
  setPointerData(target, null, x, y, button, 0, 0, options);
  emitInteractionSignal(target, manager.root, 'onPointerDown', _pointerData);
}

export function dispatchPointerMove<SceneKind extends symbol, Traits extends object>(
  manager: InteractionManager<SceneKind, Traits>,
  x: number,
  y: number,
  button: number = 0,
  options?: Readonly<InteractionPointerOptions>,
): void {
  if (!isPointerSignalNeeded(manager, moveSignalNames)) return;

  const pointerId = options?.pointerId ?? 0;
  const state = getInteractionPointerState(manager, pointerId);
  const oldTarget = state.pointerOverTarget;
  const target = findInteractionTarget(manager, x, y, pointerId);
  if (target === null && oldTarget === null) return;

  state.pointerOverTarget = target;
  setPointerData(target, null, x, y, button, 0, 0, options);

  if (target !== oldTarget) {
    dispatchPointerRolloverChange(manager, oldTarget, target);
  }

  if (target !== null) {
    emitInteractionSignal(target, manager.root, 'onPointerMove', _pointerData);
  }
}

export function dispatchPointerUp<SceneKind extends symbol, Traits extends object>(
  manager: InteractionManager<SceneKind, Traits>,
  x: number,
  y: number,
  button: number = 0,
  time: number = Date.now(),
  options?: Readonly<InteractionPointerOptions>,
): void {
  if (!isPointerSignalNeeded(manager, upSignalNames)) return;

  const pointerId = options?.pointerId ?? 0;
  const state = getInteractionPointerState(manager, pointerId);
  const downTarget = state.pointerDownTarget;
  const target = findInteractionTarget(manager, x, y, pointerId);
  state.pointerDownTarget = null;
  setPointerData(target ?? downTarget, null, x, y, button, 0, 0, options);

  if (target !== null) {
    emitInteractionSignal(target, manager.root, 'onPointerUp', _pointerData);
  }

  if (downTarget === null) return;

  if (target === downTarget) {
    emitInteractionSignal(target, manager.root, 'onClick', _pointerData);
    if (state.lastClickTarget === target && time - state.lastClickTime <= manager.doubleClickDelay) {
      emitInteractionSignal(target, manager.root, 'onDoubleClick', _pointerData);
      state.lastClickTarget = null;
      state.lastClickTime = -Infinity;
    } else {
      state.lastClickTarget = target;
      state.lastClickTime = time;
    }
  } else {
    emitInteractionSignal(downTarget, manager.root, 'onReleaseOutside', _pointerData);
  }
}

export function dispatchWheel<SceneKind extends symbol, Traits extends object>(
  manager: InteractionManager<SceneKind, Traits>,
  x: number,
  y: number,
  deltaX: number = 0,
  deltaY: number = 0,
  options?: Readonly<InteractionPointerOptions>,
): void {
  dispatchPointerSignalAt(manager, 'onWheel', x, y, 0, deltaX, deltaY, options);
}

export function getInteractionSignals<SceneKind extends symbol, Traits extends object>(
  source: SceneNode<SceneKind, Traits>,
): InteractionSignals {
  const runtime = getSceneNodeRuntime(source) as SceneNodeRuntime<SceneKind, Traits>;
  return (runtime.interactionSignals ??= createInteractionSignals());
}

export function releasePointer<SceneKind extends symbol, Traits extends object>(
  manager: InteractionManager<SceneKind, Traits>,
  pointerId: number,
): void {
  manager.pointerCaptures.delete(pointerId);
}

function dispatchKeyboardSignal<SceneKind extends symbol, Traits extends object>(
  manager: InteractionManager<SceneKind, Traits>,
  name: KeyboardSignalName,
  key: string,
  keyCode: number,
  modifiers?: Readonly<Partial<KeyboardData>>,
): void {
  if (!manager.enabled || !hasInteractionSignalSubscriber(manager, name)) return;
  setKeyboardData(key, keyCode, modifiers);
  emitInteractionSignal(manager.root, manager.root, name, _keyboardData);
}

function dispatchPointerRolloverChange<SceneKind extends symbol, Traits extends object>(
  manager: InteractionManager<SceneKind, Traits>,
  oldTarget: SceneNode<SceneKind, Traits> | null,
  target: SceneNode<SceneKind, Traits> | null,
): void {
  if (oldTarget !== null) {
    emitInteractionSignal(oldTarget, manager.root, 'onPointerOut', _pointerData);
  }

  const oldChain = oldTarget !== null ? getInteractionChain(oldTarget, manager.root) : [];
  const newChain = target !== null ? getInteractionChain(target, manager.root) : [];

  for (const node of oldChain) {
    if (newChain.indexOf(node) === -1) {
      setInteractionSignalCurrentTarget(_pointerData, node, node);
      emitInteractionSignalDirect(node, 'onPointerRollOut', _pointerData);
    }
  }

  for (let i = newChain.length - 1; i >= 0; i--) {
    const node = newChain[i]!;
    if (oldChain.indexOf(node) === -1) {
      setInteractionSignalCurrentTarget(_pointerData, node, node);
      emitInteractionSignalDirect(node, 'onPointerRollOver', _pointerData);
    }
  }

  if (target !== null) {
    emitInteractionSignal(target, manager.root, 'onPointerOver', _pointerData);
  }
}

function dispatchPointerSignalAt<SceneKind extends symbol, Traits extends object>(
  manager: InteractionManager<SceneKind, Traits>,
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
  emitInteractionSignal(target, manager.root, name, _pointerData);
}

function emitInteractionSignal<SceneKind extends symbol, Traits extends object, Name extends InteractionSignalName>(
  target: SceneNode<SceneKind, Traits>,
  root: SceneNode<SceneKind, Traits>,
  name: Name,
  data: InteractionSignalPayload<Name>,
): void {
  let current: SceneNode<SceneKind, Traits> | null = target;
  while (current !== null) {
    setInteractionSignalCurrentTarget(data, target, current);
    emitInteractionSignalDirect(current, name, data);
    if (isInteractionSignalCancelled(current, name)) break;
    if (current === root) break;
    current = getSceneParent(current) as SceneNode<SceneKind, Traits> | null;
  }
}

function emitInteractionSignalDirect<
  SceneKind extends symbol,
  Traits extends object,
  Name extends InteractionSignalName,
>(target: SceneNode<SceneKind, Traits>, name: Name, data: InteractionSignalPayload<Name>): void {
  const signal = getInteractionSignal(target, name);
  if (signal !== null) emitSignal(signal as Signal<(value: InteractionSignalPayload<Name>) => void>, data);
}

function decrementInteractionSignalSubscriberCount<SceneKind extends symbol, Traits extends object>(
  manager: InteractionManager<SceneKind, Traits>,
  name: InteractionSignalName,
): void {
  const count = manager.signalSubscriberCounts.get(name) ?? 0;
  if (count <= 1) {
    manager.signalSubscriberCounts.delete(name);
  } else {
    manager.signalSubscriberCounts.set(name, count - 1);
  }
}

function findInteractionTarget<SceneKind extends symbol, Traits extends object>(
  manager: InteractionManager<SceneKind, Traits>,
  x: number,
  y: number,
  pointerId: number,
): SceneNode<SceneKind, Traits> | null {
  if (!manager.enabled) return null;
  const captured = manager.pointerCaptures.get(pointerId);
  if (captured !== undefined) return captured;
  return findGraphHitTarget(manager.root, x, y) as SceneNode<SceneKind, Traits> | null;
}

function getInteractionPointerState<SceneKind extends symbol, Traits extends object>(
  manager: InteractionManager<SceneKind, Traits>,
  pointerId: number,
): InteractionPointerState<SceneKind, Traits> {
  let state = manager.pointerStates.get(pointerId);
  if (state === undefined) {
    state = {
      lastClickTarget: null,
      lastClickTime: -Infinity,
      pointerDownTarget: null,
      pointerOverTarget: null,
    };
    manager.pointerStates.set(pointerId, state);
  }
  return state;
}

function getInteractionChain<SceneKind extends symbol, Traits extends object>(
  target: SceneNode<SceneKind, Traits>,
  root: SceneNode<SceneKind, Traits>,
): SceneNode<SceneKind, Traits>[] {
  const out: SceneNode<SceneKind, Traits>[] = [];
  let current: SceneNode<SceneKind, Traits> | null = target;
  while (current !== null) {
    out.push(current);
    if (current === root) break;
    current = getSceneParent(current) as SceneNode<SceneKind, Traits> | null;
  }
  return out;
}

function getInteractionSignal<SceneKind extends symbol, Traits extends object, Name extends InteractionSignalName>(
  source: Readonly<SceneNode<SceneKind, Traits>>,
  name: Name,
): InteractionSignals[Name] | null {
  const signals = getSceneNodeRuntime(source).interactionSignals;
  return signals !== null ? signals[name] : null;
}

function getTrackedInteractionSignalSlot<
  SceneKind extends symbol,
  Traits extends object,
  Name extends InteractionSignalName,
>(
  manager: InteractionManager<SceneKind, Traits>,
  target: SceneNode<SceneKind, Traits>,
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

function hasInteractionSignalSubscriber<SceneKind extends symbol, Traits extends object>(
  manager: InteractionManager<SceneKind, Traits>,
  name: InteractionSignalName,
): boolean {
  if ((manager.signalSubscriberCounts.get(name) ?? 0) > 0) return true;
  if (manager.trackedSubscribersOnly) return false;
  return hasInteractionSignalSubscriberInGraph(manager.root, name);
}

function hasInteractionSignalSubscriberInGraph<SceneKind extends symbol, Traits extends object>(
  source: Readonly<SceneNode<SceneKind, Traits>>,
  name: InteractionSignalName,
): boolean {
  const signal = getInteractionSignal(source, name);
  if (signal?.data !== null && signal !== null) return true;

  const children = getSceneNodeRuntime(source).children;
  if (children !== null) {
    for (const child of children) {
      if (hasInteractionSignalSubscriberInGraph(child as SceneNode<SceneKind, Traits>, name)) return true;
    }
  }

  return false;
}

function incrementInteractionSignalSubscriberCount<SceneKind extends symbol, Traits extends object>(
  manager: InteractionManager<SceneKind, Traits>,
  name: InteractionSignalName,
): void {
  manager.signalSubscriberCounts.set(name, (manager.signalSubscriberCounts.get(name) ?? 0) + 1);
}

function isInteractionSignalCancelled<SceneKind extends symbol, Traits extends object>(
  source: Readonly<SceneNode<SceneKind, Traits>>,
  name: InteractionSignalName,
): boolean {
  return getInteractionSignal(source, name)?.data?.cancelled === true;
}

function isPointerSignalNeeded<SceneKind extends symbol, Traits extends object>(
  manager: InteractionManager<SceneKind, Traits>,
  names: readonly InteractionSignalName[],
): boolean {
  if (!manager.enabled) return false;
  for (const name of names) {
    if (hasInteractionSignalSubscriber(manager, name)) return true;
  }
  return false;
}

function removeTrackedInteractionSignalSlot<
  SceneKind extends symbol,
  Traits extends object,
  Name extends InteractionSignalName,
>(
  manager: InteractionManager<SceneKind, Traits>,
  target: SceneNode<SceneKind, Traits>,
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

function setKeyboardData(key: string, keyCode: number, modifiers: Readonly<Partial<KeyboardData>> | undefined): void {
  _keyboardData.altKey = modifiers?.altKey ?? false;
  _keyboardData.ctrlKey = modifiers?.ctrlKey ?? false;
  _keyboardData.key = key;
  _keyboardData.keyCode = keyCode;
  _keyboardData.metaKey = modifiers?.metaKey ?? false;
  _keyboardData.shiftKey = modifiers?.shiftKey ?? false;
}

function setInteractionSignalCurrentTarget<Name extends InteractionSignalName>(
  data: InteractionSignalPayload<Name>,
  target: SceneNode<symbol, object>,
  currentTarget: SceneNode<symbol, object>,
): void {
  if ('currentTarget' in data) {
    const pointerData = data as PointerData;
    pointerData.target = target;
    pointerData.currentTarget = currentTarget;
    setPointerDataLocalPosition(pointerData, currentTarget);
  }
}

function setPointerData(
  target: SceneNode<symbol, object> | null,
  currentTarget: SceneNode<symbol, object> | null,
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

function setTrackedInteractionSignalSlot<
  SceneKind extends symbol,
  Traits extends object,
  Name extends InteractionSignalName,
>(
  manager: InteractionManager<SceneKind, Traits>,
  target: SceneNode<SceneKind, Traits>,
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

function setPointerDataLocalPosition(data: PointerData, currentTarget: SceneNode<symbol, object>): void {
  if (!isGraphTransform2DNode(currentTarget)) {
    data.localX = data.worldX;
    data.localY = data.worldY;
    return;
  }
  inverseMatrixTransformPointXY(_localPoint, getWorldTransformMatrix(currentTarget), data.worldX, data.worldY);
  data.localX = _localPoint.x;
  data.localY = _localPoint.y;
}

function isGraphTransform2DNode(source: Readonly<SceneNode<symbol, object>>): source is GraphTransform2DNode {
  const runtime = getSceneNodeRuntime(source) as SceneNodeRuntime & { worldTransform2D?: unknown };
  return 'worldTransform2D' in runtime;
}

type InteractionSignalName = keyof InteractionSignals;
type KeyboardSignalName = 'onKeyDown' | 'onKeyUp';
type PointerSignalName = Exclude<InteractionSignalName, KeyboardSignalName>;

type InteractionSignalPayload<Name extends InteractionSignalName> = Name extends KeyboardSignalName
  ? Readonly<KeyboardData>
  : Readonly<PointerData>;
type InteractionSignalSlot<Name extends InteractionSignalName> = (value: InteractionSignalPayload<Name>) => void;
type AnyInteractionSignalSlot = (value: InteractionSignalPayload<InteractionSignalName>) => void;

const cancelSignalNames = ['onPointerCancel', 'onPointerOut', 'onPointerRollOut'] as const;
const downSignalNames = ['onClick', 'onDoubleClick', 'onPointerCancel', 'onPointerDown', 'onReleaseOutside'] as const;
const moveSignalNames = [
  'onPointerMove',
  'onPointerOut',
  'onPointerOver',
  'onPointerRollOut',
  'onPointerRollOver',
] as const;
const upSignalNames = ['onClick', 'onDoubleClick', 'onPointerUp', 'onReleaseOutside'] as const;

const _keyboardData: KeyboardData = {
  altKey: false,
  ctrlKey: false,
  key: '',
  keyCode: 0,
  metaKey: false,
  shiftKey: false,
};
const _localPoint = { x: 0, y: 0 };
const _pointerData: PointerData = {
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
