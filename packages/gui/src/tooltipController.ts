import type { Node2D, PointerEventData, TooltipController, TooltipControllerOptions } from '@flighthq/types/contract';

import {
  connectGuiInteraction,
  createGuiController,
  createGuiControllerRuntime,
  disposeGuiController,
  getGuiControllerRuntime,
  setGuiVisible,
  setGuiVisualProperty,
} from './guiController';

interface TooltipControllerFields {
  content: Node2D | null;
  delay: number;
  offsetX: number;
  offsetY: number;
  target: Node2D | null;
  timer: ReturnType<typeof setTimeout> | null;
  worldX: number;
  worldY: number;
}

export function createTooltipController(options: Readonly<TooltipControllerOptions>): TooltipController {
  const runtime = createGuiControllerRuntime<TooltipControllerFields>(
    {
      content: options.content,
      delay: Math.max(0, options.delay ?? 500),
      offsetX: options.offset?.x ?? 0,
      offsetY: options.offset?.y ?? 20,
      target: options.target,
      timer: null,
      worldX: 0,
      worldY: 0,
    },
    options.transition,
  );
  const controller = createGuiController<TooltipController, typeof runtime>(runtime);
  runtime.cleanups.push(() => clearTooltipControllerTimer(runtime));
  connectGuiInteraction(runtime, options.target, 'onPointerOver', (data: Readonly<PointerEventData>) => {
    runtime.worldX = data.worldX;
    runtime.worldY = data.worldY;
    clearTooltipControllerTimer(runtime);
    if (runtime.delay === 0) showTooltipController(controller);
    else runtime.timer = setTimeout(() => showTooltipController(controller), runtime.delay);
  });
  connectGuiInteraction(runtime, options.target, 'onPointerMove', (data: Readonly<PointerEventData>) => {
    runtime.worldX = data.worldX;
    runtime.worldY = data.worldY;
    if (runtime.content?.visible === true) positionTooltipController(runtime);
  });
  connectGuiInteraction(runtime, options.target, 'onPointerOut', () => hideTooltipController(controller));
  setGuiVisible(runtime, options.content, false);
  return controller;
}

export function disposeTooltipController(controller: TooltipController): void {
  const runtime = getGuiControllerRuntime<TooltipControllerFields>(controller);
  disposeGuiController(controller, () => {
    runtime.content = null;
    runtime.target = null;
  });
}

export function hideTooltipController(controller: TooltipController): void {
  const runtime = getGuiControllerRuntime<TooltipControllerFields>(controller);
  clearTooltipControllerTimer(runtime);
  setGuiVisible(runtime, runtime.content, false);
}

export function showTooltipController(controller: TooltipController): void {
  const runtime = getGuiControllerRuntime<TooltipControllerFields>(controller);
  clearTooltipControllerTimer(runtime);
  positionTooltipController(runtime);
  setGuiVisible(runtime, runtime.content, true);
}

function clearTooltipControllerTimer(
  runtime: ReturnType<typeof getGuiControllerRuntime<TooltipControllerFields>>,
): void {
  if (runtime.timer === null) return;
  clearTimeout(runtime.timer);
  runtime.timer = null;
}

function positionTooltipController(runtime: ReturnType<typeof getGuiControllerRuntime<TooltipControllerFields>>): void {
  setGuiVisualProperty(runtime, runtime.content, 'x', runtime.worldX + runtime.offsetX);
  setGuiVisualProperty(runtime, runtime.content, 'y', runtime.worldY + runtime.offsetY);
}
