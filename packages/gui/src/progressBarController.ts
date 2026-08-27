import type {
  GuiOrientation,
  Node2D,
  ProgressBarController,
  ProgressBarControllerOptions,
} from '@flighthq/types/contract';

import {
  clampGuiValue,
  createGuiController,
  createGuiControllerRuntime,
  disposeGuiController,
  getGuiControllerRuntime,
  setGuiScale,
} from './guiController';

interface ProgressBarControllerFields {
  baseScale: number;
  fill: Node2D | null;
  maximum: number;
  minimum: number;
  orientation: GuiOrientation;
  track: Node2D | null;
  value: number;
}

export function createProgressBarController(options: Readonly<ProgressBarControllerOptions>): ProgressBarController {
  const orientation = options.orientation ?? 'horizontal';
  const minimum = options.minimum ?? 0;
  const maximum = Math.max(minimum, options.maximum ?? 100);
  const runtime = createGuiControllerRuntime<ProgressBarControllerFields>(
    {
      baseScale: orientation === 'horizontal' ? options.fill.scaleX : options.fill.scaleY,
      fill: options.fill,
      maximum,
      minimum,
      orientation,
      track: options.track,
      value: clampGuiValue(options.value ?? minimum, minimum, maximum),
    },
    options.transition,
  );
  const controller = createGuiController<ProgressBarController, typeof runtime>(runtime);
  updateProgressBarControllerVisual(runtime);
  return controller;
}

export function disposeProgressBarController(controller: ProgressBarController): void {
  const runtime = getGuiControllerRuntime<ProgressBarControllerFields>(controller);
  disposeGuiController(controller, () => {
    runtime.fill = null;
    runtime.track = null;
  });
}

export function getProgressBarControllerValue(controller: ProgressBarController): number {
  return getGuiControllerRuntime<ProgressBarControllerFields>(controller).value;
}

export function setProgressBarControllerValue(controller: ProgressBarController, value: number): void {
  const runtime = getGuiControllerRuntime<ProgressBarControllerFields>(controller);
  const next = clampGuiValue(value, runtime.minimum, runtime.maximum);
  if (runtime.value === next) return;
  runtime.value = next;
  updateProgressBarControllerVisual(runtime);
}

function updateProgressBarControllerVisual(
  runtime: ReturnType<typeof getGuiControllerRuntime<ProgressBarControllerFields>>,
): void {
  const range = runtime.maximum - runtime.minimum;
  const ratio = range === 0 ? 1 : (runtime.value - runtime.minimum) / range;
  setGuiScale(runtime, runtime.fill, runtime.orientation, runtime.baseScale * ratio);
}
