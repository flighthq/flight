import { createSignal, emitSignal } from '@flighthq/signals/contract';
import type {
  GuiOrientation,
  Node2D,
  PointerEventData,
  ScrollBarController,
  ScrollBarControllerOptions,
  ScrollBarControllerSignals,
} from '@flighthq/types/contract';

import {
  clampGuiValue,
  connectGuiInteraction,
  createGuiController,
  createGuiControllerRuntime,
  disposeGuiController,
  getGuiControllerRuntime,
  getGuiLength,
  getGuiPosition,
  setGuiPosition,
} from './guiController';

interface ScrollBarControllerFields {
  downButton: Node2D | null;
  dragPointer: number;
  dragStartCoordinate: number;
  dragStartValue: number;
  lineSize: number;
  maximum: number;
  minimum: number;
  orientation: GuiOrientation;
  pageSize: number;
  repeatInterval: number;
  repeatTimer: ReturnType<typeof setInterval> | null;
  signals: ScrollBarControllerSignals;
  thumb: Node2D | null;
  track: Node2D | null;
  upButton: Node2D | null;
  value: number;
}

export function createScrollBarController(options: Readonly<ScrollBarControllerOptions>): ScrollBarController {
  const minimum = options.minimum ?? 0;
  const maximum = Math.max(minimum, options.maximum ?? 100);
  const runtime = createGuiControllerRuntime<ScrollBarControllerFields>(
    {
      downButton: options.downButton ?? null,
      dragPointer: -1,
      dragStartCoordinate: 0,
      dragStartValue: minimum,
      lineSize: Math.abs(options.lineSize ?? 1),
      maximum,
      minimum,
      orientation: options.orientation ?? 'vertical',
      pageSize: Math.abs(options.pageSize ?? 10),
      repeatInterval: Math.max(1, options.repeatInterval ?? 100),
      repeatTimer: null,
      signals: { onChange: createSignal() },
      thumb: options.thumb,
      track: options.track,
      upButton: options.upButton ?? null,
      value: clampGuiValue(options.value ?? minimum, minimum, maximum),
    },
    options.transition,
  );
  const controller = createGuiController<ScrollBarController, typeof runtime>(runtime);
  runtime.cleanups.push(() => stopScrollBarRepeat(runtime));
  connectGuiInteraction(runtime, options.track, 'onPointerDown', (data: Readonly<PointerEventData>) => {
    const coordinate = runtime.orientation === 'horizontal' ? data.localX : data.localY;
    const thumb = runtime.thumb;
    if (thumb === null) return;
    const thumbPosition =
      getGuiPosition(thumb, runtime.orientation) - getGuiPosition(options.track, runtime.orientation);
    const delta =
      coordinate < thumbPosition
        ? -runtime.pageSize
        : coordinate > thumbPosition + getGuiLength(thumb, runtime.orientation)
          ? runtime.pageSize
          : 0;
    if (delta !== 0) setScrollBarControllerValue(controller, runtime.value + delta);
  });
  connectGuiInteraction(runtime, options.thumb, 'onPointerDown', (data: Readonly<PointerEventData>) => {
    runtime.dragPointer = data.pointerId;
    runtime.dragStartCoordinate = runtime.orientation === 'horizontal' ? data.worldX : data.worldY;
    runtime.dragStartValue = runtime.value;
  });
  connectGuiInteraction(runtime, options.thumb, 'onPointerMove', (data: Readonly<PointerEventData>) => {
    if (runtime.dragPointer !== data.pointerId) return;
    const travel = getScrollBarTravel(runtime);
    if (travel <= 0) return;
    const coordinate = runtime.orientation === 'horizontal' ? data.worldX : data.worldY;
    setScrollBarControllerValue(
      controller,
      runtime.dragStartValue +
        ((coordinate - runtime.dragStartCoordinate) / travel) * (runtime.maximum - runtime.minimum),
    );
  });
  const endDrag = (data: Readonly<PointerEventData>) => {
    if (runtime.dragPointer === data.pointerId) runtime.dragPointer = -1;
  };
  connectGuiInteraction(runtime, options.thumb, 'onPointerUp', endDrag);
  connectGuiInteraction(runtime, options.thumb, 'onPointerCancel', endDrag);
  connectGuiInteraction(runtime, options.thumb, 'onReleaseOutside', endDrag);
  if (runtime.upButton !== null) connectScrollBarRepeatButton(runtime, controller, runtime.upButton, -1);
  if (runtime.downButton !== null) connectScrollBarRepeatButton(runtime, controller, runtime.downButton, 1);
  updateScrollBarControllerVisual(runtime);
  return controller;
}

export function disposeScrollBarController(controller: ScrollBarController): void {
  const runtime = getGuiControllerRuntime<ScrollBarControllerFields>(controller);
  disposeGuiController(controller, () => {
    runtime.downButton = null;
    runtime.thumb = null;
    runtime.track = null;
    runtime.upButton = null;
  });
}

export function getScrollBarControllerSignals(controller: ScrollBarController): Readonly<ScrollBarControllerSignals> {
  return getGuiControllerRuntime<ScrollBarControllerFields>(controller).signals;
}

export function getScrollBarControllerValue(controller: ScrollBarController): number {
  return getGuiControllerRuntime<ScrollBarControllerFields>(controller).value;
}

export function setScrollBarControllerValue(controller: ScrollBarController, value: number): void {
  const runtime = getGuiControllerRuntime<ScrollBarControllerFields>(controller);
  const next = clampGuiValue(value, runtime.minimum, runtime.maximum);
  if (runtime.value === next || runtime.disposed) return;
  runtime.value = next;
  updateScrollBarControllerVisual(runtime);
  emitSignal(runtime.signals.onChange, next);
}

function connectScrollBarRepeatButton(
  runtime: ReturnType<typeof getGuiControllerRuntime<ScrollBarControllerFields>>,
  controller: ScrollBarController,
  target: Node2D,
  direction: number,
): void {
  const advance = () => setScrollBarControllerValue(controller, runtime.value + direction * runtime.lineSize);
  connectGuiInteraction(runtime, target, 'onPointerDown', () => {
    stopScrollBarRepeat(runtime);
    advance();
    runtime.repeatTimer = setInterval(advance, runtime.repeatInterval);
  });
  connectGuiInteraction(runtime, target, 'onPointerUp', () => stopScrollBarRepeat(runtime));
  connectGuiInteraction(runtime, target, 'onPointerCancel', () => stopScrollBarRepeat(runtime));
  connectGuiInteraction(runtime, target, 'onPointerOut', () => stopScrollBarRepeat(runtime));
  connectGuiInteraction(runtime, target, 'onReleaseOutside', () => stopScrollBarRepeat(runtime));
}

function getScrollBarTravel(runtime: ReturnType<typeof getGuiControllerRuntime<ScrollBarControllerFields>>): number {
  if (runtime.track === null || runtime.thumb === null) return 0;
  return Math.max(
    0,
    getGuiLength(runtime.track, runtime.orientation) - getGuiLength(runtime.thumb, runtime.orientation),
  );
}

function stopScrollBarRepeat(runtime: ReturnType<typeof getGuiControllerRuntime<ScrollBarControllerFields>>): void {
  if (runtime.repeatTimer === null) return;
  clearInterval(runtime.repeatTimer);
  runtime.repeatTimer = null;
}

function updateScrollBarControllerVisual(
  runtime: ReturnType<typeof getGuiControllerRuntime<ScrollBarControllerFields>>,
): void {
  if (runtime.track === null) return;
  const range = runtime.maximum - runtime.minimum;
  const ratio = range === 0 ? 0 : (runtime.value - runtime.minimum) / range;
  const origin = getGuiPosition(runtime.track, runtime.orientation);
  setGuiPosition(runtime, runtime.thumb, runtime.orientation, origin + ratio * getScrollBarTravel(runtime));
}
