import { allocateEntity, finishEntity } from '@flighthq/entity/contract';
import type {
  Entity,
  EntityConstruction,
  HostInputCapabilities,
  HostInputIngressCapability,
  InputGamepadAxisData,
  InputGamepadButtonData,
  InputGamepadConnectData,
  InputIngressSource,
  InputKeyboardData,
  InputPointerData,
  InputTextData,
  MouseWheelMode,
} from '@flighthq/types/contract';
import { KeyCode, KeyModifier } from '@flighthq/types/contract';

import { webHostHaptics } from './webHaptics';
import { webHostInputDropFile, webHostInputFocus, webHostInputPointerLock, webHostInputTarget } from './webInputTarget';
import { webHostSoftKeyboardChange, webHostSoftKeyboardInfo, webHostSoftKeyboardVisibility } from './webKeyboard';

export function createWebInputIngressBackend(): HostInputIngressCapability & Entity {
  const out = allocateEntity<HostInputIngressCapability & Entity>();
  initializeWebInputIngressBackend(out);
  return finishEntity(out);
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
export function getWebCoalescedPointerEvents(
  event: PointerEvent,
  callback: (data: Readonly<InputPointerData>) => void,
): void {
  const coalesced = typeof event.getCoalescedEvents === 'function' ? event.getCoalescedEvents() : null;
  if (coalesced !== null && coalesced.length > 0) {
    for (const coalescedEvent of coalesced) {
      setWebInputPointerData(_pointerData, coalescedEvent, 0, 0);
      callback(_pointerData);
    }
  } else {
    setWebInputPointerData(_pointerData, event, 0, 0);
    callback(_pointerData);
  }
}

export function getWebKeyCodeFromKeyboardEvent(event: Readonly<KeyboardEvent>): number {
  const code = getWebKeyCodeFromKeyboardCode(event.code, event.location);
  if (code !== KeyCode.UNKNOWN) return code;
  if (event.key.length === 1) return event.key.toLowerCase().charCodeAt(0);
  return keyCodesByKey[event.key] ?? KeyCode.UNKNOWN;
}

export function getWebKeyModifierFromKeyboardEvent(event: Readonly<KeyboardEvent>): number {
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

export function getWebMouseWheelModeFromWheelEvent(event: Readonly<WheelEvent>): MouseWheelMode {
  if (event.deltaMode === WheelEvent.DOM_DELTA_PIXEL) return 'pixels';
  if (event.deltaMode === WheelEvent.DOM_DELTA_LINE) return 'lines';
  if (event.deltaMode === WheelEvent.DOM_DELTA_PAGE) return 'pages';
  return 'unknown';
}

/** Explicit browser adapter for input ingress. */
export function initializeWebInputIngressBackend(out: EntityConstruction<HostInputIngressCapability & Entity>): void {
  out.attachGamepad = (source, sink): (() => void) => {
    const target = getWebInputEventTarget(source);
    if (target === null) return noopInputIngressRelease;

    const previousAxes = new Map<number, number[]>();
    const previousButtons = new Map<number, boolean[]>();
    let released = false;
    let frameHandle = 0;

    const onGamepadConnected = (event: Event) => {
      if (released || !sink.isEnabled()) return;
      const gamepad = (event as GamepadEvent).gamepad;
      previousAxes.set(gamepad.index, Array.from(gamepad.axes));
      previousButtons.set(
        gamepad.index,
        Array.from(gamepad.buttons, (button) => button.pressed),
      );
      setInputGamepadConnectData(_connectData, gamepad);
      sink.gamepadConnect(_connectData);
    };
    const onGamepadDisconnected = (event: Event) => {
      if (released || !sink.isEnabled()) return;
      const gamepad = (event as GamepadEvent).gamepad;
      previousAxes.delete(gamepad.index);
      previousButtons.delete(gamepad.index);
      setInputGamepadConnectData(_connectData, gamepad);
      sink.gamepadDisconnect(_connectData);
    };

    const poll = () => {
      if (!sink.isEnabled() || typeof navigator.getGamepads !== 'function') return;
      const now = performance.now();
      for (const gamepad of navigator.getGamepads()) {
        if (gamepad === null) continue;
        const axes = previousAxes.get(gamepad.index) ?? [];
        const buttons = previousButtons.get(gamepad.index) ?? [];
        for (let index = 0; index < gamepad.axes.length; index++) {
          const value = gamepad.axes[index]!;
          if (value === axes[index]) continue;
          axes[index] = value;
          _axisData.axis = index;
          _axisData.gamepad = gamepad.index;
          _axisData.timeStamp = now;
          _axisData.value = value;
          sink.gamepadAxisMove(_axisData);
          if (released) return;
        }
        for (let index = 0; index < gamepad.buttons.length; index++) {
          const button = gamepad.buttons[index]!;
          const wasPressed = buttons[index] ?? false;
          if (button.pressed === wasPressed) continue;
          buttons[index] = button.pressed;
          _buttonData.button = index;
          _buttonData.gamepad = gamepad.index;
          _buttonData.timeStamp = now;
          _buttonData.value = button.value;
          if (button.pressed) sink.gamepadButtonDown(_buttonData);
          else sink.gamepadButtonUp(_buttonData);
          if (released) return;
        }
        previousAxes.set(gamepad.index, axes);
        previousButtons.set(gamepad.index, buttons);
      }
    };
    const loop = () => {
      if (released) return;
      // Schedule first so a signal handler that detaches reentrantly cancels the only future frame.
      frameHandle = requestAnimationFrame(loop);
      poll();
    };

    target.addEventListener('gamepadconnected', onGamepadConnected);
    target.addEventListener('gamepaddisconnected', onGamepadDisconnected);
    frameHandle = requestAnimationFrame(loop);
    return () => {
      if (released) return;
      released = true;
      target.removeEventListener('gamepadconnected', onGamepadConnected);
      target.removeEventListener('gamepaddisconnected', onGamepadDisconnected);
      cancelAnimationFrame(frameHandle);
    };
  };
  out.attachKeyboard = (source, sink, options): (() => void) => {
    const target = getWebInputEventTarget(source);
    if (target === null) return noopInputIngressRelease;
    const preventDefault = options?.preventDefault ?? true;
    const onKeyDown = (event: Event) => {
      if (!sink.isEnabled()) return;
      const keyboardEvent = event as KeyboardEvent;
      if (preventDefault) keyboardEvent.preventDefault();
      setWebInputKeyboardData(_keyboardData, keyboardEvent);
      sink.keyDown(_keyboardData);
    };
    const onKeyUp = (event: Event) => {
      if (!sink.isEnabled()) return;
      const keyboardEvent = event as KeyboardEvent;
      if (preventDefault) keyboardEvent.preventDefault();
      setWebInputKeyboardData(_keyboardData, keyboardEvent);
      sink.keyUp(_keyboardData);
    };

    target.addEventListener('keydown', onKeyDown);
    target.addEventListener('keyup', onKeyUp);
    return () => {
      target.removeEventListener('keydown', onKeyDown);
      target.removeEventListener('keyup', onKeyUp);
    };
  };
  out.attachPointer = (source, sink, options): (() => void) => {
    const target = getWebInputEventTarget(source);
    if (target === null) return noopInputIngressRelease;
    const preventDefault = options?.preventDefault ?? true;
    const onContextMenu = (event: Event) => {
      if (preventDefault) event.preventDefault();
    };
    const onPointerCancel = (event: Event) => {
      if (!sink.isEnabled()) return;
      if (preventDefault) event.preventDefault();
      setWebInputPointerData(_pointerData, event as PointerEvent, 0, 0);
      sink.pointerCancel(_pointerData);
    };
    const onPointerDown = (event: Event) => {
      if (!sink.isEnabled()) return;
      if (preventDefault) event.preventDefault();
      setWebInputPointerData(_pointerData, event as PointerEvent, 0, 0);
      sink.pointerDown(_pointerData);
    };
    const onPointerMove = (event: Event) => {
      if (!sink.isEnabled()) return;
      if (preventDefault) event.preventDefault();
      setWebInputPointerData(_pointerData, event as PointerEvent, 0, 0);
      sink.pointerMove(_pointerData);
    };
    const onPointerUp = (event: Event) => {
      if (!sink.isEnabled()) return;
      if (preventDefault) event.preventDefault();
      setWebInputPointerData(_pointerData, event as PointerEvent, 0, 0);
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
  };
  out.attachRelativePointer = (source, sink, options): (() => void) => {
    const target = getWebInputOwnerDocumentTarget(source);
    if (target === null) return noopInputIngressRelease;
    const preventDefault = options?.preventDefault ?? true;
    const onMouseMove = (event: Event) => {
      if (!sink.isEnabled()) return;
      const mouseEvent = event as MouseEvent;
      if (preventDefault) mouseEvent.preventDefault();
      setWebInputPointerData(_pointerData, mouseEvent, mouseEvent.movementX, mouseEvent.movementY);
      sink.pointerMoveRelative(_pointerData);
    };

    target.addEventListener('mousemove', onMouseMove);
    return () => target.removeEventListener('mousemove', onMouseMove);
  };
  out.attachText = (source, sink): (() => void) => {
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
  };
  out.attachWheel = (source, sink, options): (() => void) => {
    const target = getWebInputEventTarget(source);
    if (target === null) return noopInputIngressRelease;
    const preventDefault = options?.preventDefault ?? true;
    const onWheel = (event: Event) => {
      if (!sink.isEnabled()) return;
      const wheelEvent = event as WheelEvent;
      if (preventDefault) wheelEvent.preventDefault();
      setWebInputPointerData(_pointerData, wheelEvent, wheelEvent.deltaX, wheelEvent.deltaY);
      _pointerData.wheelMode = getWebMouseWheelModeFromWheelEvent(wheelEvent);
      sink.wheel(_pointerData);
    };

    target.addEventListener('wheel', onWheel, { passive: !preventDefault });
    return () => target.removeEventListener('wheel', onWheel);
  };
}

export const webHostInputIngress = createWebInputIngressBackend();

export const webHostInput = {
  dropFile: webHostInputDropFile,
  focus: webHostInputFocus,
  haptics: webHostHaptics,
  ingress: webHostInputIngress,
  pointerLock: webHostInputPointerLock,
  softKeyboardChange: webHostSoftKeyboardChange,
  softKeyboardInfo: webHostSoftKeyboardInfo,
  softKeyboardVisibility: webHostSoftKeyboardVisibility,
  target: webHostInputTarget,
} satisfies HostInputCapabilities;

/** Releases Web pointer capture, tolerating an already-released pointer. */
export function releaseWebInputPointerCapture(element: HTMLElement, pointerId: number): void {
  try {
    element.releasePointerCapture(pointerId);
  } catch {
    // The pointer may have already been released.
  }
}

/** Captures Web pointer events for `pointerId` to `element`. */
export function setWebInputPointerCapture(element: HTMLElement, pointerId: number): void {
  element.setPointerCapture(pointerId);
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

function getWebKeyCodeFromKeyboardCode(code: string, location: number): number {
  if (location === KeyboardEvent.DOM_KEY_LOCATION_NUMPAD && code in numpadKeyCodesByCode) {
    return numpadKeyCodesByCode[code]!;
  }
  return keyCodesByCode[code] ?? KeyCode.UNKNOWN;
}

function getWebPointerTypeFromPointerEvent(event: Readonly<PointerEvent>): InputPointerData['pointerType'] {
  return event.pointerType === 'mouse' || event.pointerType === 'pen' || event.pointerType === 'touch'
    ? event.pointerType
    : 'unknown';
}

function noopInputIngressRelease(): void {}

function setInputGamepadConnectData(out: InputGamepadConnectData, gamepad: Gamepad): void {
  out.gamepad = gamepad.index;
  out.id = gamepad.id;
  out.mapping = gamepad.mapping === 'standard' ? 'standard' : gamepad.mapping === '' ? '' : 'raw';
}

function setWebInputKeyboardData(out: InputKeyboardData, event: KeyboardEvent): void {
  const modifier = getWebKeyModifierFromKeyboardEvent(event);
  out.altKey = event.altKey;
  out.capsLock = (modifier & KeyModifier.CAPS_LOCK) !== 0;
  out.code = event.code;
  out.ctrlKey = event.ctrlKey;
  out.key = event.key;
  out.keyCode = getWebKeyCodeFromKeyboardEvent(event);
  out.location = event.location;
  out.metaKey = event.metaKey;
  out.modifier = modifier;
  out.numLock = (modifier & KeyModifier.NUM_LOCK) !== 0;
  out.repeat = event.repeat;
  out.shiftKey = event.shiftKey;
  out.timeStamp = event.timeStamp;
}

function setWebInputPointerData(
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
  out.pointerType = 'pointerType' in event ? getWebPointerTypeFromPointerEvent(event as PointerEvent) : 'mouse';
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

const _axisData: InputGamepadAxisData = { axis: 0, gamepad: 0, timeStamp: 0, value: 0 };
const _buttonData: InputGamepadButtonData = { button: 0, gamepad: 0, timeStamp: 0, value: 0 };
const _connectData: InputGamepadConnectData = { gamepad: 0, id: '', mapping: '' };
