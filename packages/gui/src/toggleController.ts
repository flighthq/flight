import { createSignal, emitSignal } from '@flighthq/signals/contract';
import type {
  Node2D,
  ToggleController,
  ToggleControllerOptions,
  ToggleControllerSignals,
} from '@flighthq/types/contract';

import {
  connectGuiInteraction,
  createGuiController,
  createGuiControllerRuntime,
  disposeGuiController,
  getGuiControllerRuntime,
  setGuiVisible,
} from './guiController';

interface ToggleControllerFields {
  checked: boolean;
  checkedState: Node2D | null;
  label: Node2D | null;
  over: boolean;
  overState: Node2D | null;
  signals: ToggleControllerSignals;
  uncheckedState: Node2D | null;
}

export function createToggleController(options: Readonly<ToggleControllerOptions>): ToggleController {
  const runtime = createGuiControllerRuntime<ToggleControllerFields>(
    {
      checked: options.checked ?? false,
      checkedState: options.checkedState,
      label: options.label ?? null,
      over: false,
      overState: options.overState ?? null,
      signals: { onChange: createSignal() },
      uncheckedState: options.uncheckedState,
    },
    options.transition,
  );
  const controller = createGuiController<ToggleController, typeof runtime>(runtime);
  const targets = [options.uncheckedState, options.checkedState, options.label].filter(
    (target, index, all): target is Node2D => target !== undefined && all.indexOf(target) === index,
  );
  for (const target of targets) {
    connectGuiInteraction(runtime, target, 'onClick', () => setToggleControllerChecked(controller, !runtime.checked));
    connectGuiInteraction(runtime, target, 'onPointerOver', () => {
      runtime.over = true;
      updateToggleControllerVisuals(runtime);
    });
    connectGuiInteraction(runtime, target, 'onPointerOut', () => {
      runtime.over = false;
      updateToggleControllerVisuals(runtime);
    });
  }
  updateToggleControllerVisuals(runtime);
  return controller;
}

export function disposeToggleController(controller: ToggleController): void {
  const runtime = getGuiControllerRuntime<ToggleControllerFields>(controller);
  disposeGuiController(controller, () => {
    runtime.checkedState = null;
    runtime.label = null;
    runtime.overState = null;
    runtime.uncheckedState = null;
  });
}

export function getToggleControllerSignals(controller: ToggleController): Readonly<ToggleControllerSignals> {
  return getGuiControllerRuntime<ToggleControllerFields>(controller).signals;
}

export function isToggleControllerChecked(controller: ToggleController): boolean {
  return getGuiControllerRuntime<ToggleControllerFields>(controller).checked;
}

export function setToggleControllerChecked(controller: ToggleController, checked: boolean): void {
  const runtime = getGuiControllerRuntime<ToggleControllerFields>(controller);
  if (runtime.checked === checked || runtime.disposed) return;
  runtime.checked = checked;
  updateToggleControllerVisuals(runtime);
  emitSignal(runtime.signals.onChange, checked);
}

function updateToggleControllerVisuals(
  runtime: ReturnType<typeof getGuiControllerRuntime<ToggleControllerFields>>,
): void {
  setGuiVisible(runtime, runtime.uncheckedState, !runtime.checked);
  setGuiVisible(runtime, runtime.checkedState, runtime.checked);
  setGuiVisible(runtime, runtime.overState, runtime.over);
}
