/* eslint-disable @typescript-eslint/no-explicit-any */

import {
  enableInteractionSignals,
  getNodeHitArea,
  isNodeHitTestEnabled,
  setNodeHitArea,
  setNodeHitTestEnabled,
} from '@flighthq/interaction/contract';
import {
  getNodeHeight,
  getNodeWidth,
  invalidateNodeAppearance,
  invalidateNodeLocalTransform,
} from '@flighthq/node/contract';
import { connectSignal, disconnectSignal } from '@flighthq/signals/contract';
import type {
  Entity,
  EntityRuntime,
  GuiOrientation,
  GuiTransitionDescriptor,
  GuiTransitionProperty,
  GuiTransitionValue,
  InteractionSignals,
  Node2D,
  Signal,
} from '@flighthq/types/contract';
import { EntityRuntimeKey } from '@flighthq/types/contract';

interface GuiControllerRuntime extends EntityRuntime {
  cleanups: Array<() => void>;
  disposed: boolean;
  hitStates: Map<Node2D, boolean>;
  transition: Readonly<GuiTransitionDescriptor> | null;
}

export function clampGuiValue(value: number, minimum: number, maximum: number): number {
  if (!Number.isFinite(value)) return minimum;
  if (minimum > maximum) [minimum, maximum] = [maximum, minimum];
  return Math.max(minimum, Math.min(maximum, value));
}

export function configureGuiHitArea(runtime: GuiControllerRuntime, target: Node2D, hitArea: Node2D): void {
  const previous = getNodeHitArea(target);
  setNodeHitArea(target, hitArea);
  runtime.cleanups.push(() => setNodeHitArea(target, previous));
}

export function connectGuiInteraction(
  runtime: GuiControllerRuntime,
  target: Node2D,
  name: keyof InteractionSignals,
  slot: (...args: any[]) => void,
): void {
  if (!runtime.hitStates.has(target)) {
    runtime.hitStates.set(target, isNodeHitTestEnabled(target));
    setNodeHitTestEnabled(target, true);
  }
  const signal = enableInteractionSignals(target)[name] as Signal<(...args: any[]) => void>;
  connectSignal(signal, slot);
  runtime.cleanups.push(() => disconnectSignal(signal, slot));
}

export function connectGuiSignal<T extends (...args: any[]) => void>(
  runtime: GuiControllerRuntime,
  signal: Signal<T>,
  slot: T,
): void {
  connectSignal(signal, slot);
  runtime.cleanups.push(() => disconnectSignal(signal, slot));
}

export function createGuiController<Controller extends Entity, Runtime extends GuiControllerRuntime>(
  runtime: Runtime,
): Controller {
  const controller = { [EntityRuntimeKey]: runtime } as unknown as Controller;
  return controller;
}

export function createGuiControllerRuntime<Runtime extends object>(
  fields: Runtime,
  transition?: Readonly<GuiTransitionDescriptor>,
): Runtime & GuiControllerRuntime {
  return {
    ...fields,
    binding: null,
    cleanups: [],
    disposed: false,
    hitStates: new Map(),
    transition: transition ?? null,
  };
}

export function disposeGuiController(controller: Entity, clear: () => void): void {
  const runtime = getGuiControllerRuntime(controller);
  if (runtime.disposed) return;
  runtime.disposed = true;
  for (let i = runtime.cleanups.length - 1; i >= 0; i--) runtime.cleanups[i]();
  runtime.cleanups.length = 0;
  for (const [target, enabled] of runtime.hitStates) setNodeHitTestEnabled(target, enabled);
  runtime.hitStates.clear();
  clear();
}

export function getGuiControllerRuntime<Runtime extends object = object>(
  controller: Entity,
): Runtime & GuiControllerRuntime {
  return controller[EntityRuntimeKey] as Runtime & GuiControllerRuntime;
}

export function getGuiLength(target: Node2D, orientation: GuiOrientation): number {
  return orientation === 'horizontal' ? getNodeWidth(target) : getNodeHeight(target);
}

export function getGuiPosition(target: Node2D, orientation: GuiOrientation): number {
  return orientation === 'horizontal' ? target.x : target.y;
}

export function setGuiPosition(
  runtime: GuiControllerRuntime,
  target: Node2D | null,
  orientation: GuiOrientation,
  value: number,
): void {
  setGuiVisualProperty(runtime, target, orientation === 'horizontal' ? 'x' : 'y', value);
}

export function setGuiScale(
  runtime: GuiControllerRuntime,
  target: Node2D | null,
  orientation: GuiOrientation,
  value: number,
): void {
  setGuiVisualProperty(runtime, target, orientation === 'horizontal' ? 'scaleX' : 'scaleY', value);
}

export function setGuiVisible(runtime: GuiControllerRuntime, target: Node2D | null, visible: boolean): void {
  setGuiVisualProperty(runtime, target, 'visible', visible);
}

export function setGuiVisualProperty(
  runtime: GuiControllerRuntime,
  target: Node2D | null,
  property: GuiTransitionProperty,
  value: GuiTransitionValue,
): void {
  if (target === null || runtime.disposed) return;
  const from = target[property];
  if (from === value) return;
  const apply = (next: GuiTransitionValue = value) => {
    if (typeof from !== typeof next) return;
    (target as unknown as Record<GuiTransitionProperty, GuiTransitionValue>)[property] = next;
    if (property === 'alpha' || property === 'visible') invalidateNodeAppearance(target);
    else invalidateNodeLocalTransform(target);
  };
  if (runtime.transition === null) apply();
  else runtime.transition.run({ apply, from, property, target, value });
}

export function snapGuiValue(value: number, minimum: number, step: number | null): number {
  if (step === null || !(step > 0) || !Number.isFinite(step)) return value;
  return minimum + Math.round((value - minimum) / step) * step;
}
