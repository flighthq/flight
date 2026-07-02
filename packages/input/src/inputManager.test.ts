import { connectSignal } from '@flighthq/signals';
import type { InputGamepadButtonData, InputPointerData } from '@flighthq/types';
import { GamepadAxisKind, GamepadButtonKind, KeyCode, KeyModifier } from '@flighthq/types';

import {
  applyGamepadAxisDeadZone,
  applyGamepadStickDeadZone,
  attachGamepadInput,
  attachKeyboardInput,
  attachPointerInput,
  attachRelativePointerInput,
  attachTextInput,
  attachWheelInput,
  connectInputStateToInputManager,
  createInputKeyRepeatTimer,
  createInputManager,
  createInputSignals,
  createInputState,
  detachGamepadInput,
  detachKeyboardInput,
  detachPointerInput,
  detachRelativePointerInput,
  detachTextInput,
  detachWheelInput,
  endInputStateFrame,
  exitInputPointerLock,
  getCoalescedInputPointerEvents,
  getGamepadAxisName,
  getGamepadButtonName,
  getInputGamepadAxis,
  getKeyCodeFromDomKeyboardEvent,
  getKeyModifierFromDomKeyboardEvent,
  getMouseWheelModeFromDomWheelEvent,
  hasInputPointerLock,
  isInputGamepadButtonDown,
  isInputKeyDown,
  isInputPointerButtonDown,
  pollGamepadInput,
  releaseInputPointerCapture,
  requestInputPointerLock,
  setInputPointerCapture,
  wasInputGamepadButtonPressed,
  wasInputGamepadButtonReleased,
  wasInputKeyPressed,
  wasInputKeyReleased,
} from './inputManager';

describe('applyGamepadAxisDeadZone', () => {
  it('returns 0 when value is within the dead zone', () => {
    expect(applyGamepadAxisDeadZone(0.1, 0.2)).toBe(0);
    expect(applyGamepadAxisDeadZone(-0.1, 0.2)).toBe(0);
  });

  it('rescales positive values above the dead zone to (0, 1]', () => {
    const result = applyGamepadAxisDeadZone(1.0, 0.2);
    expect(result).toBeCloseTo(1.0);
  });

  it('rescales negative values below the dead zone to [-1, 0)', () => {
    const result = applyGamepadAxisDeadZone(-1.0, 0.2);
    expect(result).toBeCloseTo(-1.0);
  });

  it('returns the raw value when deadZone is 0', () => {
    expect(applyGamepadAxisDeadZone(0.5, 0)).toBe(0.5);
  });

  it('is alias-safe (result is based on input, not out)', () => {
    // pure function — no mutation concern, but verify correctness for a midpoint value
    const mid = applyGamepadAxisDeadZone(0.6, 0.2);
    expect(mid).toBeGreaterThan(0);
    expect(mid).toBeLessThan(1);
  });
});

describe('applyGamepadStickDeadZone', () => {
  it('outputs (0, 0) when magnitude is within dead zone', () => {
    const out = { x: 0, y: 0 };
    applyGamepadStickDeadZone(out, 0.1, 0.1, 0.2);
    expect(out.x).toBe(0);
    expect(out.y).toBe(0);
  });

  it('preserves direction and rescales magnitude to 1 at full deflection', () => {
    const out = { x: 0, y: 0 };
    applyGamepadStickDeadZone(out, 1.0, 0.0, 0.2);
    expect(out.x).toBeCloseTo(1.0);
    expect(out.y).toBeCloseTo(0.0);
  });

  it('is alias-safe when out is the same object as input coords', () => {
    const out = { x: 0.8, y: 0.0 };
    applyGamepadStickDeadZone(out, out.x, out.y, 0.2);
    expect(out.x).toBeGreaterThan(0);
    expect(out.y).toBeCloseTo(0);
  });

  it('passes through when deadZone is 0', () => {
    const out = { x: 0, y: 0 };
    applyGamepadStickDeadZone(out, 0.3, 0.4, 0);
    expect(out.x).toBe(0.3);
    expect(out.y).toBe(0.4);
  });
});

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

  it('populates timeStamp on keyboard data', () => {
    const manager = createInputManager();
    const target = document.createElement('input');
    attachKeyboardInput(manager, target);

    let receivedTimeStamp = -1;
    connectSignal(manager.onKeyDown, (data) => {
      receivedTimeStamp = data.timeStamp;
    });

    target.dispatchEvent(createKeyboardEvent('keydown', { code: 'KeyA', key: 'A' }));
    expect(receivedTimeStamp).toBeGreaterThanOrEqual(0);
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

  it('populates pressure and tilt on pointer data', () => {
    const manager = createInputManager();
    const element = document.createElement('div');
    attachPointerInput(manager, element);

    let receivedPressure = -1;
    let receivedTiltX = -1;
    connectSignal(manager.onPointerDown, (data) => {
      receivedPressure = data.pressure;
      receivedTiltX = data.tiltX;
    });

    element.dispatchEvent(createPointerEvent('pointerdown', { pressure: 0.5, tiltX: 10 }));
    expect(receivedPressure).toBe(0.5);
    expect(receivedTiltX).toBe(10);
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
    detachRelativePointerInput(manager, element);
  });

  it('populates the canonical pointer fields routed through the shared writer', () => {
    const manager = createInputManager();
    const element = document.createElement('div');
    attachRelativePointerInput(manager, element);

    let received: Readonly<InputPointerData> | null = null;
    connectSignal(manager.onPointerMoveRelative, (data) => {
      received = { ...data };
    });

    element.ownerDocument.dispatchEvent(
      new MouseEvent('mousemove', { clientX: 7, clientY: 9, ctrlKey: true, movementX: 2, movementY: 4 }),
    );
    expect(received).not.toBeNull();
    const data = received!;
    expect(data.x).toBe(7);
    expect(data.y).toBe(9);
    expect(data.ctrlKey).toBe(true);
    expect(data.pointerType).toBe('mouse');
    expect(data.isPrimary).toBe(true);
    expect(data.width).toBe(1);
    expect(data.height).toBe(1);
    expect(data.wheelMode).toBe('unknown');
    detachRelativePointerInput(manager, element);
  });

  it('honors preventDefault from options', () => {
    const manager = createInputManager();
    const element = document.createElement('div');
    attachRelativePointerInput(manager, element, { preventDefault: true });

    const event = new MouseEvent('mousemove', { cancelable: true });
    element.ownerDocument.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(true);
    detachRelativePointerInput(manager, element);
  });

  it('leaves the event un-prevented when preventDefault is false', () => {
    const manager = createInputManager();
    const element = document.createElement('div');
    attachRelativePointerInput(manager, element, { preventDefault: false });

    const event = new MouseEvent('mousemove', { cancelable: true });
    element.ownerDocument.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(false);
    detachRelativePointerInput(manager, element);
  });

  it('respects the enabled flag', () => {
    const manager = createInputManager();
    const element = document.createElement('div');
    attachRelativePointerInput(manager, element);

    let fired = 0;
    connectSignal(manager.onPointerMoveRelative, () => fired++);

    manager.enabled = false;
    element.ownerDocument.dispatchEvent(new MouseEvent('mousemove'));
    expect(fired).toBe(0);
    detachRelativePointerInput(manager, element);
  });
});

describe('attachTextInput', () => {
  it('emits text input from beforeinput with isComposing false', () => {
    const manager = createInputManager();
    const element = document.createElement('div');
    attachTextInput(manager, element);

    let received = '';
    let receivedComposing = true;
    connectSignal(manager.onTextInput, (data) => {
      received = data.text;
      receivedComposing = data.isComposing;
    });

    element.dispatchEvent(createInputEvent('beforeinput', 'x'));
    expect(received).toBe('x');
    expect(receivedComposing).toBe(false);
  });

  it('emits text edit from compositionupdate with isComposing true', () => {
    const manager = createInputManager();
    const element = document.createElement('div');
    attachTextInput(manager, element);

    let receivedComposing = false;
    connectSignal(manager.onTextEdit, (data) => {
      receivedComposing = data.isComposing;
    });

    element.dispatchEvent(new CompositionEvent('compositionupdate', { data: 'hi' }));
    expect(receivedComposing).toBe(true);
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

describe('connectInputStateToInputManager', () => {
  beforeEach(() => {
    Object.defineProperty(navigator, 'getGamepads', {
      configurable: true,
      value: () => [],
    });
  });

  it('tracks held keys via isInputKeyDown', () => {
    const manager = createInputManager();
    const target = document.createElement('input');
    attachKeyboardInput(manager, target);
    const state = createInputState();
    connectInputStateToInputManager(state, manager);

    target.dispatchEvent(createKeyboardEvent('keydown', { code: 'KeyA', key: 'a' }));
    expect(isInputKeyDown(state, KeyCode.A)).toBe(true);

    target.dispatchEvent(createKeyboardEvent('keyup', { code: 'KeyA', key: 'a' }));
    expect(isInputKeyDown(state, KeyCode.A)).toBe(false);
  });

  it('tracks held pointer buttons via isInputPointerButtonDown', () => {
    const manager = createInputManager();
    const element = document.createElement('div');
    attachPointerInput(manager, element);
    const state = createInputState();
    connectInputStateToInputManager(state, manager);

    element.dispatchEvent(createPointerEvent('pointerdown', { pointerId: 1, button: 0, buttons: 1 }));
    expect(isInputPointerButtonDown(state, 1, 0)).toBe(true);

    element.dispatchEvent(createPointerEvent('pointerup', { pointerId: 1, button: 0, buttons: 0 }));
    expect(isInputPointerButtonDown(state, 1, 0)).toBe(false);
  });

  it('clears pointer state on pointercancel', () => {
    const manager = createInputManager();
    const element = document.createElement('div');
    attachPointerInput(manager, element);
    const state = createInputState();
    connectInputStateToInputManager(state, manager);

    element.dispatchEvent(createPointerEvent('pointerdown', { pointerId: 2, button: 0, buttons: 1 }));
    expect(isInputPointerButtonDown(state, 2, 0)).toBe(true);

    element.dispatchEvent(createPointerEvent('pointercancel', { pointerId: 2, button: 0, buttons: 0 }));
    expect(isInputPointerButtonDown(state, 2, 0)).toBe(false);
  });

  it('tracks gamepad button state via isInputGamepadButtonDown', () => {
    const manager = createInputManager();
    const state = createInputState();
    connectInputStateToInputManager(state, manager);

    const mockPad = {
      axes: [],
      buttons: [{ pressed: true, value: 1, touched: true }],
      index: 0,
    } as unknown as Gamepad;
    vi.spyOn(navigator, 'getGamepads').mockReturnValue([mockPad, null, null, null]);

    pollGamepadInput(manager);
    expect(isInputGamepadButtonDown(state, 0, 0)).toBe(true);

    const mockPadReleased = {
      axes: [],
      buttons: [{ pressed: false, value: 0, touched: false }],
      index: 0,
    } as unknown as Gamepad;
    vi.spyOn(navigator, 'getGamepads').mockReturnValue([mockPadReleased, null, null, null]);

    pollGamepadInput(manager);
    expect(isInputGamepadButtonDown(state, 0, 0)).toBe(false);
  });

  it('tracks gamepad axis values via getInputGamepadAxis', () => {
    const manager = createInputManager();
    const state = createInputState();
    connectInputStateToInputManager(state, manager);

    const mockPad = {
      axes: [0.75],
      buttons: [],
      index: 0,
    } as unknown as Gamepad;
    vi.spyOn(navigator, 'getGamepads').mockReturnValue([mockPad, null, null, null]);

    pollGamepadInput(manager);
    expect(getInputGamepadAxis(state, 0, 0)).toBe(0.75);
  });

  it('returns a disposer that stops tracking', () => {
    const manager = createInputManager();
    const target = document.createElement('input');
    attachKeyboardInput(manager, target);
    const state = createInputState();
    const dispose = connectInputStateToInputManager(state, manager);

    target.dispatchEvent(createKeyboardEvent('keydown', { code: 'KeyA', key: 'a' }));
    expect(isInputKeyDown(state, KeyCode.A)).toBe(true);

    target.dispatchEvent(createKeyboardEvent('keyup', { code: 'KeyA', key: 'a' }));
    dispose();

    // After dispose, subsequent events should not update state.
    target.dispatchEvent(createKeyboardEvent('keydown', { code: 'KeyA', key: 'a' }));
    expect(isInputKeyDown(state, KeyCode.A)).toBe(false);
  });
});

describe('createInputKeyRepeatTimer', () => {
  it('invokes callback immediately on start', () => {
    vi.useFakeTimers();
    const timer = createInputKeyRepeatTimer({ delay: 500, interval: 33 });
    let count = 0;
    timer.start(() => count++);
    expect(count).toBe(1);
    vi.useRealTimers();
  });

  it('fires repeat after delay and interval', () => {
    vi.useFakeTimers();
    const timer = createInputKeyRepeatTimer({ delay: 500, interval: 100 });
    let count = 0;
    timer.start(() => count++);
    expect(count).toBe(1); // immediate
    vi.advanceTimersByTime(500);
    expect(count).toBe(2); // after delay
    vi.advanceTimersByTime(100);
    expect(count).toBe(3); // after first interval
    vi.advanceTimersByTime(100);
    expect(count).toBe(4); // after second interval
    timer.stop();
    vi.useRealTimers();
  });

  it('stops repeating after stop()', () => {
    vi.useFakeTimers();
    const timer = createInputKeyRepeatTimer({ delay: 500, interval: 100 });
    let count = 0;
    timer.start(() => count++);
    vi.advanceTimersByTime(500);
    timer.stop();
    const countAfterStop = count;
    vi.advanceTimersByTime(500);
    expect(count).toBe(countAfterStop);
    vi.useRealTimers();
  });

  it('can be restarted after stop', () => {
    vi.useFakeTimers();
    const timer = createInputKeyRepeatTimer({ delay: 500, interval: 100 });
    let count = 0;
    timer.start(() => count++);
    timer.stop();
    timer.start(() => count++);
    expect(count).toBe(2); // two immediate fires
    vi.useRealTimers();
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

describe('createInputState', () => {
  it('creates state with empty collections including frame-edge sets', () => {
    const state = createInputState();
    expect(state.keysDown.size).toBe(0);
    expect(state.pointerButtonsDown.size).toBe(0);
    expect(state.gamepadButtonsDown.size).toBe(0);
    expect(state.axisValues.size).toBe(0);
    expect(state.justPressedKeys.size).toBe(0);
    expect(state.justReleasedKeys.size).toBe(0);
    expect(state.justPressedGamepadButtons.size).toBe(0);
    expect(state.justReleasedGamepadButtons.size).toBe(0);
  });
});

describe('detachGamepadInput', () => {
  it('removes listeners so signals stop firing', () => {
    const manager = createInputManager();
    attachGamepadInput(manager, window);

    let fired = 0;
    connectSignal(manager.onGamepadConnect, () => fired++);

    detachGamepadInput(manager, window);
    window.dispatchEvent(createGamepadEvent('gamepadconnected', 0, 'Pad'));
    expect(fired).toBe(0);
  });

  it('is a no-op when nothing is attached', () => {
    const manager = createInputManager();
    expect(() => detachGamepadInput(manager, window)).not.toThrow();
  });
});

describe('detachKeyboardInput', () => {
  it('removes listeners so signals stop firing', () => {
    const manager = createInputManager();
    const target = document.createElement('input');
    attachKeyboardInput(manager, target);

    let fired = 0;
    connectSignal(manager.onKeyDown, () => fired++);

    detachKeyboardInput(manager, target);
    target.dispatchEvent(createKeyboardEvent('keydown', { code: 'KeyA', key: 'A' }));
    expect(fired).toBe(0);
  });
});

describe('detachPointerInput', () => {
  it('removes listeners so signals stop firing', () => {
    const manager = createInputManager();
    const element = document.createElement('div');
    attachPointerInput(manager, element);

    let fired = 0;
    connectSignal(manager.onPointerDown, () => fired++);

    detachPointerInput(manager, element);
    element.dispatchEvent(createPointerEvent('pointerdown'));
    expect(fired).toBe(0);
  });

  it('detaches one target without affecting another bound to the same manager', () => {
    const manager = createInputManager();
    const first = document.createElement('div');
    const second = document.createElement('div');
    attachPointerInput(manager, first);
    attachPointerInput(manager, second);

    let fired = 0;
    connectSignal(manager.onPointerDown, () => fired++);

    detachPointerInput(manager, first);
    first.dispatchEvent(createPointerEvent('pointerdown'));
    expect(fired).toBe(0);
    second.dispatchEvent(createPointerEvent('pointerdown'));
    expect(fired).toBe(1);
  });
});

describe('detachRelativePointerInput', () => {
  it('removes the listener so signals stop firing', () => {
    const manager = createInputManager();
    const element = document.createElement('div');
    attachRelativePointerInput(manager, element);

    let fired = 0;
    connectSignal(manager.onPointerMoveRelative, () => fired++);

    detachRelativePointerInput(manager, element);
    element.ownerDocument.dispatchEvent(new MouseEvent('mousemove'));
    expect(fired).toBe(0);
  });
});

describe('detachTextInput', () => {
  it('removes listeners so signals stop firing', () => {
    const manager = createInputManager();
    const element = document.createElement('div');
    attachTextInput(manager, element);

    let fired = 0;
    connectSignal(manager.onTextInput, () => fired++);

    detachTextInput(manager, element);
    element.dispatchEvent(createInputEvent('beforeinput', 'x'));
    expect(fired).toBe(0);
  });
});

describe('detachWheelInput', () => {
  it('removes listeners so signals stop firing', () => {
    const manager = createInputManager();
    const element = document.createElement('div');
    attachWheelInput(manager, element);

    let fired = 0;
    connectSignal(manager.onWheel, () => fired++);

    detachWheelInput(manager, element);
    element.dispatchEvent(createWheelEvent({ deltaMode: WheelEvent.DOM_DELTA_LINE, deltaY: -3 }));
    expect(fired).toBe(0);
  });
});

describe('endInputStateFrame', () => {
  it('clears all frame-edge sets', () => {
    const manager = createInputManager();
    const target = document.createElement('input');
    attachKeyboardInput(manager, target);
    const state = createInputState();
    connectInputStateToInputManager(state, manager);

    target.dispatchEvent(createKeyboardEvent('keydown', { code: 'KeyA', key: 'a' }));
    expect(state.justPressedKeys.size).toBe(1);

    endInputStateFrame(state);
    expect(state.justPressedKeys.size).toBe(0);
    expect(state.justReleasedKeys.size).toBe(0);
    expect(state.justPressedGamepadButtons.size).toBe(0);
    expect(state.justReleasedGamepadButtons.size).toBe(0);
  });

  it('does not affect held-state sets', () => {
    const manager = createInputManager();
    const target = document.createElement('input');
    attachKeyboardInput(manager, target);
    const state = createInputState();
    connectInputStateToInputManager(state, manager);

    target.dispatchEvent(createKeyboardEvent('keydown', { code: 'KeyA', key: 'a' }));
    endInputStateFrame(state);
    // Key is still held even after frame roll
    expect(state.keysDown.has(KeyCode.A)).toBe(true);
  });
});

describe('exitInputPointerLock', () => {
  it('calls document.exitPointerLock when available', () => {
    let called = false;
    Object.defineProperty(document, 'exitPointerLock', {
      configurable: true,
      value: () => {
        called = true;
      },
    });
    exitInputPointerLock();
    expect(called).toBe(true);
  });
});

describe('getCoalescedInputPointerEvents', () => {
  it('falls back to a single event when getCoalescedEvents is unavailable', () => {
    const event = createPointerEvent('pointermove', { clientX: 10, clientY: 20 });
    const received: number[] = [];
    getCoalescedInputPointerEvents(event, (data) => {
      received.push(data.x);
    });
    expect(received).toEqual([10]);
  });

  it('iterates coalesced events when available', () => {
    const coalesced = [
      createPointerEvent('pointermove', { clientX: 1, clientY: 0 }),
      createPointerEvent('pointermove', { clientX: 2, clientY: 0 }),
    ];
    const event = createPointerEvent('pointermove', { clientX: 3, clientY: 0 });
    Object.defineProperty(event, 'getCoalescedEvents', {
      value: () => coalesced,
    });
    const received: number[] = [];
    getCoalescedInputPointerEvents(event, (data) => {
      received.push(data.x);
    });
    expect(received).toEqual([1, 2]);
  });
});

describe('getGamepadAxisName', () => {
  it('returns the semantic axis name for a standard mapping', () => {
    expect(getGamepadAxisName('standard', 0)).toBe(GamepadAxisKind.STICK_LEFT_X);
    expect(getGamepadAxisName('standard', 1)).toBe(GamepadAxisKind.STICK_LEFT_Y);
    expect(getGamepadAxisName('standard', 2)).toBe(GamepadAxisKind.STICK_RIGHT_X);
    expect(getGamepadAxisName('standard', 3)).toBe(GamepadAxisKind.STICK_RIGHT_Y);
  });

  it('returns null for non-standard mapping', () => {
    expect(getGamepadAxisName('raw', 0)).toBeNull();
    expect(getGamepadAxisName('', 0)).toBeNull();
  });

  it('returns null for an out-of-range index', () => {
    expect(getGamepadAxisName('standard', 99)).toBeNull();
  });
});

describe('getGamepadButtonName', () => {
  it('returns the semantic button name for a standard mapping', () => {
    expect(getGamepadButtonName('standard', 0)).toBe(GamepadButtonKind.BUTTON_SOUTH);
    expect(getGamepadButtonName('standard', 12)).toBe(GamepadButtonKind.DPAD_UP);
    expect(getGamepadButtonName('standard', 16)).toBe(GamepadButtonKind.HOME);
  });

  it('returns null for non-standard mapping', () => {
    expect(getGamepadButtonName('raw', 0)).toBeNull();
    expect(getGamepadButtonName('', 0)).toBeNull();
  });

  it('returns null for an out-of-range index', () => {
    expect(getGamepadButtonName('standard', 99)).toBeNull();
  });
});

describe('getInputGamepadAxis', () => {
  it('returns 0 for an unknown gamepad/axis combination', () => {
    const state = createInputState();
    expect(getInputGamepadAxis(state, 0, 0)).toBe(0);
  });
});

describe('getKeyCodeFromDomKeyboardEvent', () => {
  it('maps printable keys to SDL-compatible lower-case codes', () => {
    expect(getKeyCodeFromDomKeyboardEvent(createKeyboardEvent('keydown', { key: 'A' }))).toBe(KeyCode.A);
  });

  it('maps named keys', () => {
    expect(
      getKeyCodeFromDomKeyboardEvent(createKeyboardEvent('keydown', { code: 'ArrowLeft', key: 'ArrowLeft' })),
    ).toBe(KeyCode.LEFT);
  });

  it('maps numpad keys by location', () => {
    expect(
      getKeyCodeFromDomKeyboardEvent(
        createKeyboardEvent('keydown', {
          code: 'Numpad1',
          key: '1',
          location: KeyboardEvent.DOM_KEY_LOCATION_NUMPAD,
        }),
      ),
    ).toBe(KeyCode.NUMPAD_1);
  });

  it.each([
    ['Again', KeyCode.AGAIN],
    ['Copy', KeyCode.COPY],
    ['Cut', KeyCode.CUT],
    ['Undo', KeyCode.UNDO],
  ])('maps editing code %s', (code, expected) => {
    expect(getKeyCodeFromDomKeyboardEvent(createKeyboardEvent('keydown', { code, key: '' }))).toBe(expected);
  });

  it.each([
    ['NumpadBackspace', KeyCode.NUMPAD_BACKSPACE],
    ['NumpadClear', KeyCode.NUMPAD_CLEAR],
    ['NumpadClearEntry', KeyCode.NUMPAD_CLEAR_ENTRY],
    ['NumpadComma', KeyCode.NUMPAD_COMMA],
    ['NumpadHash', KeyCode.NUMPAD_HASH],
    ['NumpadMemoryAdd', KeyCode.NUMPAD_MEM_ADD],
    ['NumpadMemoryClear', KeyCode.NUMPAD_MEM_CLEAR],
    ['NumpadMemoryRecall', KeyCode.NUMPAD_MEM_RECALL],
    ['NumpadMemoryStore', KeyCode.NUMPAD_MEM_STORE],
    ['NumpadMemorySubtract', KeyCode.NUMPAD_MEM_SUBTRACT],
    ['NumpadParenLeft', KeyCode.NUMPAD_LEFT_PARENTHESIS],
    ['NumpadParenRight', KeyCode.NUMPAD_RIGHT_PARENTHESIS],
  ])('maps numpad code %s by location', (code, expected) => {
    expect(
      getKeyCodeFromDomKeyboardEvent(
        createKeyboardEvent('keydown', { code, key: '', location: KeyboardEvent.DOM_KEY_LOCATION_NUMPAD }),
      ),
    ).toBe(expected);
  });
});

describe('getKeyModifierFromDomKeyboardEvent', () => {
  it('maps DOM modifier flags to Lime-compatible bit flags', () => {
    const modifier = getKeyModifierFromDomKeyboardEvent(
      createKeyboardEvent('keydown', { ctrlKey: true, shiftKey: true }),
    );
    expect((modifier & KeyModifier.CTRL) !== 0).toBe(true);
    expect((modifier & KeyModifier.SHIFT) !== 0).toBe(true);
  });
});

describe('getMouseWheelModeFromDomWheelEvent', () => {
  it('maps DOM wheel delta modes', () => {
    expect(getMouseWheelModeFromDomWheelEvent(createWheelEvent({ deltaMode: WheelEvent.DOM_DELTA_PIXEL }))).toBe(
      'pixels',
    );
    expect(getMouseWheelModeFromDomWheelEvent(createWheelEvent({ deltaMode: WheelEvent.DOM_DELTA_PAGE }))).toBe(
      'pages',
    );
  });
});

describe('hasInputPointerLock', () => {
  it('returns false when no element is pointer-locked', () => {
    Object.defineProperty(document, 'pointerLockElement', {
      configurable: true,
      get: () => null,
    });
    expect(hasInputPointerLock()).toBe(false);
  });

  it('returns true when an element holds the pointer lock', () => {
    const element = document.createElement('div');
    Object.defineProperty(document, 'pointerLockElement', {
      configurable: true,
      get: () => element,
    });
    expect(hasInputPointerLock()).toBe(true);
    // Restore
    Object.defineProperty(document, 'pointerLockElement', {
      configurable: true,
      get: () => null,
    });
  });
});

describe('isInputGamepadButtonDown', () => {
  it('returns false for an unknown gamepad/button combination', () => {
    const state = createInputState();
    expect(isInputGamepadButtonDown(state, 0, 0)).toBe(false);
  });
});

describe('isInputKeyDown', () => {
  it('returns false when no keys are held', () => {
    const state = createInputState();
    expect(isInputKeyDown(state, KeyCode.A)).toBe(false);
  });
});

describe('isInputPointerButtonDown', () => {
  it('returns false when no buttons are held', () => {
    const state = createInputState();
    expect(isInputPointerButtonDown(state, 0, 0)).toBe(false);
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
    const mockPad = { axes: [], buttons: [{ pressed: true, touched: true, value: 1 }], index: 0 } as unknown as Gamepad;
    vi.spyOn(navigator, 'getGamepads').mockReturnValue([mockPad, null, null, null]);

    let received: { button: number; gamepad: number } | null = null;
    connectSignal(manager.onGamepadButtonDown, (data: Readonly<InputGamepadButtonData>) => {
      received = { button: data.button, gamepad: data.gamepad };
    });

    pollGamepadInput(manager);
    expect(received).toEqual({ button: 0, gamepad: 0 });
  });

  it('populates timeStamp on gamepad button data', () => {
    const manager = createInputManager();
    const mockPad = { axes: [], buttons: [{ pressed: true, touched: true, value: 1 }], index: 0 } as unknown as Gamepad;
    vi.spyOn(navigator, 'getGamepads').mockReturnValue([mockPad, null, null, null]);

    let receivedTimeStamp = -1;
    connectSignal(manager.onGamepadButtonDown, (data: Readonly<InputGamepadButtonData>) => {
      receivedTimeStamp = data.timeStamp;
    });

    pollGamepadInput(manager);
    expect(receivedTimeStamp).toBeGreaterThanOrEqual(0);
  });

  it('does not emit when state is unchanged', () => {
    const manager = createInputManager();
    const mockPad = { axes: [], buttons: [{ pressed: true, touched: true, value: 1 }], index: 0 } as unknown as Gamepad;
    vi.spyOn(navigator, 'getGamepads').mockReturnValue([mockPad, null, null, null]);

    pollGamepadInput(manager);

    let fired = 0;
    connectSignal(manager.onGamepadButtonDown, () => fired++);
    pollGamepadInput(manager);
    expect(fired).toBe(0);
  });
});

describe('releaseInputPointerCapture', () => {
  it('calls releasePointerCapture on the element', () => {
    const element = document.createElement('div');
    let capturedId = -1;
    element.releasePointerCapture = (id) => {
      capturedId = id;
    };
    releaseInputPointerCapture(element, 5);
    expect(capturedId).toBe(5);
  });

  it('does not throw when the pointer was already released', () => {
    const element = document.createElement('div');
    element.releasePointerCapture = () => {
      throw new DOMException('No pointer');
    };
    expect(() => releaseInputPointerCapture(element, 0)).not.toThrow();
  });
});

describe('requestInputPointerLock', () => {
  it('resolves to true when requestPointerLock succeeds synchronously', async () => {
    const element = document.createElement('div');
    // Cast: synchronous void return is valid per the spec (older browsers), but the
    // TypeScript lib types it as Promise<void>; the double cast handles the overlap check.
    element.requestPointerLock = (() => undefined) as unknown as () => Promise<void>;
    const result = await requestInputPointerLock(element);
    expect(result).toBe(true);
  });

  it('resolves to true when requestPointerLock returns a resolving Promise', async () => {
    const element = document.createElement('div');
    element.requestPointerLock = () => Promise.resolve();
    const result = await requestInputPointerLock(element);
    expect(result).toBe(true);
  });

  it('resolves to false when requestPointerLock throws', async () => {
    const element = document.createElement('div');
    element.requestPointerLock = () => {
      throw new Error('Not allowed');
    };
    const result = await requestInputPointerLock(element);
    expect(result).toBe(false);
  });
});

describe('setInputPointerCapture', () => {
  it('calls setPointerCapture on the element', () => {
    const element = document.createElement('div');
    let capturedId = -1;
    element.setPointerCapture = (id) => {
      capturedId = id;
    };
    setInputPointerCapture(element, 7);
    expect(capturedId).toBe(7);
  });
});

describe('wasInputGamepadButtonPressed', () => {
  beforeEach(() => {
    Object.defineProperty(navigator, 'getGamepads', {
      configurable: true,
      value: () => [],
    });
  });

  it('returns true when a button was pressed this frame', () => {
    const manager = createInputManager();
    const state = createInputState();
    connectInputStateToInputManager(state, manager);

    const mockPad = { axes: [], buttons: [{ pressed: true, touched: true, value: 1 }], index: 0 } as unknown as Gamepad;
    vi.spyOn(navigator, 'getGamepads').mockReturnValue([mockPad, null, null, null]);
    pollGamepadInput(manager);

    expect(wasInputGamepadButtonPressed(state, 0, 0)).toBe(true);
  });

  it('returns false after endInputStateFrame', () => {
    const manager = createInputManager();
    const state = createInputState();
    connectInputStateToInputManager(state, manager);

    const mockPad = { axes: [], buttons: [{ pressed: true, touched: true, value: 1 }], index: 0 } as unknown as Gamepad;
    vi.spyOn(navigator, 'getGamepads').mockReturnValue([mockPad, null, null, null]);
    pollGamepadInput(manager);
    endInputStateFrame(state);

    expect(wasInputGamepadButtonPressed(state, 0, 0)).toBe(false);
  });
});

describe('wasInputGamepadButtonReleased', () => {
  beforeEach(() => {
    Object.defineProperty(navigator, 'getGamepads', {
      configurable: true,
      value: () => [],
    });
  });

  it('returns true when a button was released this frame', () => {
    const manager = createInputManager();
    const state = createInputState();
    connectInputStateToInputManager(state, manager);

    // Press the button first
    const mockPadDown = {
      axes: [],
      buttons: [{ pressed: true, touched: true, value: 1 }],
      index: 0,
    } as unknown as Gamepad;
    vi.spyOn(navigator, 'getGamepads').mockReturnValue([mockPadDown, null, null, null]);
    pollGamepadInput(manager);
    endInputStateFrame(state);

    // Release it
    const mockPadUp = {
      axes: [],
      buttons: [{ pressed: false, touched: false, value: 0 }],
      index: 0,
    } as unknown as Gamepad;
    vi.spyOn(navigator, 'getGamepads').mockReturnValue([mockPadUp, null, null, null]);
    pollGamepadInput(manager);

    expect(wasInputGamepadButtonReleased(state, 0, 0)).toBe(true);
  });
});

describe('wasInputKeyPressed', () => {
  it('returns true when a key was pressed this frame', () => {
    const manager = createInputManager();
    const target = document.createElement('input');
    attachKeyboardInput(manager, target);
    const state = createInputState();
    connectInputStateToInputManager(state, manager);

    target.dispatchEvent(createKeyboardEvent('keydown', { code: 'KeyA', key: 'a' }));
    expect(wasInputKeyPressed(state, KeyCode.A)).toBe(true);
  });

  it('returns false when key was not pressed this frame', () => {
    const state = createInputState();
    expect(wasInputKeyPressed(state, KeyCode.A)).toBe(false);
  });

  it('returns false after endInputStateFrame', () => {
    const manager = createInputManager();
    const target = document.createElement('input');
    attachKeyboardInput(manager, target);
    const state = createInputState();
    connectInputStateToInputManager(state, manager);

    target.dispatchEvent(createKeyboardEvent('keydown', { code: 'KeyA', key: 'a' }));
    endInputStateFrame(state);
    expect(wasInputKeyPressed(state, KeyCode.A)).toBe(false);
  });
});

describe('wasInputKeyReleased', () => {
  it('returns true when a key was released this frame', () => {
    const manager = createInputManager();
    const target = document.createElement('input');
    attachKeyboardInput(manager, target);
    const state = createInputState();
    connectInputStateToInputManager(state, manager);

    target.dispatchEvent(createKeyboardEvent('keydown', { code: 'KeyA', key: 'a' }));
    endInputStateFrame(state);
    target.dispatchEvent(createKeyboardEvent('keyup', { code: 'KeyA', key: 'a' }));
    expect(wasInputKeyReleased(state, KeyCode.A)).toBe(true);
  });

  it('returns false when key was not released this frame', () => {
    const state = createInputState();
    expect(wasInputKeyReleased(state, KeyCode.A)).toBe(false);
  });

  it('returns false after endInputStateFrame', () => {
    const manager = createInputManager();
    const target = document.createElement('input');
    attachKeyboardInput(manager, target);
    const state = createInputState();
    connectInputStateToInputManager(state, manager);

    target.dispatchEvent(createKeyboardEvent('keydown', { code: 'KeyA', key: 'a' }));
    target.dispatchEvent(createKeyboardEvent('keyup', { code: 'KeyA', key: 'a' }));
    endInputStateFrame(state);
    expect(wasInputKeyReleased(state, KeyCode.A)).toBe(false);
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

function createPointerEvent(
  type: string,
  options: Partial<PointerEvent> & { pressure?: number; tiltX?: number; tiltY?: number } = {},
): PointerEvent {
  const event = new Event(type, { bubbles: true, cancelable: true }) as PointerEvent;
  Object.defineProperties(event, {
    altKey: { value: options.altKey ?? false },
    button: { value: options.button ?? 0 },
    buttons: { value: options.buttons ?? 1 },
    clientX: { value: options.clientX ?? 0 },
    clientY: { value: options.clientY ?? 0 },
    ctrlKey: { value: options.ctrlKey ?? false },
    height: { value: 1 },
    isPrimary: { value: options.isPrimary ?? true },
    metaKey: { value: options.metaKey ?? false },
    pointerId: { value: options.pointerId ?? 0 },
    pointerType: { value: options.pointerType ?? 'mouse' },
    pressure: { value: options.pressure ?? 0 },
    shiftKey: { value: options.shiftKey ?? false },
    tiltX: { value: options.tiltX ?? 0 },
    tiltY: { value: options.tiltY ?? 0 },
    twist: { value: 0 },
    width: { value: 1 },
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
