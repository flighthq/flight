import { createSignal, emitSignal } from '@flighthq/signals/contract';
import type {
  ButtonController,
  ButtonControllerOptions,
  ButtonControllerSignals,
  Node2D,
} from '@flighthq/types/contract';

import {
  configureGuiHitArea,
  connectGuiInteraction,
  createGuiController,
  createGuiControllerRuntime,
  disposeGuiController,
  getGuiControllerRuntime,
  setGuiVisible,
} from './guiController';

interface ButtonControllerFields {
  disabled: boolean;
  downState: Node2D | null;
  over: boolean;
  overState: Node2D | null;
  pressed: boolean;
  signals: ButtonControllerSignals;
  upState: Node2D | null;
}

export function createButtonController(options: Readonly<ButtonControllerOptions>): ButtonController {
  const runtime = createGuiControllerRuntime<ButtonControllerFields>(
    {
      disabled: options.disabled ?? false,
      downState: options.downState ?? null,
      over: false,
      overState: options.overState ?? null,
      pressed: false,
      signals: {
        onClick: createSignal(),
        onPress: createSignal(),
        onRelease: createSignal(),
      },
      upState: options.upState,
    },
    options.transition,
  );
  const controller = createGuiController<ButtonController, typeof runtime>(runtime);
  const target = options.upState;
  if (options.hitArea !== undefined) configureGuiHitArea(runtime, target, options.hitArea);
  connectGuiInteraction(runtime, target, 'onPointerOver', () => {
    runtime.over = true;
    updateButtonControllerVisuals(runtime);
  });
  connectGuiInteraction(runtime, target, 'onPointerOut', () => {
    runtime.over = false;
    updateButtonControllerVisuals(runtime);
  });
  connectGuiInteraction(runtime, target, 'onPointerDown', () => {
    if (runtime.disabled) return;
    runtime.pressed = true;
    updateButtonControllerVisuals(runtime);
    emitSignal(runtime.signals.onPress);
  });
  const release = () => {
    if (!runtime.pressed) return;
    runtime.pressed = false;
    updateButtonControllerVisuals(runtime);
    emitSignal(runtime.signals.onRelease);
  };
  connectGuiInteraction(runtime, target, 'onPointerUp', release);
  connectGuiInteraction(runtime, target, 'onPointerCancel', release);
  connectGuiInteraction(runtime, target, 'onReleaseOutside', release);
  connectGuiInteraction(runtime, target, 'onClick', () => {
    if (!runtime.disabled) emitSignal(runtime.signals.onClick);
  });
  updateButtonControllerVisuals(runtime);
  return controller;
}

export function disposeButtonController(controller: ButtonController): void {
  const runtime = getGuiControllerRuntime<ButtonControllerFields>(controller);
  disposeGuiController(controller, () => {
    runtime.downState = null;
    runtime.overState = null;
    runtime.upState = null;
  });
}

export function getButtonControllerSignals(controller: ButtonController): Readonly<ButtonControllerSignals> {
  return getGuiControllerRuntime<ButtonControllerFields>(controller).signals;
}

export function isButtonControllerDisabled(controller: ButtonController): boolean {
  return getGuiControllerRuntime<ButtonControllerFields>(controller).disabled;
}

export function setButtonControllerDisabled(controller: ButtonController, disabled: boolean): void {
  const runtime = getGuiControllerRuntime<ButtonControllerFields>(controller);
  if (runtime.disabled === disabled) return;
  runtime.disabled = disabled;
  if (disabled) runtime.pressed = false;
  updateButtonControllerVisuals(runtime);
}

function updateButtonControllerVisuals(
  runtime: ReturnType<typeof getGuiControllerRuntime<ButtonControllerFields>>,
): void {
  const down = !runtime.disabled && runtime.pressed && runtime.downState !== null;
  const over = !runtime.disabled && !down && runtime.over && runtime.overState !== null;
  setGuiVisible(runtime, runtime.upState, !down && !over);
  setGuiVisible(runtime, runtime.overState, over);
  setGuiVisible(runtime, runtime.downState, down);
}
