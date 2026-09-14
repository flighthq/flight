import { allocateEntity, finishEntity } from '@flighthq/entity/contract';
import { connectSignal, createSignal, disconnectSignal, emitSignal } from '@flighthq/signals/contract';
import type {
  AttachInputOptions,
  GamepadAxisKind,
  GamepadButtonKind,
  GamepadMappingKind,
  InputGamepadAxisData,
  InputGamepadButtonData,
  InputGamepadConnectData,
  HostInputIngressProvider,
  InputIngressSink,
  InputIngressSource,
  InputKeyboardData,
  InputKeyRepeatOptions,
  InputKeyRepeatTimer,
  InputManager,
  InputPointerData,
  InputSignals,
  InputState,
  MouseWheelMode,
  EntityConstruction,
} from '@flighthq/types/contract';
import {
  GamepadAxisKind as GamepadAxisKindValues,
  GamepadButtonKind as GamepadButtonKindValues,
} from '@flighthq/types/contract';

// Maximum axis and button counts used for the compact gamepad-state encoding in InputState.
// Encoded key: gamepadIndex * MAX_GAMEPAD_AXES + axisIndex (axes) or
//              gamepadIndex * MAX_GAMEPAD_BUTTONS + buttonIndex (buttons).
const MAX_GAMEPAD_AXES = 32;
const MAX_GAMEPAD_BUTTONS = 64;

/**
 * Filters a single gamepad axis value through a simple dead zone.
 * Values within `[-deadZone, deadZone]` are mapped to `0`; values outside
 * are rescaled linearly to `[-1, 1]` so the live range is continuous.
 * `deadZone` must be in `[0, 1)`.
 */
export function applyGamepadAxisDeadZone(value: number, deadZone: number): number {
  if (deadZone <= 0) return value;
  const abs = value < 0 ? -value : value;
  if (abs <= deadZone) return 0;
  const sign = value < 0 ? -1 : 1;
  return sign * ((abs - deadZone) / (1 - deadZone));
}

/**
 * Filters a 2-D stick (left or right) through a **radial** dead zone.
 * The magnitude of `(x, y)` is compared against `deadZone`; if within the
 * dead zone the output is `(0, 0)`, otherwise the input direction is
 * preserved and the magnitude is rescaled linearly to `[0, 1]`.
 *
 * Writes the filtered X and Y into `out.x` and `out.y`.
 * Safe when `out` is the same object as the input (alias-safe).
 *
 * `deadZone` must be in `[0, 1)`.
 */
export function applyGamepadStickDeadZone(out: { x: number; y: number }, x: number, y: number, deadZone: number): void {
  if (deadZone <= 0) {
    out.x = x;
    out.y = y;
    return;
  }
  const mag = Math.sqrt(x * x + y * y);
  if (mag <= deadZone) {
    out.x = 0;
    out.y = 0;
    return;
  }
  const scale = (mag - deadZone) / ((1 - deadZone) * mag);
  out.x = x * scale;
  out.y = y * scale;
}

export function attachGamepadInput(
  manager: InputManager,
  source: InputIngressSource,
  options?: Readonly<AttachInputOptions>,
): void {
  const release = getInputIngressBackend().attachGamepad(source, getInputIngressSink(manager), options);
  setInputBinding(manager, source, kGamepadInput, release);
}

export function attachKeyboardInput(
  manager: InputManager,
  source: InputIngressSource,
  options?: Readonly<AttachInputOptions>,
): void {
  const release = getInputIngressBackend().attachKeyboard(source, getInputIngressSink(manager), options);
  setInputBinding(manager, source, kKeyboardInput, release);
}

export function attachPointerInput(
  manager: InputManager,
  source: InputIngressSource,
  options?: Readonly<AttachInputOptions>,
): void {
  const release = getInputIngressBackend().attachPointer(source, getInputIngressSink(manager), options);
  setInputBinding(manager, source, kPointerInput, release);
}

export function attachRelativePointerInput(
  manager: InputManager,
  source: InputIngressSource,
  options?: Readonly<AttachInputOptions>,
): void {
  const release = getInputIngressBackend().attachRelativePointer(source, getInputIngressSink(manager), options);
  setInputBinding(manager, source, kRelativePointerInput, release);
}

export function attachTextInput(
  manager: InputManager,
  source: InputIngressSource,
  options?: Readonly<AttachInputOptions>,
): void {
  const release = getInputIngressBackend().attachText(source, getInputIngressSink(manager), options);
  setInputBinding(manager, source, kTextInput, release);
}

export function attachWheelInput(
  manager: InputManager,
  source: InputIngressSource,
  options?: Readonly<AttachInputOptions>,
): void {
  const release = getInputIngressBackend().attachWheel(source, getInputIngressSink(manager), options);
  setInputBinding(manager, source, kWheelInput, release);
}

/**
 * Subscribes `state` to all signals on `manager` to maintain a live held-state snapshot.
 * Also tracks per-frame edge sets (`justPressedKeys`, `justReleasedKeys`,
 * `justPressedGamepadButtons`, `justReleasedGamepadButtons`) that accumulate
 * until `endInputStateFrame` is called.
 * Returns a disposer that disconnects the subscriptions.
 */
export function connectInputStateToInputManager(state: InputState, manager: InputManager): () => void {
  // The just* sets record which TRANSITIONS happened during the frame, not which event arrived last.
  // Two consequences, both of which the previous "latest event wins" form got wrong:
  //
  // Only a genuine up→down edge counts as a press. A held key auto-repeats — the DOM re-fires keydown,
  // and native backends re-report held buttons — so without this guard `wasInputKeyPressed` stays true
  // for every frame the key is held, and anything that fires on press (shoot, jump, confirm) autofires.
  //
  // A press and a release in the same frame must both survive. Deleting from the opposite set made a
  // tap that started and ended between two endInputStateFrame calls report as a release with no press,
  // so the input was silently swallowed rather than merely late.
  const onKeyDown = (data: Readonly<InputKeyboardData>) => {
    if (!state.keysDown.has(data.keyCode)) state.justPressedKeys.add(data.keyCode);
    state.keysDown.add(data.keyCode);
  };
  const onKeyUp = (data: Readonly<InputKeyboardData>) => {
    state.keysDown.delete(data.keyCode);
    state.justReleasedKeys.add(data.keyCode);
  };
  const onPointerDown = (data: Readonly<InputPointerData>) => {
    const prev = state.pointerButtonsDown.get(data.pointerId) ?? 0;
    state.pointerButtonsDown.set(data.pointerId, prev | (1 << data.button));
  };
  const onPointerUp = (data: Readonly<InputPointerData>) => {
    const prev = state.pointerButtonsDown.get(data.pointerId) ?? 0;
    const next = prev & ~(1 << data.button);
    if (next === 0) {
      state.pointerButtonsDown.delete(data.pointerId);
    } else {
      state.pointerButtonsDown.set(data.pointerId, next);
    }
  };
  const onPointerCancel = (data: Readonly<InputPointerData>) => {
    state.pointerButtonsDown.delete(data.pointerId);
  };
  // Same transition rules as the keyboard pair above. The Web adapter edge-detects before it emits,
  // but these signals are public and a native backend reporting held buttons each poll is a supported
  // source, so the guard belongs on the state machine rather than in one producer.
  const onGamepadButtonDown = (data: Readonly<InputGamepadButtonData>) => {
    const key = data.gamepad * MAX_GAMEPAD_BUTTONS + data.button;
    if (!state.gamepadButtonsDown.has(key)) state.justPressedGamepadButtons.add(key);
    state.gamepadButtonsDown.add(key);
  };
  const onGamepadButtonUp = (data: Readonly<InputGamepadButtonData>) => {
    const key = data.gamepad * MAX_GAMEPAD_BUTTONS + data.button;
    state.gamepadButtonsDown.delete(key);
    state.justReleasedGamepadButtons.add(key);
  };
  const onGamepadAxisMove = (data: Readonly<InputGamepadAxisData>) => {
    state.axisValues.set(data.gamepad * MAX_GAMEPAD_AXES + data.axis, data.value);
  };
  const onGamepadConnect = (data: Readonly<InputGamepadConnectData>) => {
    // Clear stale state for a freshly-connected pad.
    for (let b = 0; b < MAX_GAMEPAD_BUTTONS; b++) {
      const key = data.gamepad * MAX_GAMEPAD_BUTTONS + b;
      state.gamepadButtonsDown.delete(key);
      state.justPressedGamepadButtons.delete(key);
      state.justReleasedGamepadButtons.delete(key);
    }
    for (let a = 0; a < MAX_GAMEPAD_AXES; a++) {
      state.axisValues.delete(data.gamepad * MAX_GAMEPAD_AXES + a);
    }
  };
  const onGamepadDisconnect = (data: Readonly<InputGamepadConnectData>) => {
    for (let b = 0; b < MAX_GAMEPAD_BUTTONS; b++) {
      const key = data.gamepad * MAX_GAMEPAD_BUTTONS + b;
      state.gamepadButtonsDown.delete(key);
      state.justPressedGamepadButtons.delete(key);
      state.justReleasedGamepadButtons.delete(key);
    }
    for (let a = 0; a < MAX_GAMEPAD_AXES; a++) {
      state.axisValues.delete(data.gamepad * MAX_GAMEPAD_AXES + a);
    }
  };

  connectSignal(manager.onKeyDown, onKeyDown);
  connectSignal(manager.onKeyUp, onKeyUp);
  connectSignal(manager.onPointerDown, onPointerDown);
  connectSignal(manager.onPointerUp, onPointerUp);
  connectSignal(manager.onPointerCancel, onPointerCancel);
  connectSignal(manager.onGamepadButtonDown, onGamepadButtonDown);
  connectSignal(manager.onGamepadButtonUp, onGamepadButtonUp);
  connectSignal(manager.onGamepadAxisMove, onGamepadAxisMove);
  connectSignal(manager.onGamepadConnect, onGamepadConnect);
  connectSignal(manager.onGamepadDisconnect, onGamepadDisconnect);

  return () => {
    disconnectSignal(manager.onKeyDown, onKeyDown);
    disconnectSignal(manager.onKeyUp, onKeyUp);
    disconnectSignal(manager.onPointerDown, onPointerDown);
    disconnectSignal(manager.onPointerUp, onPointerUp);
    disconnectSignal(manager.onPointerCancel, onPointerCancel);
    disconnectSignal(manager.onGamepadButtonDown, onGamepadButtonDown);
    disconnectSignal(manager.onGamepadButtonUp, onGamepadButtonUp);
    disconnectSignal(manager.onGamepadAxisMove, onGamepadAxisMove);
    disconnectSignal(manager.onGamepadConnect, onGamepadConnect);
    disconnectSignal(manager.onGamepadDisconnect, onGamepadDisconnect);
  };
}

export function createInputKeyRepeatTimer(options: Readonly<InputKeyRepeatOptions>): InputKeyRepeatTimer {
  const out = allocateEntity<InputKeyRepeatTimer>();
  initializeInputKeyRepeatTimer(out, options);
  return finishEntity(out);
}

export function createInputManager(): InputManager {
  const out = allocateEntity<InputManager>();
  initializeInputManager(out);
  return finishEntity(out);
}

export function createInputSignals(): InputSignals {
  const out = allocateEntity<InputSignals>();
  initializeInputSignals(out);
  return finishEntity(out);
}

export function createInputState(): InputState {
  const out = allocateEntity<InputState>();
  initializeInputState(out);
  return finishEntity(out);
}

export function detachGamepadInput(manager: InputManager, source: InputIngressSource): void {
  clearInputBinding(manager, source, kGamepadInput);
}

export function detachKeyboardInput(manager: InputManager, source: InputIngressSource): void {
  clearInputBinding(manager, source, kKeyboardInput);
}

export function detachPointerInput(manager: InputManager, source: InputIngressSource): void {
  clearInputBinding(manager, source, kPointerInput);
}

export function detachRelativePointerInput(manager: InputManager, source: InputIngressSource): void {
  clearInputBinding(manager, source, kRelativePointerInput);
}

export function detachTextInput(manager: InputManager, source: InputIngressSource): void {
  clearInputBinding(manager, source, kTextInput);
}

export function detachWheelInput(manager: InputManager, source: InputIngressSource): void {
  clearInputBinding(manager, source, kWheelInput);
}

/**
 * Rolls the per-frame edge sets on `state`, clearing `justPressedKeys`,
 * `justReleasedKeys`, `justPressedGamepadButtons`, and
 * `justReleasedGamepadButtons`. Call this once at the end of each logical
 * frame (or input-poll cycle) to prepare the edge sets for the next frame.
 */
export function endInputStateFrame(state: InputState): void {
  state.justPressedKeys.clear();
  state.justReleasedKeys.clear();
  state.justPressedGamepadButtons.clear();
  state.justReleasedGamepadButtons.clear();
}

/**
 * Returns the semantic name string (a `GamepadAxisKind`) for `index` in the
 * standard gamepad mapping, or `null` if `mapping` is not `'standard'` or
 * `index` is out of the standard range.
 */
export function getGamepadAxisName(mapping: GamepadMappingKind, index: number): GamepadAxisKind | null {
  if (mapping !== 'standard') return null;
  return _standardAxisNames[index] ?? null;
}

/**
 * Returns the semantic name string (a `GamepadButtonKind`) for `index` in the
 * standard gamepad mapping, or `null` if `mapping` is not `'standard'` or
 * `index` is out of the standard range.
 */
export function getGamepadButtonName(mapping: GamepadMappingKind, index: number): GamepadButtonKind | null {
  if (mapping !== 'standard') return null;
  return _standardButtonNames[index] ?? null;
}

/**
 * Returns the current value of a gamepad axis from `state`, or `0` if not recorded.
 * `gamepad` is the gamepad index; `axis` is the axis index.
 */
export function getInputGamepadAxis(state: Readonly<InputState>, gamepad: number, axis: number): number {
  return state.axisValues.get(gamepad * MAX_GAMEPAD_AXES + axis) ?? 0;
}

export function getInputIngressBackend(): HostInputIngressProvider {
  return _customInputIngressBackend ?? _hostInputIngressBackend ?? _inputIngressSentinel;
}

export function getMouseWheelModeFromDomWheelEvent(event: Readonly<WheelEvent>): MouseWheelMode {
  if (event.deltaMode === WheelEvent.DOM_DELTA_PIXEL) return 'pixels';
  if (event.deltaMode === WheelEvent.DOM_DELTA_LINE) return 'lines';
  if (event.deltaMode === WheelEvent.DOM_DELTA_PAGE) return 'pages';
  return 'unknown';
}

/**
 * Creates a key-repeat timer for non-DOM sources (gamepad d-pad buttons,
 * virtual on-screen keys, native backends) that do not generate their own
 * auto-repeat events.
 *
 * Call `start(callback)` when a "key" is pressed. The `callback` is invoked
 * immediately on press, then again after `options.delay` ms, then every
 * `options.interval` ms until `stop()` is called.
 *
 * Returns a handle with `start(callback)` and `stop()` methods.
 * The handle may be reused across multiple press/release cycles.
 *
 * ```ts
 * const timer = createInputKeyRepeatTimer({ delay: 500, interval: 33 });
 * // on press:
 * timer.start(() => emitSignal(manager.onKeyDown, dpadData));
 * // on release:
 * timer.stop();
 * ```
 */
export function initializeInputKeyRepeatTimer(
  out: EntityConstruction<InputKeyRepeatTimer>,
  options: Readonly<InputKeyRepeatOptions>,
): void {
  let delayId = 0;
  let intervalId = 0;
  const stop = () => {
    clearTimeout(delayId);
    clearInterval(intervalId);
    delayId = 0;
    intervalId = 0;
  };
  const start = (callback: () => void) => {
    stop();
    callback();
    delayId = setTimeout(() => {
      callback();
      intervalId = setInterval(callback, options.interval) as unknown as number;
    }, options.delay) as unknown as number;
  };
  out.start = start;
  out.stop = stop;
}

export function initializeInputManager(out: EntityConstruction<InputManager>): void {
  const signals = createInputSignals();
  out.enabled = true;
  out.onGamepadAxisMove = signals.onGamepadAxisMove;
  out.onGamepadButtonDown = signals.onGamepadButtonDown;
  out.onGamepadButtonUp = signals.onGamepadButtonUp;
  out.onGamepadConnect = signals.onGamepadConnect;
  out.onGamepadDisconnect = signals.onGamepadDisconnect;
  out.onKeyDown = signals.onKeyDown;
  out.onKeyUp = signals.onKeyUp;
  out.onPointerCancel = signals.onPointerCancel;
  out.onPointerDown = signals.onPointerDown;
  out.onPointerMove = signals.onPointerMove;
  out.onPointerMoveRelative = signals.onPointerMoveRelative;
  out.onPointerUp = signals.onPointerUp;
  out.onTextEdit = signals.onTextEdit;
  out.onTextInput = signals.onTextInput;
  out.onWheel = signals.onWheel;
}

export function initializeInputSignals(out: EntityConstruction<InputSignals>): void {
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

/**
 * Creates a fresh `InputState` with empty held-state maps/sets and empty
 * frame-edge sets. Connect it to an `InputManager` via
 * `connectInputStateToInputManager`, and call `endInputStateFrame` once per
 * logical frame to roll the edge sets.
 */
export function initializeInputState(out: EntityConstruction<InputState>): void {
  out.axisValues = new Map();
  out.gamepadButtonsDown = new Set();
  out.justPressedGamepadButtons = new Set();
  out.justPressedKeys = new Set();
  out.justReleasedGamepadButtons = new Set();
  out.justReleasedKeys = new Set();
  out.keysDown = new Set();
  out.pointerButtonsDown = new Map();
}

// First host wins; a custom backend installed through setInputIngressBackend always takes precedence.
export function installInputIngressHostBackend(backend: HostInputIngressProvider): void {
  if (_hostInputIngressBackend === null) _hostInputIngressBackend = backend;
}

/**
 * Returns `true` if the given gamepad button is currently held.
 * `gamepad` is the gamepad index; `button` is the button index.
 */
export function isInputGamepadButtonDown(state: Readonly<InputState>, gamepad: number, button: number): boolean {
  return state.gamepadButtonsDown.has(gamepad * MAX_GAMEPAD_BUTTONS + button);
}

/**
 * Returns `true` if the given `keyCode` (from `KeyCode`) is currently held.
 */
export function isInputKeyDown(state: Readonly<InputState>, keyCode: number): boolean {
  return state.keysDown.has(keyCode);
}

/**
 * Returns `true` if the given pointer button is currently held for the given `pointerId`.
 * `button` corresponds to `MouseEvent.button` (0 = primary, 1 = middle, 2 = secondary, …).
 */
export function isInputPointerButtonDown(state: Readonly<InputState>, pointerId: number, button: number): boolean {
  return ((state.pointerButtonsDown.get(pointerId) ?? 0) & (1 << button)) !== 0;
}

/**
 * Releases pointer capture for `pointerId` from `element`, allowing pointer
 * events to fire on the element under the pointer again.
 * No-op if `element` does not have capture for this pointer.
 */
export function releaseInputPointerCapture(element: HTMLElement, pointerId: number): void {
  try {
    element.releasePointerCapture(pointerId);
  } catch {
    // Ignore — the pointer may have already been released.
  }
}

export function resetInputIngressBackendForTest(): void {
  _customInputIngressBackend = null;
  _hostInputIngressBackend = null;
}

export function setInputIngressBackend(backend: HostInputIngressProvider | null): void {
  _customInputIngressBackend = backend;
}

/**
 * Explicitly captures all pointer events for `pointerId` to `element`,
 * regardless of where the pointer moves. Useful for drag operations.
 * Automatically released on `pointerup` or `pointercancel` per the spec.
 */
export function setInputPointerCapture(element: HTMLElement, pointerId: number): void {
  element.setPointerCapture(pointerId);
}

/**
 * Returns `true` if the gamepad button at `gamepad`/`button` was pressed
 * this frame (i.e. transitioned from up → down since the last
 * `endInputStateFrame` call).
 */
export function wasInputGamepadButtonPressed(state: Readonly<InputState>, gamepad: number, button: number): boolean {
  return state.justPressedGamepadButtons.has(gamepad * MAX_GAMEPAD_BUTTONS + button);
}

/**
 * Returns `true` if the gamepad button at `gamepad`/`button` was released
 * this frame (i.e. transitioned from down → up since the last
 * `endInputStateFrame` call).
 */
export function wasInputGamepadButtonReleased(state: Readonly<InputState>, gamepad: number, button: number): boolean {
  return state.justReleasedGamepadButtons.has(gamepad * MAX_GAMEPAD_BUTTONS + button);
}

/**
 * Returns `true` if the key with `keyCode` was pressed this frame (i.e.
 * transitioned from up → down since the last `endInputStateFrame` call).
 */
export function wasInputKeyPressed(state: Readonly<InputState>, keyCode: number): boolean {
  return state.justPressedKeys.has(keyCode);
}

/**
 * Returns `true` if the key with `keyCode` was released this frame (i.e.
 * transitioned from down → up since the last `endInputStateFrame` call).
 */
export function wasInputKeyReleased(state: Readonly<InputState>, keyCode: number): boolean {
  return state.justReleasedKeys.has(keyCode);
}

// Standard gamepad mapping: button index → GamepadButtonKind string.
const _standardButtonNames: readonly (GamepadButtonKind | undefined)[] = [
  GamepadButtonKindValues.BUTTON_SOUTH, // 0
  GamepadButtonKindValues.BUTTON_EAST, // 1
  GamepadButtonKindValues.BUTTON_WEST, // 2
  GamepadButtonKindValues.BUTTON_NORTH, // 3
  GamepadButtonKindValues.SHOULDER_LEFT, // 4
  GamepadButtonKindValues.SHOULDER_RIGHT, // 5
  GamepadButtonKindValues.TRIGGER_LEFT, // 6
  GamepadButtonKindValues.TRIGGER_RIGHT, // 7
  GamepadButtonKindValues.SELECT, // 8
  GamepadButtonKindValues.START, // 9
  GamepadButtonKindValues.STICK_LEFT, // 10
  GamepadButtonKindValues.STICK_RIGHT, // 11
  GamepadButtonKindValues.DPAD_UP, // 12
  GamepadButtonKindValues.DPAD_DOWN, // 13
  GamepadButtonKindValues.DPAD_LEFT, // 14
  GamepadButtonKindValues.DPAD_RIGHT, // 15
  GamepadButtonKindValues.HOME, // 16
  GamepadButtonKindValues.TOUCHPAD, // 17
];

// Standard gamepad mapping: axis index → GamepadAxisKind string.
const _standardAxisNames: readonly (GamepadAxisKind | undefined)[] = [
  GamepadAxisKindValues.STICK_LEFT_X, // 0
  GamepadAxisKindValues.STICK_LEFT_Y, // 1
  GamepadAxisKindValues.STICK_RIGHT_X, // 2
  GamepadAxisKindValues.STICK_RIGHT_Y, // 3
];

const _inputIngressSinks = new WeakMap<InputManager, InputIngressSink>();

function getInputIngressSink(manager: InputManager): InputIngressSink {
  let sink = _inputIngressSinks.get(manager);
  if (sink !== undefined) return sink;
  sink = {
    gamepadAxisMove(data): void {
      if (manager.enabled) emitSignal(manager.onGamepadAxisMove, data);
    },
    gamepadButtonDown(data): void {
      if (manager.enabled) emitSignal(manager.onGamepadButtonDown, data);
    },
    gamepadButtonUp(data): void {
      if (manager.enabled) emitSignal(manager.onGamepadButtonUp, data);
    },
    gamepadConnect(data): void {
      if (manager.enabled) emitSignal(manager.onGamepadConnect, data);
    },
    gamepadDisconnect(data): void {
      if (manager.enabled) emitSignal(manager.onGamepadDisconnect, data);
    },
    isEnabled(): boolean {
      return manager.enabled;
    },
    keyDown(data): void {
      if (manager.enabled) emitSignal(manager.onKeyDown, data);
    },
    keyUp(data): void {
      if (manager.enabled) emitSignal(manager.onKeyUp, data);
    },
    pointerCancel(data): void {
      if (manager.enabled) emitSignal(manager.onPointerCancel, data);
    },
    pointerDown(data): void {
      if (manager.enabled) emitSignal(manager.onPointerDown, data);
    },
    pointerMove(data): void {
      if (manager.enabled) emitSignal(manager.onPointerMove, data);
    },
    pointerMoveRelative(data): void {
      if (manager.enabled) emitSignal(manager.onPointerMoveRelative, data);
    },
    pointerUp(data): void {
      if (manager.enabled) emitSignal(manager.onPointerUp, data);
    },
    textEdit(data): void {
      if (manager.enabled) emitSignal(manager.onTextEdit, data);
    },
    textInput(data): void {
      if (manager.enabled) emitSignal(manager.onTextInput, data);
    },
    wheel(data): void {
      if (manager.enabled) emitSignal(manager.onWheel, data);
    },
  };
  _inputIngressSinks.set(manager, sink);
  return sink;
}

function noopInputIngressRelease(): void {}

const _inputIngressSentinel: HostInputIngressProvider = {
  attachGamepad: () => noopInputIngressRelease,
  attachKeyboard: () => noopInputIngressRelease,
  attachPointer: () => noopInputIngressRelease,
  attachRelativePointer: () => noopInputIngressRelease,
  attachText: () => noopInputIngressRelease,
  attachWheel: () => noopInputIngressRelease,
};
let _customInputIngressBackend: HostInputIngressProvider | null = null;
let _hostInputIngressBackend: HostInputIngressProvider | null = null;

// Internal teardown registry: maps a manager to its per-source, per-input-kind origin release.
// Kept off the public InputManager entity so attach/detach track bindings internally and callers hold
// nothing. The exact source identity lets one manager attach the same input kind to multiple
// windows/sources and detach each precisely.
const kGamepadInput = Symbol();
const kKeyboardInput = Symbol();
const kPointerInput = Symbol();
const kRelativePointerInput = Symbol();
const kTextInput = Symbol();
const kWheelInput = Symbol();

const _inputBindings = new WeakMap<InputManager, Map<InputIngressSource, Map<symbol, () => void>>>();

function clearInputBinding(manager: InputManager, source: InputIngressSource, kind: symbol): void {
  const bySource = _inputBindings.get(manager);
  const byKind = bySource?.get(source);
  const release = byKind?.get(kind);
  if (release === undefined) return;
  byKind!.delete(kind);
  if (byKind!.size === 0) bySource!.delete(source);
  release();
}

function setInputBinding(manager: InputManager, source: InputIngressSource, kind: symbol, release: () => void): void {
  let bySource = _inputBindings.get(manager);
  if (bySource === undefined) {
    bySource = new Map();
    _inputBindings.set(manager, bySource);
  }
  let byKind = bySource.get(source);
  if (byKind === undefined) {
    byKind = new Map();
    bySource.set(source, byKind);
  }
  const previous = byKind.get(kind);
  if (previous !== undefined) {
    byKind.delete(kind);
    previous();
  }
  byKind.set(kind, release);
}
