import { createSignal, emitSignal } from '@flighthq/signals';
import type {
  AttachInputOptions,
  InputGamepadAxisData,
  InputGamepadButtonData,
  InputGamepadConnectData,
  InputKeyboardData,
  InputManager,
  InputPointerData,
  InputSignals,
  MouseWheelMode,
  TextSelectionRange,
} from '@flighthq/types';
import { KeyCode, KeyModifier } from '@flighthq/types';

export function attachGamepadInput(manager: InputManager, target: Window): () => void {
  const onGamepadConnected = (e: Event) => {
    if (!manager.enabled) return;
    const pad = (e as GamepadEvent).gamepad;
    const prev = getOrCreateGamepadPollState(manager);
    prev.axes.set(pad.index, Array.from(pad.axes));
    prev.buttons.set(
      pad.index,
      Array.from(pad.buttons, (b) => b.pressed),
    );
    _connectData.gamepad = pad.index;
    _connectData.id = pad.id;
    emitSignal(manager.onGamepadConnect, _connectData);
  };

  const onGamepadDisconnected = (e: Event) => {
    if (!manager.enabled) return;
    const pad = (e as GamepadEvent).gamepad;
    const prev = getOrCreateGamepadPollState(manager);
    prev.axes.delete(pad.index);
    prev.buttons.delete(pad.index);
    _connectData.gamepad = pad.index;
    _connectData.id = pad.id;
    emitSignal(manager.onGamepadDisconnect, _connectData);
  };

  let rafId = 0;
  const loop = () => {
    pollGamepadInput(manager);
    rafId = requestAnimationFrame(loop);
  };

  target.addEventListener('gamepadconnected', onGamepadConnected);
  target.addEventListener('gamepaddisconnected', onGamepadDisconnected);
  rafId = requestAnimationFrame(loop);

  return () => {
    target.removeEventListener('gamepadconnected', onGamepadConnected);
    target.removeEventListener('gamepaddisconnected', onGamepadDisconnected);
    cancelAnimationFrame(rafId);
  };
}

export function attachKeyboardInput(
  manager: InputManager,
  target: EventTarget,
  options?: Readonly<AttachInputOptions>,
): () => void {
  const preventDefault = options?.preventDefault ?? true;

  const onKeyDown = (e: Event) => {
    if (!manager.enabled) return;
    const ke = e as KeyboardEvent;
    if (preventDefault) ke.preventDefault();
    setInputKeyboardData(_keyboardData, ke);
    emitSignal(manager.onKeyDown, _keyboardData);
  };
  const onKeyUp = (e: Event) => {
    if (!manager.enabled) return;
    const ke = e as KeyboardEvent;
    if (preventDefault) ke.preventDefault();
    setInputKeyboardData(_keyboardData, ke);
    emitSignal(manager.onKeyUp, _keyboardData);
  };

  target.addEventListener('keydown', onKeyDown);
  target.addEventListener('keyup', onKeyUp);
  return () => {
    target.removeEventListener('keydown', onKeyDown);
    target.removeEventListener('keyup', onKeyUp);
  };
}

export function attachPointerInput(
  manager: InputManager,
  element: HTMLElement,
  options?: Readonly<AttachInputOptions>,
): () => void {
  const preventDefault = options?.preventDefault ?? true;

  const onContextMenu = (e: Event) => {
    if (preventDefault) e.preventDefault();
  };
  const onPointerCancel = (e: Event) => {
    if (!manager.enabled) return;
    if (preventDefault) e.preventDefault();
    setInputPointerData(_pointerData, e as PointerEvent, 0, 0);
    emitSignal(manager.onPointerCancel, _pointerData);
  };
  const onPointerDown = (e: Event) => {
    if (!manager.enabled) return;
    if (preventDefault) e.preventDefault();
    setInputPointerData(_pointerData, e as PointerEvent, 0, 0);
    emitSignal(manager.onPointerDown, _pointerData);
  };
  const onPointerMove = (e: Event) => {
    if (!manager.enabled) return;
    if (preventDefault) e.preventDefault();
    setInputPointerData(_pointerData, e as PointerEvent, 0, 0);
    emitSignal(manager.onPointerMove, _pointerData);
  };
  const onPointerUp = (e: Event) => {
    if (!manager.enabled) return;
    if (preventDefault) e.preventDefault();
    setInputPointerData(_pointerData, e as PointerEvent, 0, 0);
    emitSignal(manager.onPointerUp, _pointerData);
  };

  element.addEventListener('contextmenu', onContextMenu);
  element.addEventListener('pointercancel', onPointerCancel);
  element.addEventListener('pointerdown', onPointerDown);
  element.addEventListener('pointermove', onPointerMove);
  element.addEventListener('pointerup', onPointerUp);

  return () => {
    element.removeEventListener('contextmenu', onContextMenu);
    element.removeEventListener('pointercancel', onPointerCancel);
    element.removeEventListener('pointerdown', onPointerDown);
    element.removeEventListener('pointermove', onPointerMove);
    element.removeEventListener('pointerup', onPointerUp);
  };
}

export function attachRelativePointerInput(manager: InputManager, element: HTMLElement): () => void {
  const target = element.ownerDocument;
  const handler = (e: Event) => {
    if (!manager.enabled) return;
    const me = e as MouseEvent;
    _pointerData.altKey = me.altKey;
    _pointerData.button = me.button;
    _pointerData.buttons = me.buttons;
    _pointerData.ctrlKey = me.ctrlKey;
    _pointerData.deltaX = me.movementX;
    _pointerData.deltaY = me.movementY;
    _pointerData.isPrimary = true;
    _pointerData.metaKey = me.metaKey;
    _pointerData.pointerId = 0;
    _pointerData.pointerType = 'mouse';
    _pointerData.shiftKey = me.shiftKey;
    _pointerData.wheelMode = 'unknown';
    _pointerData.x = me.clientX;
    _pointerData.y = me.clientY;
    emitSignal(manager.onPointerMoveRelative, _pointerData);
  };
  target.addEventListener('mousemove', handler);
  return () => target.removeEventListener('mousemove', handler);
}

export function attachTextInput(manager: InputManager, element: HTMLElement): () => void {
  const onBeforeInput = (e: Event) => {
    if (!manager.enabled) return;
    const text = (e as InputEvent).data ?? '';
    setInputTextData(_textData, text, 0, text.length);
    emitSignal(manager.onTextInput, _textData);
  };
  const onCompositionUpdate = (e: Event) => {
    if (!manager.enabled) return;
    const text = (e as CompositionEvent).data ?? '';
    setInputTextData(_textData, text, 0, text.length);
    emitSignal(manager.onTextEdit, _textData);
  };

  element.addEventListener('beforeinput', onBeforeInput);
  element.addEventListener('compositionupdate', onCompositionUpdate);
  return () => {
    element.removeEventListener('beforeinput', onBeforeInput);
    element.removeEventListener('compositionupdate', onCompositionUpdate);
  };
}

export function attachWheelInput(
  manager: InputManager,
  element: HTMLElement,
  options?: Readonly<AttachInputOptions>,
): () => void {
  const preventDefault = options?.preventDefault ?? true;
  const handler = (e: Event) => {
    if (!manager.enabled) return;
    const we = e as WheelEvent;
    if (preventDefault) we.preventDefault();
    setInputPointerData(_pointerData, we, we.deltaX, we.deltaY);
    _pointerData.wheelMode = getMouseWheelModeFromDOMWheelEvent(we);
    emitSignal(manager.onWheel, _pointerData);
  };
  element.addEventListener('wheel', handler, { passive: !preventDefault });
  return () => element.removeEventListener('wheel', handler);
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

export function getKeyCodeFromDOMKeyboardEvent(event: Readonly<KeyboardEvent>): number {
  const code = getKeyCodeFromDOMKeyboardCode(event.code, event.location);
  if (code !== KeyCode.UNKNOWN) return code;
  if (event.key.length === 1) return event.key.toLowerCase().charCodeAt(0);
  return keyCodesByKey[event.key] ?? KeyCode.UNKNOWN;
}

export function getKeyModifierFromDOMKeyboardEvent(event: Readonly<KeyboardEvent>): number {
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

export function getMouseWheelModeFromDOMWheelEvent(event: Readonly<WheelEvent>): MouseWheelMode {
  if (event.deltaMode === WheelEvent.DOM_DELTA_PIXEL) return 'pixels';
  if (event.deltaMode === WheelEvent.DOM_DELTA_LINE) return 'lines';
  if (event.deltaMode === WheelEvent.DOM_DELTA_PAGE) return 'pages';
  return 'unknown';
}

export function pollGamepadInput(manager: InputManager): void {
  if (!manager.enabled || typeof navigator.getGamepads !== 'function') return;
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

function getKeyCodeFromDOMKeyboardCode(code: string, location: number): number {
  if (location === KeyboardEvent.DOM_KEY_LOCATION_NUMPAD && code in numpadKeyCodesByCode) {
    return numpadKeyCodesByCode[code]!;
  }
  return keyCodesByCode[code] ?? KeyCode.UNKNOWN;
}

function getPointerTypeFromDOMPointerEvent(event: Readonly<PointerEvent>): InputPointerData['pointerType'] {
  return event.pointerType === 'mouse' || event.pointerType === 'pen' || event.pointerType === 'touch'
    ? event.pointerType
    : 'unknown';
}

function setInputKeyboardData(out: InputKeyboardData, event: KeyboardEvent): void {
  const modifier = getKeyModifierFromDOMKeyboardEvent(event);
  out.altKey = event.altKey;
  out.capsLock = (modifier & KeyModifier.CAPS_LOCK) !== 0;
  out.code = event.code;
  out.ctrlKey = event.ctrlKey;
  out.key = event.key;
  out.keyCode = getKeyCodeFromDOMKeyboardEvent(event);
  out.location = event.location;
  out.metaKey = event.metaKey;
  out.modifier = modifier;
  out.numLock = (modifier & KeyModifier.NUM_LOCK) !== 0;
  out.repeat = event.repeat;
  out.shiftKey = event.shiftKey;
}

function setInputPointerData(
  out: InputPointerData,
  event: PointerEvent | WheelEvent,
  deltaX: number,
  deltaY: number,
): void {
  out.altKey = event.altKey;
  out.button = event.button;
  out.buttons = event.buttons;
  out.ctrlKey = event.ctrlKey;
  out.deltaX = deltaX;
  out.deltaY = deltaY;
  out.isPrimary = 'isPrimary' in event ? event.isPrimary : true;
  out.metaKey = event.metaKey;
  out.pointerId = 'pointerId' in event ? event.pointerId : 0;
  out.pointerType = 'pointerType' in event ? getPointerTypeFromDOMPointerEvent(event) : 'mouse';
  out.shiftKey = event.shiftKey;
  out.wheelMode = 'unknown';
  out.x = event.clientX;
  out.y = event.clientY;
}

function setInputTextData(out: TextSelectionRange, text: string, start: number, length: number): void {
  out.length = length;
  out.start = start;
  out.text = text;
}

const keyCodesByCode: Record<string, number> = {
  AltLeft: KeyCode.LEFT_ALT,
  AltRight: KeyCode.RIGHT_ALT,
  ArrowDown: KeyCode.DOWN,
  ArrowLeft: KeyCode.LEFT,
  ArrowRight: KeyCode.RIGHT,
  ArrowUp: KeyCode.UP,
  Backspace: KeyCode.BACKSPACE,
  CapsLock: KeyCode.CAPS_LOCK,
  ControlLeft: KeyCode.LEFT_CTRL,
  ControlRight: KeyCode.RIGHT_CTRL,
  Delete: KeyCode.DELETE,
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
  Home: KeyCode.HOME,
  Insert: KeyCode.INSERT,
  MetaLeft: KeyCode.LEFT_META,
  MetaRight: KeyCode.RIGHT_META,
  PageDown: KeyCode.PAGE_DOWN,
  PageUp: KeyCode.PAGE_UP,
  ShiftLeft: KeyCode.LEFT_SHIFT,
  ShiftRight: KeyCode.RIGHT_SHIFT,
  Space: KeyCode.SPACE,
  Tab: KeyCode.TAB,
};

const keyCodesByKey: Record<string, number> = {
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
  PageDown: KeyCode.PAGE_DOWN,
  PageUp: KeyCode.PAGE_UP,
  Shift: KeyCode.LEFT_SHIFT,
  Tab: KeyCode.TAB,
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
  NumpadDecimal: KeyCode.NUMPAD_PERIOD,
  NumpadDivide: KeyCode.NUMPAD_DIVIDE,
  NumpadMultiply: KeyCode.NUMPAD_MULTIPLY,
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
};

const _pointerData: InputPointerData = {
  altKey: false,
  button: 0,
  buttons: 0,
  ctrlKey: false,
  deltaX: 0,
  deltaY: 0,
  isPrimary: true,
  metaKey: false,
  pointerId: 0,
  pointerType: 'mouse',
  shiftKey: false,
  wheelMode: 'unknown',
  x: 0,
  y: 0,
};

const _textData: TextSelectionRange = {
  length: 0,
  start: 0,
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

const _axisData: InputGamepadAxisData = { axis: 0, gamepad: 0, value: 0 };
const _buttonData: InputGamepadButtonData = { button: 0, gamepad: 0, value: 0 };
const _connectData: InputGamepadConnectData = { gamepad: 0, id: '' };
