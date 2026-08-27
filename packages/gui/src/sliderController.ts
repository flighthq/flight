import { createSignal, emitSignal } from '@flighthq/signals/contract';
import type {
  GuiOrientation,
  KeyboardEventData,
  Node2D,
  PointerEventData,
  SliderController,
  SliderControllerOptions,
  SliderControllerSignals,
} from '@flighthq/types/contract';

import {
  clampGuiValue,
  connectGuiInteraction,
  createGuiController,
  createGuiControllerRuntime,
  disposeGuiController,
  getGuiControllerRuntime,
  getGuiLength,
  setGuiPosition,
  snapGuiValue,
} from './guiController';

interface SliderControllerFields {
  dragPointer: number;
  dragStartCoordinate: number;
  dragStartValue: number;
  maximum: number;
  minimum: number;
  orientation: GuiOrientation;
  signals: SliderControllerSignals;
  step: number | null;
  thumb: Node2D | null;
  track: Node2D | null;
  value: number;
}

export function createSliderController(options: Readonly<SliderControllerOptions>): SliderController {
  const minimum = options.minimum ?? 0;
  const maximum = Math.max(minimum, options.maximum ?? 1);
  const runtime = createGuiControllerRuntime<SliderControllerFields>(
    {
      dragPointer: -1,
      dragStartCoordinate: 0,
      dragStartValue: minimum,
      maximum,
      minimum,
      orientation: options.orientation ?? 'horizontal',
      signals: { onChange: createSignal() },
      step: options.step ?? null,
      thumb: options.thumb,
      track: options.track,
      value: clampGuiValue(options.value ?? minimum, minimum, maximum),
    },
    options.transition,
  );
  const controller = createGuiController<SliderController, typeof runtime>(runtime);
  connectGuiInteraction(runtime, options.track, 'onPointerDown', (data: Readonly<PointerEventData>) => {
    setSliderFromTrackCoordinate(controller, runtime.orientation === 'horizontal' ? data.localX : data.localY);
  });
  connectGuiInteraction(runtime, options.thumb, 'onPointerDown', (data: Readonly<PointerEventData>) => {
    runtime.dragPointer = data.pointerId;
    runtime.dragStartCoordinate = runtime.orientation === 'horizontal' ? data.worldX : data.worldY;
    runtime.dragStartValue = runtime.value;
  });
  connectGuiInteraction(runtime, options.thumb, 'onPointerMove', (data: Readonly<PointerEventData>) => {
    if (runtime.dragPointer !== data.pointerId) return;
    const coordinate = runtime.orientation === 'horizontal' ? data.worldX : data.worldY;
    const travel = getSliderTravel(runtime);
    const range = runtime.maximum - runtime.minimum;
    if (travel > 0)
      setSliderControllerValue(
        controller,
        runtime.dragStartValue + ((coordinate - runtime.dragStartCoordinate) / travel) * range,
      );
  });
  const endDrag = (data: Readonly<PointerEventData>) => {
    if (runtime.dragPointer === data.pointerId) runtime.dragPointer = -1;
  };
  connectGuiInteraction(runtime, options.thumb, 'onPointerUp', endDrag);
  connectGuiInteraction(runtime, options.thumb, 'onPointerCancel', endDrag);
  connectGuiInteraction(runtime, options.thumb, 'onReleaseOutside', endDrag);
  const keyDown = (data: Readonly<KeyboardEventData>) => handleSliderKeyDown(controller, data);
  connectGuiInteraction(runtime, options.track, 'onKeyDown', keyDown);
  connectGuiInteraction(runtime, options.thumb, 'onKeyDown', keyDown);
  updateSliderControllerVisual(runtime);
  return controller;
}

export function disposeSliderController(controller: SliderController): void {
  const runtime = getGuiControllerRuntime<SliderControllerFields>(controller);
  disposeGuiController(controller, () => {
    runtime.thumb = null;
    runtime.track = null;
  });
}

export function getSliderControllerSignals(controller: SliderController): Readonly<SliderControllerSignals> {
  return getGuiControllerRuntime<SliderControllerFields>(controller).signals;
}

export function getSliderControllerValue(controller: SliderController): number {
  return getGuiControllerRuntime<SliderControllerFields>(controller).value;
}

export function setSliderControllerValue(controller: SliderController, value: number): void {
  const runtime = getGuiControllerRuntime<SliderControllerFields>(controller);
  const next = clampGuiValue(snapGuiValue(value, runtime.minimum, runtime.step), runtime.minimum, runtime.maximum);
  if (runtime.value === next || runtime.disposed) return;
  runtime.value = next;
  updateSliderControllerVisual(runtime);
  emitSignal(runtime.signals.onChange, next);
}

function getSliderTravel(runtime: ReturnType<typeof getGuiControllerRuntime<SliderControllerFields>>): number {
  if (runtime.track === null || runtime.thumb === null) return 0;
  return Math.max(
    0,
    getGuiLength(runtime.track, runtime.orientation) - getGuiLength(runtime.thumb, runtime.orientation),
  );
}

function handleSliderKeyDown(controller: SliderController, data: Readonly<KeyboardEventData>): void {
  const runtime = getGuiControllerRuntime<SliderControllerFields>(controller);
  const step = runtime.step ?? ((runtime.maximum - runtime.minimum) / 100 || 1);
  if (data.key === 'Home') setSliderControllerValue(controller, runtime.minimum);
  else if (data.key === 'End') setSliderControllerValue(controller, runtime.maximum);
  else if (data.key === 'ArrowLeft' || data.key === 'ArrowDown')
    setSliderControllerValue(controller, runtime.value - step);
  else if (data.key === 'ArrowRight' || data.key === 'ArrowUp')
    setSliderControllerValue(controller, runtime.value + step);
}

function setSliderFromTrackCoordinate(controller: SliderController, coordinate: number): void {
  const runtime = getGuiControllerRuntime<SliderControllerFields>(controller);
  if (runtime.track === null) return;
  const length = getGuiLength(runtime.track, runtime.orientation);
  const ratio = length <= 0 ? 0 : clampGuiValue(coordinate / length, 0, 1);
  setSliderControllerValue(controller, runtime.minimum + ratio * (runtime.maximum - runtime.minimum));
}

function updateSliderControllerVisual(
  runtime: ReturnType<typeof getGuiControllerRuntime<SliderControllerFields>>,
): void {
  if (runtime.track === null) return;
  const range = runtime.maximum - runtime.minimum;
  const ratio = range === 0 ? 0 : (runtime.value - runtime.minimum) / range;
  const origin = runtime.orientation === 'horizontal' ? runtime.track.x : runtime.track.y;
  setGuiPosition(runtime, runtime.thumb, runtime.orientation, origin + ratio * getSliderTravel(runtime));
}
