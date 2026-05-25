import { getGraphNodeRuntime, getParent } from '@flighthq/scenegraph-core';
import { createSignal, emitSignal } from '@flighthq/signals';
import type {
  DisplayObject,
  DisplayObjectInteractionSignals,
  DisplayObjectRuntime,
  PointerData,
} from '@flighthq/types';

import { findHitTarget } from './hitTests';

const _pointerData: PointerData = { button: 0, x: 0, y: 0 };

export function createDisplayObjectInteractionSignals(): DisplayObjectInteractionSignals {
  return {
    onPointerDown: createSignal(),
  };
}

export function getDisplayObjectInteractionSignals(source: DisplayObject): DisplayObjectInteractionSignals {
  const runtime = getGraphNodeRuntime(source) as DisplayObjectRuntime;
  return (runtime.interactionSignals ??= createDisplayObjectInteractionSignals());
}

export function dispatchPointerDown(root: DisplayObject, x: number, y: number, button: number = 0): void {
  const target = findHitTarget(root, x, y) as DisplayObject | null;
  if (target === null) return;

  _pointerData.x = x;
  _pointerData.y = y;
  _pointerData.button = button;

  let current: DisplayObject | null = target;
  while (current !== null) {
    const runtime = getGraphNodeRuntime(current) as DisplayObjectRuntime;
    const signals = runtime.interactionSignals;
    if (signals !== null) {
      emitSignal(signals.onPointerDown, _pointerData);
      if (signals.onPointerDown.data?.cancelled) break;
    }
    if (current === root) break;
    current = getParent(current) as DisplayObject | null;
  }
}
