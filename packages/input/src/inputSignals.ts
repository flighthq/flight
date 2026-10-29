// Generated from crates/flight-input/src/input_signals.rs by flight-compiler.
// Rust is authoritative; run `npm run generate` after changing it.

import { allocateEntity } from '@flighthq/entity/contract';
import { createSignal } from '@flighthq/signals/contract';

import type { InputManagerRaw, InputSignalsRaw } from './types.ts';
import { inputManagerRegistryStore } from './types.ts';

/**
 * Allocates an input manager with every signal and `enabled` true (TS `createInputManager`).
 */
export function createInputManager(): InputManagerRaw {
  let out: InputManagerRaw = Object.assign(allocateEntity<InputManagerRaw>(), { enabled: false });
  initializeInputManager(out);
  return out;
}

/**
 * Allocates the full event signal group (TS `createInputSignals`).
 */
export function createInputSignals(): InputSignalsRaw {
  let out: InputSignalsRaw = allocateEntity<InputSignalsRaw>();
  initializeInputSignals(out);
  return out;
}

/**
 * Gives a manager under construction its enabled flag and signals (TS `initializeInputManager`).
 */
export function initializeInputManager(out: InputManagerRaw): void {
  const signals = createInputSignals();
  const borrowed = signals!;
  out.enabled = true;
  out.onGamepadAxisMove = borrowed.onGamepadAxisMove;
  out.onGamepadButtonDown = borrowed.onGamepadButtonDown;
  out.onGamepadButtonUp = borrowed.onGamepadButtonUp;
  out.onGamepadConnect = borrowed.onGamepadConnect;
  out.onGamepadDisconnect = borrowed.onGamepadDisconnect;
  out.onKeyDown = borrowed.onKeyDown;
  out.onKeyUp = borrowed.onKeyUp;
  out.onPointerCancel = borrowed.onPointerCancel;
  out.onPointerDown = borrowed.onPointerDown;
  out.onPointerMove = borrowed.onPointerMove;
  out.onPointerMoveRelative = borrowed.onPointerMoveRelative;
  out.onPointerUp = borrowed.onPointerUp;
  out.onTextEdit = borrowed.onTextEdit;
  out.onTextInput = borrowed.onTextInput;
  out.onWheel = borrowed.onWheel;
  inputManagerRegistryStore.set(out, { sink: undefined, bindings: [] });
}

/**
 * Gives a signal group under construction all 15 inert signals (TS `initializeInputSignals`).
 */
export function initializeInputSignals(out: InputSignalsRaw): void {
  out.onGamepadAxisMove = createSignal();
  out.onGamepadButtonDown = createSignal();
  out.onGamepadButtonUp = createSignal();
  out.onGamepadConnect = createSignal();
  out.onGamepadDisconnect = createSignal();
  out.onKeyDown = createSignal();
  out.onKeyUp = createSignal();
  out.onPointerCancel = createSignal();
  out.onPointerDown = createSignal();
  out.onPointerMove = createSignal();
  out.onPointerMoveRelative = createSignal();
  out.onPointerUp = createSignal();
  out.onTextEdit = createSignal();
  out.onTextInput = createSignal();
  out.onWheel = createSignal();
}
