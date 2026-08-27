import { getNodeHeight, getNodeWidth } from '@flighthq/node/contract';
import { createSignal, emitSignal } from '@flighthq/signals/contract';
import type {
  Node2D,
  PointerEventData,
  ScrollBarController,
  ScrollViewController,
  ScrollViewControllerOptions,
  ScrollViewControllerSignals,
} from '@flighthq/types/contract';

import {
  clampGuiValue,
  connectGuiInteraction,
  connectGuiSignal,
  createGuiController,
  createGuiControllerRuntime,
  disposeGuiController,
  getGuiControllerRuntime,
  setGuiVisualProperty,
} from './guiController';
import { getScrollBarControllerSignals, setScrollBarControllerValue } from './scrollBarController';

interface ScrollViewControllerFields {
  baseContentX: number;
  baseContentY: number;
  content: Node2D | null;
  dragPointer: number;
  dragStartWorldX: number;
  dragStartWorldY: number;
  dragStartX: number;
  dragStartY: number;
  horizontalScrollBar: ScrollBarController | null;
  mouseWheelEnabled: boolean;
  signals: ScrollViewControllerSignals;
  verticalScrollBar: ScrollBarController | null;
  viewport: Node2D | null;
  x: number;
  y: number;
}

export function createScrollViewController(options: Readonly<ScrollViewControllerOptions>): ScrollViewController {
  const runtime = createGuiControllerRuntime<ScrollViewControllerFields>(
    {
      baseContentX: options.content.x,
      baseContentY: options.content.y,
      content: options.content,
      dragPointer: -1,
      dragStartWorldX: 0,
      dragStartWorldY: 0,
      dragStartX: 0,
      dragStartY: 0,
      horizontalScrollBar: options.horizontalScrollBar ?? null,
      mouseWheelEnabled: options.mouseWheelEnabled ?? true,
      signals: { onScroll: createSignal() },
      verticalScrollBar: options.verticalScrollBar ?? null,
      viewport: options.viewport,
      x: 0,
      y: 0,
    },
    options.transition,
  );
  const controller = createGuiController<ScrollViewController, typeof runtime>(runtime);
  connectGuiInteraction(runtime, options.viewport, 'onPointerDown', (data: Readonly<PointerEventData>) => {
    runtime.dragPointer = data.pointerId;
    runtime.dragStartWorldX = data.worldX;
    runtime.dragStartWorldY = data.worldY;
    runtime.dragStartX = runtime.x;
    runtime.dragStartY = runtime.y;
  });
  connectGuiInteraction(runtime, options.viewport, 'onPointerMove', (data: Readonly<PointerEventData>) => {
    if (data.pointerId !== runtime.dragPointer) return;
    setScrollViewControllerPosition(
      controller,
      runtime.dragStartX - (data.worldX - runtime.dragStartWorldX),
      runtime.dragStartY - (data.worldY - runtime.dragStartWorldY),
    );
  });
  const endDrag = (data: Readonly<PointerEventData>) => {
    if (data.pointerId === runtime.dragPointer) runtime.dragPointer = -1;
  };
  connectGuiInteraction(runtime, options.viewport, 'onPointerUp', endDrag);
  connectGuiInteraction(runtime, options.viewport, 'onPointerCancel', endDrag);
  connectGuiInteraction(runtime, options.viewport, 'onReleaseOutside', endDrag);
  connectGuiInteraction(runtime, options.viewport, 'onWheel', (data: Readonly<PointerEventData>) => {
    if (runtime.mouseWheelEnabled)
      setScrollViewControllerPosition(controller, runtime.x + data.deltaX, runtime.y + data.deltaY);
  });
  if (runtime.horizontalScrollBar !== null) {
    connectGuiSignal(runtime, getScrollBarControllerSignals(runtime.horizontalScrollBar).onChange, (value) => {
      setScrollViewControllerPosition(controller, value, runtime.y);
    });
  }
  if (runtime.verticalScrollBar !== null) {
    connectGuiSignal(runtime, getScrollBarControllerSignals(runtime.verticalScrollBar).onChange, (value) => {
      setScrollViewControllerPosition(controller, runtime.x, value);
    });
  }
  updateScrollViewControllerVisual(runtime);
  return controller;
}

export function disposeScrollViewController(controller: ScrollViewController): void {
  const runtime = getGuiControllerRuntime<ScrollViewControllerFields>(controller);
  disposeGuiController(controller, () => {
    runtime.content = null;
    runtime.horizontalScrollBar = null;
    runtime.verticalScrollBar = null;
    runtime.viewport = null;
  });
}

export function getScrollViewControllerSignals(
  controller: ScrollViewController,
): Readonly<ScrollViewControllerSignals> {
  return getGuiControllerRuntime<ScrollViewControllerFields>(controller).signals;
}

export function getScrollViewControllerX(controller: ScrollViewController): number {
  return getGuiControllerRuntime<ScrollViewControllerFields>(controller).x;
}

export function getScrollViewControllerY(controller: ScrollViewController): number {
  return getGuiControllerRuntime<ScrollViewControllerFields>(controller).y;
}

export function setScrollViewControllerPosition(controller: ScrollViewController, x: number, y: number): void {
  const runtime = getGuiControllerRuntime<ScrollViewControllerFields>(controller);
  if (runtime.content === null || runtime.viewport === null || runtime.disposed) return;
  const nextX = clampGuiValue(x, 0, Math.max(0, getNodeWidth(runtime.content) - getNodeWidth(runtime.viewport)));
  const nextY = clampGuiValue(y, 0, Math.max(0, getNodeHeight(runtime.content) - getNodeHeight(runtime.viewport)));
  if (runtime.x === nextX && runtime.y === nextY) return;
  runtime.x = nextX;
  runtime.y = nextY;
  updateScrollViewControllerVisual(runtime);
  emitSignal(runtime.signals.onScroll, nextX, nextY);
}

function updateScrollViewControllerVisual(
  runtime: ReturnType<typeof getGuiControllerRuntime<ScrollViewControllerFields>>,
): void {
  setGuiVisualProperty(runtime, runtime.content, 'x', runtime.baseContentX - runtime.x);
  setGuiVisualProperty(runtime, runtime.content, 'y', runtime.baseContentY - runtime.y);
  if (runtime.horizontalScrollBar !== null) setScrollBarControllerValue(runtime.horizontalScrollBar, runtime.x);
  if (runtime.verticalScrollBar !== null) setScrollBarControllerValue(runtime.verticalScrollBar, runtime.y);
}
