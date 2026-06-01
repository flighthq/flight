import { connectSignal } from '@flighthq/signals';
import { KeyCode, KeyModifier } from '@flighthq/types';

import {
  attachGamepadInput,
  attachKeyboardInput,
  attachPointerInput,
  attachRelativePointerInput,
  attachTextInput,
  attachWheelInput,
  createInputManager,
  createInputSignals,
  getKeyCodeFromDOMKeyboardEvent,
  getKeyModifierFromDOMKeyboardEvent,
  getMouseWheelModeFromDOMWheelEvent,
  pollGamepadInput,
} from './inputManager';

describe('attachGamepadInput', () => {
  it('emits onGamepadConnect when a gamepad connects', () => {
    const manager = createInputManager();
    attachGamepadInput(manager, window);

    let received: { gamepad: number; id: string } | null = null;
    connectSignal(manager.onGamepadConnect, (data) => {
      received = { gamepad: data.gamepad, id: data.id };
    });

    window.dispatchEvent(createGamepadEvent('gamepadconnected', 0, 'Xbox Controller'));
    expect(received).toEqual({ gamepad: 0, id: 'Xbox Controller' });
  });

  it('emits onGamepadDisconnect when a gamepad disconnects', () => {
    const manager = createInputManager();
    attachGamepadInput(manager, window);

    let received: { gamepad: number } | null = null;
    connectSignal(manager.onGamepadDisconnect, (data) => {
      received = { gamepad: data.gamepad };
    });

    window.dispatchEvent(createGamepadEvent('gamepaddisconnected', 1, 'Generic Gamepad'));
    expect(received).toEqual({ gamepad: 1 });
  });

  it('returns a cleanup function that removes listeners', () => {
    const manager = createInputManager();
    const detach = attachGamepadInput(manager, window);

    let fired = 0;
    connectSignal(manager.onGamepadConnect, () => fired++);

    detach();
    window.dispatchEvent(createGamepadEvent('gamepadconnected', 0, 'Pad'));
    expect(fired).toBe(0);
  });

  it('respects the enabled flag', () => {
    const manager = createInputManager();
    attachGamepadInput(manager, window);

    let fired = 0;
    connectSignal(manager.onGamepadConnect, () => fired++);

    manager.enabled = false;
    window.dispatchEvent(createGamepadEvent('gamepadconnected', 0, 'Pad'));
    expect(fired).toBe(0);
  });
});

describe('attachKeyboardInput', () => {
  it('emits keyboard signals from the configured keyboard target', () => {
    const manager = createInputManager();
    const target = document.createElement('input');
    attachKeyboardInput(manager, target);

    let received = 0;
    connectSignal(manager.onKeyDown, (data) => {
      received = data.keyCode;
    });

    target.dispatchEvent(createKeyboardEvent('keydown', { code: 'KeyA', key: 'A' }));
    expect(received).toBe(KeyCode.A);
  });

  it('returns a cleanup function that removes listeners', () => {
    const manager = createInputManager();
    const target = document.createElement('input');
    const detach = attachKeyboardInput(manager, target);

    let fired = 0;
    connectSignal(manager.onKeyDown, () => fired++);

    detach();
    target.dispatchEvent(createKeyboardEvent('keydown', { code: 'KeyA', key: 'A' }));
    expect(fired).toBe(0);
  });
});

describe('attachPointerInput', () => {
  it('emits pointer signals from the element', () => {
    const manager = createInputManager();
    const element = document.createElement('div');
    attachPointerInput(manager, element);

    let receivedX = 0;
    let receivedY = 0;
    let receivedPointerId = 0;
    connectSignal(manager.onPointerDown, (data) => {
      receivedX = data.x;
      receivedY = data.y;
      receivedPointerId = data.pointerId;
    });

    element.dispatchEvent(createPointerEvent('pointerdown', { clientX: 20, clientY: 30, pointerId: 4 }));
    expect(receivedX).toBe(20);
    expect(receivedY).toBe(30);
    expect(receivedPointerId).toBe(4);
  });

  it('respects the enabled flag', () => {
    const manager = createInputManager();
    const element = document.createElement('div');
    attachPointerInput(manager, element);

    let fired = 0;
    connectSignal(manager.onPointerDown, () => fired++);

    manager.enabled = false;
    element.dispatchEvent(createPointerEvent('pointerdown'));
    expect(fired).toBe(0);
  });

  it('returns a cleanup function that removes listeners', () => {
    const manager = createInputManager();
    const element = document.createElement('div');
    const detach = attachPointerInput(manager, element);

    let fired = 0;
    connectSignal(manager.onPointerDown, () => fired++);

    detach();
    element.dispatchEvent(createPointerEvent('pointerdown'));
    expect(fired).toBe(0);
  });
});

describe('attachRelativePointerInput', () => {
  it('emits onPointerMoveRelative with movement deltas from document mousemove', () => {
    const manager = createInputManager();
    const element = document.createElement('div');
    attachRelativePointerInput(manager, element);

    let receivedDeltaX = 0;
    let receivedDeltaY = 0;
    connectSignal(manager.onPointerMoveRelative, (data) => {
      receivedDeltaX = data.deltaX;
      receivedDeltaY = data.deltaY;
    });

    element.ownerDocument.dispatchEvent(new MouseEvent('mousemove', { movementX: 5, movementY: -3 }));
    expect(receivedDeltaX).toBe(5);
    expect(receivedDeltaY).toBe(-3);
  });

  it('returns a cleanup that removes the listener', () => {
    const manager = createInputManager();
    const element = document.createElement('div');
    const detach = attachRelativePointerInput(manager, element);

    let fired = 0;
    connectSignal(manager.onPointerMoveRelative, () => fired++);

    detach();
    element.ownerDocument.dispatchEvent(new MouseEvent('mousemove'));
    expect(fired).toBe(0);
  });
});

describe('attachTextInput', () => {
  it('emits text input from beforeinput', () => {
    const manager = createInputManager();
    const element = document.createElement('div');
    attachTextInput(manager, element);

    let received = '';
    connectSignal(manager.onTextInput, (data) => {
      received = data.text;
    });

    element.dispatchEvent(createInputEvent('beforeinput', 'x'));
    expect(received).toBe('x');
  });
});

describe('attachWheelInput', () => {
  it('emits wheel signals with deltas and wheel mode', () => {
    const manager = createInputManager();
    const element = document.createElement('div');
    attachWheelInput(manager, element);

    let receivedDeltaY = 0;
    let receivedMode = '';
    connectSignal(manager.onWheel, (data) => {
      receivedDeltaY = data.deltaY;
      receivedMode = data.wheelMode;
    });

    element.dispatchEvent(createWheelEvent({ deltaMode: WheelEvent.DOM_DELTA_LINE, deltaY: -3 }));
    expect(receivedDeltaY).toBe(-3);
    expect(receivedMode).toBe('lines');
  });
});

describe('createInputManager', () => {
  it('creates an enabled manager by default', () => {
    const manager = createInputManager();
    expect(manager.enabled).toBe(true);
    expect(manager.onPointerDown).toBeDefined();
  });

  it('can create a disabled manager', () => {
    const manager = createInputManager();
    manager.enabled = false;
    expect(manager.enabled).toBe(false);
  });
});

describe('createInputSignals', () => {
  it('returns all input signals', () => {
    const signals = createInputSignals();
    expect(signals.onGamepadAxisMove).toBeDefined();
    expect(signals.onGamepadButtonDown).toBeDefined();
    expect(signals.onGamepadButtonUp).toBeDefined();
    expect(signals.onGamepadConnect).toBeDefined();
    expect(signals.onGamepadDisconnect).toBeDefined();
    expect(signals.onKeyDown).toBeDefined();
    expect(signals.onKeyUp).toBeDefined();
    expect(signals.onPointerCancel).toBeDefined();
    expect(signals.onPointerDown).toBeDefined();
    expect(signals.onPointerMove).toBeDefined();
    expect(signals.onPointerMoveRelative).toBeDefined();
    expect(signals.onPointerUp).toBeDefined();
    expect(signals.onTextEdit).toBeDefined();
    expect(signals.onTextInput).toBeDefined();
    expect(signals.onWheel).toBeDefined();
  });

  it('returns a new object each call', () => {
    expect(createInputSignals()).not.toBe(createInputSignals());
  });
});

describe('getKeyCodeFromDOMKeyboardEvent', () => {
  it('maps printable keys to SDL-compatible lower-case codes', () => {
    expect(getKeyCodeFromDOMKeyboardEvent(createKeyboardEvent('keydown', { key: 'A' }))).toBe(KeyCode.A);
  });

  it('maps named keys', () => {
    expect(
      getKeyCodeFromDOMKeyboardEvent(createKeyboardEvent('keydown', { code: 'ArrowLeft', key: 'ArrowLeft' })),
    ).toBe(KeyCode.LEFT);
  });

  it('maps numpad keys by location', () => {
    expect(
      getKeyCodeFromDOMKeyboardEvent(
        createKeyboardEvent('keydown', {
          code: 'Numpad1',
          key: '1',
          location: KeyboardEvent.DOM_KEY_LOCATION_NUMPAD,
        }),
      ),
    ).toBe(KeyCode.NUMPAD_1);
  });
});

describe('getKeyModifierFromDOMKeyboardEvent', () => {
  it('maps DOM modifier flags to Lime-compatible bit flags', () => {
    const modifier = getKeyModifierFromDOMKeyboardEvent(
      createKeyboardEvent('keydown', { ctrlKey: true, shiftKey: true }),
    );
    expect((modifier & KeyModifier.CTRL) !== 0).toBe(true);
    expect((modifier & KeyModifier.SHIFT) !== 0).toBe(true);
  });
});

describe('getMouseWheelModeFromDOMWheelEvent', () => {
  it('maps DOM wheel delta modes', () => {
    expect(getMouseWheelModeFromDOMWheelEvent(createWheelEvent({ deltaMode: WheelEvent.DOM_DELTA_PIXEL }))).toBe(
      'pixels',
    );
    expect(getMouseWheelModeFromDOMWheelEvent(createWheelEvent({ deltaMode: WheelEvent.DOM_DELTA_PAGE }))).toBe(
      'pages',
    );
  });
});

describe('pollGamepadInput', () => {
  beforeEach(() => {
    Object.defineProperty(navigator, 'getGamepads', {
      configurable: true,
      value: () => [],
    });
  });

  it('emits onGamepadButtonDown when a button transitions to pressed', () => {
    const manager = createInputManager();
    const mockPad = { index: 0, axes: [], buttons: [{ pressed: true, value: 1, touched: true }] } as unknown as Gamepad;
    vi.spyOn(navigator, 'getGamepads').mockReturnValue([mockPad, null, null, null]);

    let received: { button: number; gamepad: number } | null = null;
    connectSignal(manager.onGamepadButtonDown, (data) => {
      received = { button: data.button, gamepad: data.gamepad };
    });

    pollGamepadInput(manager);
    expect(received).toEqual({ button: 0, gamepad: 0 });
  });

  it('does not emit when state is unchanged', () => {
    const manager = createInputManager();
    const mockPad = { index: 0, axes: [], buttons: [{ pressed: true, value: 1, touched: true }] } as unknown as Gamepad;
    vi.spyOn(navigator, 'getGamepads').mockReturnValue([mockPad, null, null, null]);

    pollGamepadInput(manager);

    let fired = 0;
    connectSignal(manager.onGamepadButtonDown, () => fired++);
    pollGamepadInput(manager);
    expect(fired).toBe(0);
  });
});

function createInputEvent(type: string, data: string): InputEvent {
  return new InputEvent(type, { bubbles: true, data });
}

function createKeyboardEvent(type: string, options: KeyboardEventInit = {}): KeyboardEvent {
  return new KeyboardEvent(type, {
    bubbles: true,
    cancelable: true,
    ...options,
  });
}

function createPointerEvent(type: string, options: Partial<PointerEvent> = {}): PointerEvent {
  const event = new Event(type, { bubbles: true, cancelable: true }) as PointerEvent;
  Object.defineProperties(event, {
    altKey: { value: options.altKey ?? false },
    button: { value: options.button ?? 0 },
    buttons: { value: options.buttons ?? 1 },
    clientX: { value: options.clientX ?? 0 },
    clientY: { value: options.clientY ?? 0 },
    ctrlKey: { value: options.ctrlKey ?? false },
    isPrimary: { value: options.isPrimary ?? true },
    metaKey: { value: options.metaKey ?? false },
    pointerId: { value: options.pointerId ?? 0 },
    pointerType: { value: options.pointerType ?? 'mouse' },
    shiftKey: { value: options.shiftKey ?? false },
  });
  return event;
}

function createWheelEvent(options: WheelEventInit = {}): WheelEvent {
  return new WheelEvent('wheel', {
    bubbles: true,
    cancelable: true,
    clientX: 0,
    clientY: 0,
    deltaX: 0,
    deltaY: 0,
    ...options,
  });
}

function createGamepadEvent(type: string, index: number, id: string): Event {
  const event = new Event(type, { bubbles: false }) as GamepadEvent;
  const gamepad = {
    axes: [],
    buttons: [],
    connected: true,
    id,
    index,
    mapping: 'standard',
    timestamp: 0,
  } as unknown as Gamepad;
  Object.defineProperty(event, 'gamepad', { value: gamepad });
  return event;
}
