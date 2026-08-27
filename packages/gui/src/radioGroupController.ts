import { createSignal, emitSignal } from '@flighthq/signals/contract';
import type {
  RadioGroupController,
  RadioGroupControllerOptions,
  RadioGroupControllerSignals,
  ToggleController,
} from '@flighthq/types/contract';

import {
  connectGuiSignal,
  createGuiController,
  createGuiControllerRuntime,
  disposeGuiController,
  getGuiControllerRuntime,
} from './guiController';
import { getToggleControllerSignals, setToggleControllerChecked } from './toggleController';

interface RadioGroupControllerFields {
  selectedIndex: number;
  signals: RadioGroupControllerSignals;
  toggles: ToggleController[];
  updating: boolean;
}

export function createRadioGroupController(options: Readonly<RadioGroupControllerOptions>): RadioGroupController {
  const runtime = createGuiControllerRuntime<RadioGroupControllerFields>({
    selectedIndex: -1,
    signals: { onChange: createSignal() },
    toggles: options.toggles.slice(),
    updating: false,
  });
  const controller = createGuiController<RadioGroupController, typeof runtime>(runtime);
  runtime.toggles.forEach((toggle, index) => {
    connectGuiSignal(runtime, getToggleControllerSignals(toggle).onChange, (checked) => {
      if (runtime.updating) return;
      if (checked) setRadioGroupControllerSelectedIndex(controller, index);
      else if (runtime.selectedIndex === index) setRadioGroupControllerSelectedIndex(controller, -1);
    });
  });
  setRadioGroupControllerSelectedIndex(controller, options.selectedIndex ?? (runtime.toggles.length === 0 ? -1 : 0));
  return controller;
}

export function disposeRadioGroupController(controller: RadioGroupController): void {
  const runtime = getGuiControllerRuntime<RadioGroupControllerFields>(controller);
  disposeGuiController(controller, () => {
    runtime.toggles.length = 0;
  });
}

export function getRadioGroupControllerSelectedIndex(controller: RadioGroupController): number {
  return getGuiControllerRuntime<RadioGroupControllerFields>(controller).selectedIndex;
}

export function getRadioGroupControllerSignals(
  controller: RadioGroupController,
): Readonly<RadioGroupControllerSignals> {
  return getGuiControllerRuntime<RadioGroupControllerFields>(controller).signals;
}

export function setRadioGroupControllerSelectedIndex(controller: RadioGroupController, index: number): void {
  const runtime = getGuiControllerRuntime<RadioGroupControllerFields>(controller);
  const next = index >= 0 && index < runtime.toggles.length ? index : -1;
  if (runtime.selectedIndex === next) return;
  const changed = runtime.selectedIndex !== next;
  runtime.selectedIndex = next;
  runtime.updating = true;
  runtime.toggles.forEach((toggle, i) => setToggleControllerChecked(toggle, i === next));
  runtime.updating = false;
  if (changed) emitSignal(runtime.signals.onChange, next);
}
