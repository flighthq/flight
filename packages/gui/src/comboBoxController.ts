import { createSignal, emitSignal } from '@flighthq/signals/contract';
import type {
  ButtonController,
  ComboBoxController,
  ComboBoxControllerOptions,
  ComboBoxControllerSignals,
  ListController,
  Node2D,
} from '@flighthq/types/contract';

import { getButtonControllerSignals } from './buttonController';
import {
  connectGuiSignal,
  createGuiController,
  createGuiControllerRuntime,
  disposeGuiController,
  getGuiControllerRuntime,
} from './guiController';
import { getListControllerSignals, setListControllerVisible } from './listController';

interface ComboBoxControllerFields {
  button: ButtonController | null;
  display: Node2D | null;
  list: ListController | null;
  open: boolean;
  signals: ComboBoxControllerSignals;
}

export function createComboBoxController(options: Readonly<ComboBoxControllerOptions>): ComboBoxController {
  const runtime = createGuiControllerRuntime<ComboBoxControllerFields>(
    {
      button: options.button,
      display: options.display ?? null,
      list: options.list,
      open: options.open ?? false,
      signals: { onChange: createSignal(), onOpenChange: createSignal() },
    },
    options.transition,
  );
  const controller = createGuiController<ComboBoxController, typeof runtime>(runtime);
  connectGuiSignal(runtime, getButtonControllerSignals(options.button).onClick, () => {
    setComboBoxControllerOpen(controller, !runtime.open);
  });
  connectGuiSignal(runtime, getListControllerSignals(options.list).onSelect, (index) => {
    emitSignal(runtime.signals.onChange, index);
    setComboBoxControllerOpen(controller, false);
  });
  setListControllerVisible(options.list, runtime.open);
  return controller;
}

export function disposeComboBoxController(controller: ComboBoxController): void {
  const runtime = getGuiControllerRuntime<ComboBoxControllerFields>(controller);
  disposeGuiController(controller, () => {
    runtime.button = null;
    runtime.display = null;
    runtime.list = null;
  });
}

export function getComboBoxControllerSignals(controller: ComboBoxController): Readonly<ComboBoxControllerSignals> {
  return getGuiControllerRuntime<ComboBoxControllerFields>(controller).signals;
}

export function isComboBoxControllerOpen(controller: ComboBoxController): boolean {
  return getGuiControllerRuntime<ComboBoxControllerFields>(controller).open;
}

export function setComboBoxControllerOpen(controller: ComboBoxController, open: boolean): void {
  const runtime = getGuiControllerRuntime<ComboBoxControllerFields>(controller);
  if (runtime.open === open || runtime.list === null || runtime.disposed) return;
  runtime.open = open;
  setListControllerVisible(runtime.list, open);
  emitSignal(runtime.signals.onOpenChange, open);
}
