import { connectSignal, createSignal, disconnectSignal, emitSignal } from '@flighthq/signals/contract';
import type {
  AttachInputOptions,
  GamepadAxisKind,
  GamepadButtonKind,
  GamepadMappingKind,
  InputGamepadAxisData,
  InputGamepadButtonData,
  InputGamepadConnectData,
  InputIngressBackend,
  InputIngressSink,
  InputIngressSource,
  InputKeyboardData,
  InputKeyRepeatOptions,
  InputKeyRepeatTimer,
  InputManager,
  InputPointerData,
  InputSignals,
  InputState,
  InputTextData,
  MouseWheelMode,
} from '@flighthq/types/contract';
import {
  GamepadAxisKind as GamepadAxisKindValues,
  GamepadButtonKind as GamepadButtonKindValues,
  KeyCode,
  KeyModifier,
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
  const releaseIngress = getInputIngressBackend().attachGamepad(source, getInputIngressSink(manager), options);

  let rafId = 0;
  const loop = () => {
    pollGamepadInput(manager);
    rafId = requestAnimationFrame(loop);
  };

  rafId = requestAnimationFrame(loop);

  setInputBinding(manager, source, kGamepadInput, () => {
    releaseIngress();
    cancelAnimationFrame(rafId);
  });
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
  // Same transition rules as the keyboard pair above. pollGamepadInput already edge-detects before it
  // emits, so it cannot produce a repeat itself — but these signals are public and a native backend
  // reporting held buttons each poll is a supported source, so the guard belongs on the state machine
  // rather than in one producer.
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
export function createInputKeyRepeatTimer(options: Readonly<InputKeyRepeatOptions>): InputKeyRepeatTimer {
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

  return { start, stop };
}

export function createInputManager(): InputManager {
  return {
    ...createInputSignals(),
    enabled: true,
  };
}

export function createInputSignals(): InputSignals {
  return {
    onGamepadAxisMove: createSignal(),
    onGamepadButtonDown: createSignal(),
    onGamepadButtonUp: createSignal(),
    onGamepadConnect: createSignal(),
    onGamepadDisconnect: createSignal(),
    onKeyDown: createSignal(),
    onKeyUp: createSignal(),
    onPointerCancel: createSignal(),
    onPointerDown: createSignal(),
    onPointerMove: createSignal(),
    onPointerMoveRelative: createSignal(),
    onPointerUp: createSignal(),
    onTextEdit: createSignal(),
    onTextInput: createSignal(),
    onWheel: createSignal(),
  };
}

/**
 * Creates a fresh `InputState` with empty held-state maps/sets and empty
 * frame-edge sets. Connect it to an `InputManager` via
 * `connectInputStateToInputManager`, and call `endInputStateFrame` once per
 * logical frame to roll the edge sets.
 */
export function createInputState(): InputState {
  return {
    axisValues: new Map(),
    gamepadButtonsDown: new Set(),
    justPressedGamepadButtons: new Set(),
    justPressedKeys: new Set(),
    justReleasedGamepadButtons: new Set(),
    justReleasedKeys: new Set(),
    keysDown: new Set(),
    pointerButtonsDown: new Map(),
  };
}

/** Explicit browser adapter for the process-wide input-ingress seam. */
export function createWebInputIngressBackend(): InputIngressBackend {
  return {
    attachGamepad(source, sink): () => void {
      const target = getWebInputEventTarget(source);
      if (target === null) return noopInputIngressRelease;

      const onGamepadConnected = (event: Event) => {
        if (!sink.isEnabled()) return;
        const gamepad = (event as GamepadEvent).gamepad;
        setInputGamepadConnectData(_connectData, gamepad);
        sink.gamepadConnect(
          _connectData,
          gamepad.axes,
          Array.from(gamepad.buttons, (button) => button.pressed),
        );
      };
      const onGamepadDisconnected = (event: Event) => {
        if (!sink.isEnabled()) return;
        setInputGamepadConnectData(_connectData, (event as GamepadEvent).gamepad);
        sink.gamepadDisconnect(_connectData);
      };

      target.addEventListener('gamepadconnected', onGamepadConnected);
      target.addEventListener('gamepaddisconnected', onGamepadDisconnected);
      return () => {
        target.removeEventListener('gamepadconnected', onGamepadConnected);
        target.removeEventListener('gamepaddisconnected', onGamepadDisconnected);
      };
    },

    attachKeyboard(source, sink, options): () => void {
      const target = getWebInputEventTarget(source);
      if (target === null) return noopInputIngressRelease;
      const preventDefault = options?.preventDefault ?? true;
      const onKeyDown = (event: Event) => {
        if (!sink.isEnabled()) return;
        const keyboardEvent = event as KeyboardEvent;
        if (preventDefault) keyboardEvent.preventDefault();
        setInputKeyboardData(_keyboardData, keyboardEvent);
        sink.keyDown(_keyboardData);
      };
      const onKeyUp = (event: Event) => {
        if (!sink.isEnabled()) return;
        const keyboardEvent = event as KeyboardEvent;
        if (preventDefault) keyboardEvent.preventDefault();
        setInputKeyboardData(_keyboardData, keyboardEvent);
        sink.keyUp(_keyboardData);
      };

      target.addEventListener('keydown', onKeyDown);
      target.addEventListener('keyup', onKeyUp);
      return () => {
        target.removeEventListener('keydown', onKeyDown);
        target.removeEventListener('keyup', onKeyUp);
      };
    },

    attachPointer(source, sink, options): () => void {
      const target = getWebInputEventTarget(source);
      if (target === null) return noopInputIngressRelease;
      const preventDefault = options?.preventDefault ?? true;
      const onContextMenu = (event: Event) => {
        if (preventDefault) event.preventDefault();
      };
      const onPointerCancel = (event: Event) => {
        if (!sink.isEnabled()) return;
        if (preventDefault) event.preventDefault();
        setInputPointerData(_pointerData, event as PointerEvent, 0, 0);
        sink.pointerCancel(_pointerData);
      };
      const onPointerDown = (event: Event) => {
        if (!sink.isEnabled()) return;
        if (preventDefault) event.preventDefault();
        setInputPointerData(_pointerData, event as PointerEvent, 0, 0);
        sink.pointerDown(_pointerData);
      };
      const onPointerMove = (event: Event) => {
        if (!sink.isEnabled()) return;
        if (preventDefault) event.preventDefault();
        setInputPointerData(_pointerData, event as PointerEvent, 0, 0);
        sink.pointerMove(_pointerData);
      };
      const onPointerUp = (event: Event) => {
        if (!sink.isEnabled()) return;
        if (preventDefault) event.preventDefault();
        setInputPointerData(_pointerData, event as PointerEvent, 0, 0);
        sink.pointerUp(_pointerData);
      };

      target.addEventListener('contextmenu', onContextMenu);
      target.addEventListener('pointercancel', onPointerCancel);
      target.addEventListener('pointerdown', onPointerDown);
      target.addEventListener('pointermove', onPointerMove);
      target.addEventListener('pointerup', onPointerUp);
      return () => {
        target.removeEventListener('contextmenu', onContextMenu);
        target.removeEventListener('pointercancel', onPointerCancel);
        target.removeEventListener('pointerdown', onPointerDown);
        target.removeEventListener('pointermove', onPointerMove);
        target.removeEventListener('pointerup', onPointerUp);
      };
    },

    attachRelativePointer(source, sink, options): () => void {
      const target = getWebInputOwnerDocumentTarget(source);
      if (target === null) return noopInputIngressRelease;
      const preventDefault = options?.preventDefault ?? true;
      const onMouseMove = (event: Event) => {
        if (!sink.isEnabled()) return;
        const mouseEvent = event as MouseEvent;
        if (preventDefault) mouseEvent.preventDefault();
        setInputPointerData(_pointerData, mouseEvent, mouseEvent.movementX, mouseEvent.movementY);
        sink.pointerMoveRelative(_pointerData);
      };

      target.addEventListener('mousemove', onMouseMove);
      return () => target.removeEventListener('mousemove', onMouseMove);
    },

    attachText(source, sink): () => void {
      const target = getWebInputEventTarget(source);
      if (target === null) return noopInputIngressRelease;
      const onBeforeInput = (event: Event) => {
        if (!sink.isEnabled()) return;
        const inputEvent = event as InputEvent;
        _textData.isComposing = inputEvent.isComposing;
        _textData.text = inputEvent.data ?? '';
        sink.textInput(_textData);
      };
      const onCompositionUpdate = (event: Event) => {
        if (!sink.isEnabled()) return;
        _textData.isComposing = true;
        _textData.text = (event as CompositionEvent).data ?? '';
        sink.textEdit(_textData);
      };

      target.addEventListener('beforeinput', onBeforeInput);
      target.addEventListener('compositionupdate', onCompositionUpdate);
      return () => {
        target.removeEventListener('beforeinput', onBeforeInput);
        target.removeEventListener('compositionupdate', onCompositionUpdate);
      };
    },

    attachWheel(source, sink, options): () => void {
      const target = getWebInputEventTarget(source);
      if (target === null) return noopInputIngressRelease;
      const preventDefault = options?.preventDefault ?? true;
      const onWheel = (event: Event) => {
        if (!sink.isEnabled()) return;
        const wheelEvent = event as WheelEvent;
        if (preventDefault) wheelEvent.preventDefault();
        setInputPointerData(_pointerData, wheelEvent, wheelEvent.deltaX, wheelEvent.deltaY);
        _pointerData.wheelMode = getMouseWheelModeFromDomWheelEvent(wheelEvent);
        sink.wheel(_pointerData);
      };

      target.addEventListener('wheel', onWheel, { passive: !preventDefault });
      return () => target.removeEventListener('wheel', onWheel);
    },
  };
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
 * Exits pointer lock, returning the pointer to normal movement.
 * No-op if pointer lock is not currently active.
 */
export function exitInputPointerLock(): void {
  if (document.exitPointerLock) {
    document.exitPointerLock();
  }
}

/**
 * Returns coalesced pointer event data for a `pointermove` event, iterating
 * over the high-frequency intermediate positions captured since the last
 * delivered event. Falls back to a single entry with the event itself when
 * `getCoalescedEvents` is unavailable (e.g. in jsdom).
 *
 * The callback receives each coalesced `InputPointerData` in order. The
 * payload object is reused across calls — do not retain a reference to it.
 */
export function getCoalescedInputPointerEvents(
  event: PointerEvent,
  callback: (data: Readonly<InputPointerData>) => void,
): void {
  const coalesced = typeof event.getCoalescedEvents === 'function' ? event.getCoalescedEvents() : null;
  if (coalesced !== null && coalesced.length > 0) {
    for (const e of coalesced) {
      setInputPointerData(_pointerData, e, 0, 0);
      callback(_pointerData);
    }
  } else {
    setInputPointerData(_pointerData, event, 0, 0);
    callback(_pointerData);
  }
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

export function getInputIngressBackend(): InputIngressBackend {
  return _customInputIngressBackend ?? _hostInputIngressBackend ?? _webInputIngressBackend;
}

export function getKeyCodeFromDomKeyboardEvent(event: Readonly<KeyboardEvent>): number {
  const code = getKeyCodeFromDomKeyboardCode(event.code, event.location);
  if (code !== KeyCode.UNKNOWN) return code;
  if (event.key.length === 1) return event.key.toLowerCase().charCodeAt(0);
  return keyCodesByKey[event.key] ?? KeyCode.UNKNOWN;
}

export function getKeyModifierFromDomKeyboardEvent(event: Readonly<KeyboardEvent>): number {
  let modifier = KeyModifier.NONE;
  if (event.altKey)
    modifier |= event.location === KeyboardEvent.DOM_KEY_LOCATION_RIGHT ? KeyModifier.RIGHT_ALT : KeyModifier.LEFT_ALT;
  if (event.ctrlKey)
    modifier |=
      event.location === KeyboardEvent.DOM_KEY_LOCATION_RIGHT ? KeyModifier.RIGHT_CTRL : KeyModifier.LEFT_CTRL;
  if (event.metaKey)
    modifier |=
      event.location === KeyboardEvent.DOM_KEY_LOCATION_RIGHT ? KeyModifier.RIGHT_META : KeyModifier.LEFT_META;
  if (event.shiftKey)
    modifier |=
      event.location === KeyboardEvent.DOM_KEY_LOCATION_RIGHT ? KeyModifier.RIGHT_SHIFT : KeyModifier.LEFT_SHIFT;
  if (event.getModifierState?.('CapsLock') === true) modifier |= KeyModifier.CAPS_LOCK;
  if (event.getModifierState?.('NumLock') === true) modifier |= KeyModifier.NUM_LOCK;
  return modifier;
}

export function getMouseWheelModeFromDomWheelEvent(event: Readonly<WheelEvent>): MouseWheelMode {
  if (event.deltaMode === WheelEvent.DOM_DELTA_PIXEL) return 'pixels';
  if (event.deltaMode === WheelEvent.DOM_DELTA_LINE) return 'lines';
  if (event.deltaMode === WheelEvent.DOM_DELTA_PAGE) return 'pages';
  return 'unknown';
}

/**
 * Returns `true` if pointer lock is currently active on any element.
 */
export function hasInputPointerLock(): boolean {
  return document.pointerLockElement !== null;
}

// First host wins; a custom backend installed through setInputIngressBackend always takes precedence.
export function installInputIngressHostBackend(backend: InputIngressBackend): void {
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

export function pollGamepadInput(manager: InputManager): void {
  if (!manager.enabled || typeof navigator.getGamepads !== 'function') return;
  const now = performance.now();
  const prev = getOrCreateGamepadPollState(manager);
  const gamepads = navigator.getGamepads();
  for (const pad of gamepads) {
    if (pad === null) continue;
    const prevAxes = prev.axes.get(pad.index) ?? [];
    const prevButtons = prev.buttons.get(pad.index) ?? [];
    for (let i = 0; i < pad.axes.length; i++) {
      const value = pad.axes[i]!;
      if (value !== prevAxes[i]) {
        prevAxes[i] = value;
        _axisData.axis = i;
        _axisData.gamepad = pad.index;
        _axisData.timeStamp = now;
        _axisData.value = value;
        emitSignal(manager.onGamepadAxisMove, _axisData);
      }
    }
    for (let i = 0; i < pad.buttons.length; i++) {
      const btn = pad.buttons[i]!;
      const wasPressed = prevButtons[i] ?? false;
      if (btn.pressed !== wasPressed) {
        prevButtons[i] = btn.pressed;
        _buttonData.button = i;
        _buttonData.gamepad = pad.index;
        _buttonData.timeStamp = now;
        _buttonData.value = btn.value;
        if (btn.pressed) {
          emitSignal(manager.onGamepadButtonDown, _buttonData);
        } else {
          emitSignal(manager.onGamepadButtonUp, _buttonData);
        }
      }
    }
    prev.axes.set(pad.index, prevAxes);
    prev.buttons.set(pad.index, prevButtons);
  }
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

/**
 * Requests pointer lock on `element`. Returns a `Promise<boolean>` that
 * resolves to `true` when lock is granted or `false` if the request is
 * rejected (e.g. outside a user gesture, or the browser denies it).
 */
export function requestInputPointerLock(element: HTMLElement): Promise<boolean> {
  try {
    const result = element.requestPointerLock();
    if (result instanceof Promise) {
      return result.then(
        () => true,
        () => false,
      );
    }
    return Promise.resolve(true);
  } catch {
    return Promise.resolve(false);
  }
}

export function resetInputIngressBackendForTest(): void {
  _customInputIngressBackend = null;
  _hostInputIngressBackend = null;
}

export function setInputIngressBackend(backend: InputIngressBackend | null): void {
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

function getKeyCodeFromDomKeyboardCode(code: string, location: number): number {
  if (location === KeyboardEvent.DOM_KEY_LOCATION_NUMPAD && code in numpadKeyCodesByCode) {
    return numpadKeyCodesByCode[code]!;
  }
  return keyCodesByCode[code] ?? KeyCode.UNKNOWN;
}

function getPointerTypeFromDomPointerEvent(event: Readonly<PointerEvent>): InputPointerData['pointerType'] {
  return event.pointerType === 'mouse' || event.pointerType === 'pen' || event.pointerType === 'touch'
    ? event.pointerType
    : 'unknown';
}

function setInputKeyboardData(out: InputKeyboardData, event: KeyboardEvent): void {
  const modifier = getKeyModifierFromDomKeyboardEvent(event);
  out.altKey = event.altKey;
  out.capsLock = (modifier & KeyModifier.CAPS_LOCK) !== 0;
  out.code = event.code;
  out.ctrlKey = event.ctrlKey;
  out.key = event.key;
  out.keyCode = getKeyCodeFromDomKeyboardEvent(event);
  out.location = event.location;
  out.metaKey = event.metaKey;
  out.modifier = modifier;
  out.numLock = (modifier & KeyModifier.NUM_LOCK) !== 0;
  out.repeat = event.repeat;
  out.shiftKey = event.shiftKey;
  out.timeStamp = event.timeStamp;
}

function setInputPointerData(
  out: InputPointerData,
  event: PointerEvent | WheelEvent | MouseEvent,
  deltaX: number,
  deltaY: number,
): void {
  out.altKey = event.altKey;
  out.button = event.button;
  out.buttons = event.buttons;
  out.ctrlKey = event.ctrlKey;
  out.deltaX = deltaX;
  out.deltaY = deltaY;
  out.height = 'height' in event ? (event as PointerEvent).height : 1;
  out.isPrimary = 'isPrimary' in event ? (event as PointerEvent).isPrimary : true;
  out.metaKey = event.metaKey;
  out.pointerId = 'pointerId' in event ? (event as PointerEvent).pointerId : 0;
  out.pointerType = 'pointerType' in event ? getPointerTypeFromDomPointerEvent(event as PointerEvent) : 'mouse';
  out.pressure = 'pressure' in event ? (event as PointerEvent).pressure : 0;
  out.shiftKey = event.shiftKey;
  out.tiltX = 'tiltX' in event ? (event as PointerEvent).tiltX : 0;
  out.tiltY = 'tiltY' in event ? (event as PointerEvent).tiltY : 0;
  out.timeStamp = event.timeStamp;
  out.twist = 'twist' in event ? (event as PointerEvent).twist : 0;
  out.wheelMode = 'unknown';
  out.width = 'width' in event ? (event as PointerEvent).width : 1;
  out.x = event.clientX;
  out.y = event.clientY;
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

// DOM KeyboardEvent.code → KeyCode. Exhaustive for all keys in the KeyCode enum
// that have a direct W3C code string.
const keyCodesByCode: Record<string, number> = {
  Again: KeyCode.AGAIN,
  AltLeft: KeyCode.LEFT_ALT,
  AltRight: KeyCode.RIGHT_ALT,
  ArrowDown: KeyCode.DOWN,
  ArrowLeft: KeyCode.LEFT,
  ArrowRight: KeyCode.RIGHT,
  ArrowUp: KeyCode.UP,
  AudioVolumeDown: KeyCode.AUDIO_MUTE, // browser-specific alias
  Backspace: KeyCode.BACKSPACE,
  BrowserBack: KeyCode.APP_CONTROL_BACK,
  BrowserBookmarks: KeyCode.APP_CONTROL_BOOKMARKS,
  BrowserForward: KeyCode.APP_CONTROL_FORWARD,
  BrowserHome: KeyCode.APP_CONTROL_HOME,
  BrowserRefresh: KeyCode.APP_CONTROL_REFRESH,
  BrowserSearch: KeyCode.APP_CONTROL_SEARCH,
  BrowserStop: KeyCode.APP_CONTROL_STOP,
  CapsLock: KeyCode.CAPS_LOCK,
  ContextMenu: KeyCode.APPLICATION,
  ControlLeft: KeyCode.LEFT_CTRL,
  ControlRight: KeyCode.RIGHT_CTRL,
  Convert: KeyCode.UNKNOWN, // IME convert (Japanese) — no direct SDL equiv
  Copy: KeyCode.COPY,
  Cut: KeyCode.CUT,
  Delete: KeyCode.DELETE,
  Eject: KeyCode.EJECT,
  End: KeyCode.END,
  Enter: KeyCode.RETURN,
  Escape: KeyCode.ESCAPE,
  F1: KeyCode.F1,
  F2: KeyCode.F2,
  F3: KeyCode.F3,
  F4: KeyCode.F4,
  F5: KeyCode.F5,
  F6: KeyCode.F6,
  F7: KeyCode.F7,
  F8: KeyCode.F8,
  F9: KeyCode.F9,
  F10: KeyCode.F10,
  F11: KeyCode.F11,
  F12: KeyCode.F12,
  F13: KeyCode.F13,
  F14: KeyCode.F14,
  F15: KeyCode.F15,
  F16: KeyCode.F16,
  F17: KeyCode.F17,
  F18: KeyCode.F18,
  F19: KeyCode.F19,
  F20: KeyCode.F20,
  F21: KeyCode.F21,
  F22: KeyCode.F22,
  F23: KeyCode.F23,
  F24: KeyCode.F24,
  Find: KeyCode.FIND,
  Help: KeyCode.HELP,
  Home: KeyCode.HOME,
  Insert: KeyCode.INSERT,
  IntlBackslash: KeyCode.BACKSLASH,
  LaunchApp1: KeyCode.COMPUTER,
  LaunchApp2: KeyCode.CALCULATOR,
  LaunchMail: KeyCode.MAIL,
  LaunchMediaPlayer: KeyCode.MEDIA_SELECT,
  MediaPlayPause: KeyCode.AUDIO_PLAY,
  MediaStop: KeyCode.AUDIO_STOP,
  MediaTrackNext: KeyCode.AUDIO_NEXT,
  MediaTrackPrevious: KeyCode.AUDIO_PREVIOUS,
  MetaLeft: KeyCode.LEFT_META,
  MetaRight: KeyCode.RIGHT_META,
  NonConvert: KeyCode.UNKNOWN, // IME non-convert — no direct SDL equiv
  NumLock: KeyCode.NUM_LOCK,
  PageDown: KeyCode.PAGE_DOWN,
  PageUp: KeyCode.PAGE_UP,
  Paste: KeyCode.PASTE,
  Pause: KeyCode.PAUSE,
  Power: KeyCode.POWER,
  PrintScreen: KeyCode.PRINT_SCREEN,
  ScrollLock: KeyCode.SCROLL_LOCK,
  Select: KeyCode.SELECT,
  ShiftLeft: KeyCode.LEFT_SHIFT,
  ShiftRight: KeyCode.RIGHT_SHIFT,
  Sleep: KeyCode.SLEEP,
  Space: KeyCode.SPACE,
  Tab: KeyCode.TAB,
  Undo: KeyCode.UNDO,
  VolumeDown: KeyCode.VOLUME_DOWN,
  VolumeMute: KeyCode.AUDIO_MUTE,
  VolumeUp: KeyCode.VOLUME_UP,
  WakeUp: KeyCode.UNKNOWN, // no SDL equiv
  WWW: KeyCode.WWW,
};

// DOM KeyboardEvent.key → KeyCode. Used as fallback when .code gives UNKNOWN.
const keyCodesByKey: Record<string, number> = {
  // Navigation
  Alt: KeyCode.LEFT_ALT,
  ArrowDown: KeyCode.DOWN,
  ArrowLeft: KeyCode.LEFT,
  ArrowRight: KeyCode.RIGHT,
  ArrowUp: KeyCode.UP,
  Backspace: KeyCode.BACKSPACE,
  CapsLock: KeyCode.CAPS_LOCK,
  Control: KeyCode.LEFT_CTRL,
  Delete: KeyCode.DELETE,
  End: KeyCode.END,
  Enter: KeyCode.RETURN,
  Escape: KeyCode.ESCAPE,
  Home: KeyCode.HOME,
  Insert: KeyCode.INSERT,
  Meta: KeyCode.LEFT_META,
  NumLock: KeyCode.NUM_LOCK,
  PageDown: KeyCode.PAGE_DOWN,
  PageUp: KeyCode.PAGE_UP,
  Pause: KeyCode.PAUSE,
  PrintScreen: KeyCode.PRINT_SCREEN,
  ScrollLock: KeyCode.SCROLL_LOCK,
  Shift: KeyCode.LEFT_SHIFT,
  Tab: KeyCode.TAB,
  // Function keys
  F1: KeyCode.F1,
  F2: KeyCode.F2,
  F3: KeyCode.F3,
  F4: KeyCode.F4,
  F5: KeyCode.F5,
  F6: KeyCode.F6,
  F7: KeyCode.F7,
  F8: KeyCode.F8,
  F9: KeyCode.F9,
  F10: KeyCode.F10,
  F11: KeyCode.F11,
  F12: KeyCode.F12,
  F13: KeyCode.F13,
  F14: KeyCode.F14,
  F15: KeyCode.F15,
  F16: KeyCode.F16,
  F17: KeyCode.F17,
  F18: KeyCode.F18,
  F19: KeyCode.F19,
  F20: KeyCode.F20,
  F21: KeyCode.F21,
  F22: KeyCode.F22,
  F23: KeyCode.F23,
  F24: KeyCode.F24,
  // Media keys
  AudioVolumeDown: KeyCode.VOLUME_DOWN,
  AudioVolumeMute: KeyCode.AUDIO_MUTE,
  AudioVolumeUp: KeyCode.VOLUME_UP,
  MediaPlayPause: KeyCode.AUDIO_PLAY,
  MediaStop: KeyCode.AUDIO_STOP,
  MediaTrackNext: KeyCode.AUDIO_NEXT,
  MediaTrackPrevious: KeyCode.AUDIO_PREVIOUS,
  // Browser keys
  BrowserBack: KeyCode.APP_CONTROL_BACK,
  BrowserBookmarks: KeyCode.APP_CONTROL_BOOKMARKS,
  BrowserForward: KeyCode.APP_CONTROL_FORWARD,
  BrowserHome: KeyCode.APP_CONTROL_HOME,
  BrowserRefresh: KeyCode.APP_CONTROL_REFRESH,
  BrowserSearch: KeyCode.APP_CONTROL_SEARCH,
  BrowserStop: KeyCode.APP_CONTROL_STOP,
  // Misc
  ContextMenu: KeyCode.APPLICATION,
  Copy: KeyCode.COPY,
  Cut: KeyCode.CUT,
  Find: KeyCode.FIND,
  Help: KeyCode.HELP,
  Paste: KeyCode.PASTE,
  Select: KeyCode.SELECT,
  Undo: KeyCode.UNDO,
};

const numpadKeyCodesByCode: Record<string, number> = {
  Enter: KeyCode.NUMPAD_ENTER,
  Numpad0: KeyCode.NUMPAD_0,
  Numpad1: KeyCode.NUMPAD_1,
  Numpad2: KeyCode.NUMPAD_2,
  Numpad3: KeyCode.NUMPAD_3,
  Numpad4: KeyCode.NUMPAD_4,
  Numpad5: KeyCode.NUMPAD_5,
  Numpad6: KeyCode.NUMPAD_6,
  Numpad7: KeyCode.NUMPAD_7,
  Numpad8: KeyCode.NUMPAD_8,
  Numpad9: KeyCode.NUMPAD_9,
  NumpadAdd: KeyCode.NUMPAD_PLUS,
  NumpadBackspace: KeyCode.NUMPAD_BACKSPACE,
  NumpadClear: KeyCode.NUMPAD_CLEAR,
  NumpadClearEntry: KeyCode.NUMPAD_CLEAR_ENTRY,
  NumpadComma: KeyCode.NUMPAD_COMMA,
  NumpadDecimal: KeyCode.NUMPAD_PERIOD,
  NumpadDivide: KeyCode.NUMPAD_DIVIDE,
  NumpadEqual: KeyCode.NUMPAD_EQUALS,
  NumpadHash: KeyCode.NUMPAD_HASH,
  NumpadMemoryAdd: KeyCode.NUMPAD_MEM_ADD,
  NumpadMemoryClear: KeyCode.NUMPAD_MEM_CLEAR,
  NumpadMemoryRecall: KeyCode.NUMPAD_MEM_RECALL,
  NumpadMemoryStore: KeyCode.NUMPAD_MEM_STORE,
  NumpadMemorySubtract: KeyCode.NUMPAD_MEM_SUBTRACT,
  NumpadMultiply: KeyCode.NUMPAD_MULTIPLY,
  NumpadParenLeft: KeyCode.NUMPAD_LEFT_PARENTHESIS,
  NumpadParenRight: KeyCode.NUMPAD_RIGHT_PARENTHESIS,
  NumpadSubtract: KeyCode.NUMPAD_MINUS,
};

const _keyboardData: InputKeyboardData = {
  altKey: false,
  capsLock: false,
  code: '',
  ctrlKey: false,
  key: '',
  keyCode: 0,
  location: 0,
  metaKey: false,
  modifier: 0,
  numLock: false,
  repeat: false,
  shiftKey: false,
  timeStamp: 0,
};

const _pointerData: InputPointerData = {
  altKey: false,
  button: 0,
  buttons: 0,
  ctrlKey: false,
  deltaX: 0,
  deltaY: 0,
  height: 1,
  isPrimary: true,
  metaKey: false,
  pointerId: 0,
  pointerType: 'mouse',
  pressure: 0,
  shiftKey: false,
  tiltX: 0,
  tiltY: 0,
  timeStamp: 0,
  twist: 0,
  wheelMode: 'unknown',
  width: 1,
  x: 0,
  y: 0,
};

const _textData: InputTextData = {
  isComposing: false,
  text: '',
};

interface GamepadPollState {
  axes: Map<number, number[]>;
  buttons: Map<number, boolean[]>;
}

const _gamepadPollStates = new WeakMap<InputManager, GamepadPollState>();

function getOrCreateGamepadPollState(manager: InputManager): GamepadPollState {
  let state = _gamepadPollStates.get(manager);
  if (state === undefined) {
    state = { axes: new Map(), buttons: new Map() };
    _gamepadPollStates.set(manager, state);
  }
  return state;
}

const _axisData: InputGamepadAxisData = { axis: 0, gamepad: 0, timeStamp: 0, value: 0 };
const _buttonData: InputGamepadButtonData = { button: 0, gamepad: 0, timeStamp: 0, value: 0 };
const _connectData: InputGamepadConnectData = { gamepad: 0, id: '', mapping: '' };

const _inputIngressSinks = new WeakMap<InputManager, InputIngressSink>();

function getInputIngressSink(manager: InputManager): InputIngressSink {
  let sink = _inputIngressSinks.get(manager);
  if (sink !== undefined) return sink;
  sink = {
    gamepadConnect(data, axes, buttons): void {
      if (!manager.enabled) return;
      const previous = getOrCreateGamepadPollState(manager);
      previous.axes.set(data.gamepad, Array.from(axes));
      previous.buttons.set(data.gamepad, Array.from(buttons));
      emitSignal(manager.onGamepadConnect, data);
    },
    gamepadDisconnect(data): void {
      if (!manager.enabled) return;
      const previous = getOrCreateGamepadPollState(manager);
      previous.axes.delete(data.gamepad);
      previous.buttons.delete(data.gamepad);
      emitSignal(manager.onGamepadDisconnect, data);
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

function getWebInputEventTarget(source: InputIngressSource): EventTarget | null {
  const candidate = source as Partial<EventTarget>;
  return typeof candidate.addEventListener === 'function' && typeof candidate.removeEventListener === 'function'
    ? (candidate as EventTarget)
    : null;
}

function getWebInputOwnerDocumentTarget(source: InputIngressSource): EventTarget | null {
  if (!('ownerDocument' in source)) return null;
  const ownerDocument = (source as { readonly ownerDocument?: object | null }).ownerDocument;
  return ownerDocument === undefined || ownerDocument === null ? null : getWebInputEventTarget(ownerDocument);
}

function noopInputIngressRelease(): void {}

function setInputGamepadConnectData(out: InputGamepadConnectData, gamepad: Gamepad): void {
  out.gamepad = gamepad.index;
  out.id = gamepad.id;
  out.mapping = gamepad.mapping === 'standard' ? 'standard' : gamepad.mapping === '' ? '' : 'raw';
}

const _webInputIngressBackend = createWebInputIngressBackend();
let _customInputIngressBackend: InputIngressBackend | null = null;
let _hostInputIngressBackend: InputIngressBackend | null = null;

// Internal teardown registry: maps a manager to its per-source, per-input-kind origin release.
// Kept off the public InputManager entity (a side table like `_gamepadPollStates`) so attach/detach
// track bindings internally and callers hold nothing. The exact source identity lets one manager
// attach the same input kind to multiple windows/sources and detach each precisely.
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
