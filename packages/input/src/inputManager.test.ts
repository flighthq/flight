import { connectSignal, emitSignal } from '@flighthq/signals/contract';
import type {
  InputGamepadButtonData,
  HostInputIngressProvider,
  InputIngressSink,
  InputIngressSource,
  InputKeyboardData,
  InputPointerData,
} from '@flighthq/types/contract';
import { GamepadAxisKind, GamepadButtonKind, KeyCode } from '@flighthq/types/contract';

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
  getGamepadAxisName,
  getGamepadButtonName,
  getInputGamepadAxis,
  getInputIngressBackend,
  initializeInputKeyRepeatTimer,
  initializeInputManager,
  initializeInputSignals,
  initializeInputState,
  installInputIngressHostBackend,
  isInputGamepadButtonDown,
  isInputKeyDown,
  isInputPointerButtonDown,
  resetInputIngressBackendForTest,
  setInputIngressBackend,
  wasInputGamepadButtonPressed,
  wasInputGamepadButtonReleased,
  wasInputKeyPressed,
  wasInputKeyReleased,
} from './inputManager';

afterEach(() => {
  resetInputIngressBackendForTest();
  vi.unstubAllGlobals();
});

type InputIngressAttachmentKind = 'gamepad' | 'keyboard' | 'pointer' | 'relativePointer' | 'text' | 'wheel';

function createTestInputIngressBackend(
  attach: (kind: InputIngressAttachmentKind, source: InputIngressSource, sink: InputIngressSink) => () => void = () =>
    () => {},
): HostInputIngressProvider {
  return {
    attachGamepad: (source, sink) => attach('gamepad', source, sink),
    attachKeyboard: (source, sink) => attach('keyboard', source, sink),
    attachPointer: (source, sink) => attach('pointer', source, sink),
    attachRelativePointer: (source, sink) => attach('relativePointer', source, sink),
    attachText: (source, sink) => attach('text', source, sink),
    attachWheel: (source, sink) => attach('wheel', source, sink),
  };
}

function expectInputAttachment(attach: typeof attachGamepadInput, expectedKind: InputIngressAttachmentKind): void {
  const attachments: Array<Readonly<{ kind: InputIngressAttachmentKind; source: InputIngressSource }>> = [];
  setInputIngressBackend(
    createTestInputIngressBackend((kind, source) => {
      attachments.push({ kind, source });
      return () => {};
    }),
  );
  const source = {};

  attach(createInputManager(), source);

  expect(attachments).toEqual([{ kind: expectedKind, source }]);
}

function expectInputDetachment(
  attach: typeof attachGamepadInput,
  detach: typeof detachGamepadInput,
  expectedKind: InputIngressAttachmentKind,
): void {
  const release = vi.fn();
  setInputIngressBackend(createTestInputIngressBackend((kind) => (kind === expectedKind ? release : () => {})));
  const manager = createInputManager();
  const source = {};
  attach(manager, source);

  detach(manager, source);

  expect(release).toHaveBeenCalledOnce();
}

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
  it('accepts native axis and button pushes without browser polling globals', () => {
    let sink: InputIngressSink | null = null;
    setInputIngressBackend(
      createTestInputIngressBackend((kind, _source, attachedSink) => {
        if (kind === 'gamepad') sink = attachedSink;
        return () => {};
      }),
    );
    vi.stubGlobal('navigator', undefined);
    vi.stubGlobal('requestAnimationFrame', undefined);
    vi.stubGlobal('cancelAnimationFrame', undefined);
    vi.stubGlobal('performance', undefined);
    const manager = createInputManager();
    const state = createInputState();
    connectInputStateToInputManager(state, manager);
    const events: string[] = [];
    connectSignal(manager.onGamepadConnect, () => events.push('connect'));
    connectSignal(manager.onGamepadAxisMove, () => events.push('axis'));
    connectSignal(manager.onGamepadButtonDown, () => events.push('down'));
    connectSignal(manager.onGamepadButtonUp, () => events.push('up'));
    connectSignal(manager.onGamepadDisconnect, () => events.push('disconnect'));

    attachGamepadInput(manager, {});
    sink!.gamepadConnect({ gamepad: 2, id: 'Native Pad', mapping: 'raw' });
    sink!.gamepadAxisMove({ axis: 1, gamepad: 2, timeStamp: 10, value: 0.75 });
    sink!.gamepadButtonDown({ button: 3, gamepad: 2, timeStamp: 11, value: 1 });
    expect(getInputGamepadAxis(state, 2, 1)).toBe(0.75);
    expect(isInputGamepadButtonDown(state, 2, 3)).toBe(true);
    sink!.gamepadButtonUp({ button: 3, gamepad: 2, timeStamp: 12, value: 0 });
    sink!.gamepadDisconnect({ gamepad: 2, id: 'Native Pad', mapping: 'raw' });

    expect(events).toEqual(['connect', 'axis', 'down', 'up', 'disconnect']);
    expect(getInputGamepadAxis(state, 2, 1)).toBe(0);
    expect(isInputGamepadButtonDown(state, 2, 3)).toBe(false);
  });
});

describe('attachKeyboardInput', () => {
  it('binds the source through the selected ingress provider', () => {
    expectInputAttachment(attachKeyboardInput, 'keyboard');
  });
});

describe('attachPointerInput', () => {
  it('binds the source through the selected ingress provider', () => {
    expectInputAttachment(attachPointerInput, 'pointer');
  });
});

describe('attachRelativePointerInput', () => {
  it('binds the source through the selected ingress provider', () => {
    expectInputAttachment(attachRelativePointerInput, 'relativePointer');
  });
});

describe('attachTextInput', () => {
  it('binds the source through the selected ingress provider', () => {
    expectInputAttachment(attachTextInput, 'text');
  });
});

describe('attachWheelInput', () => {
  it('binds the source through the selected ingress provider', () => {
    expectInputAttachment(attachWheelInput, 'wheel');
  });
});

describe('connectInputStateToInputManager', () => {
  it('tracks held keys via isInputKeyDown', () => {
    const manager = createInputManager();
    const state = createInputState();
    connectInputStateToInputManager(state, manager);
    const data = createInputKeyboardData(KeyCode.A);

    emitSignal(manager.onKeyDown, data);
    expect(isInputKeyDown(state, KeyCode.A)).toBe(true);

    emitSignal(manager.onKeyUp, data);
    expect(isInputKeyDown(state, KeyCode.A)).toBe(false);
  });

  it('tracks held pointer buttons via isInputPointerButtonDown', () => {
    const manager = createInputManager();
    const state = createInputState();
    connectInputStateToInputManager(state, manager);
    const data = createInputPointerData(1, 0);

    emitSignal(manager.onPointerDown, data);
    expect(isInputPointerButtonDown(state, 1, 0)).toBe(true);

    emitSignal(manager.onPointerUp, data);
    expect(isInputPointerButtonDown(state, 1, 0)).toBe(false);
  });

  it('clears pointer state on pointercancel', () => {
    const manager = createInputManager();
    const state = createInputState();
    connectInputStateToInputManager(state, manager);
    const data = createInputPointerData(2, 0);

    emitSignal(manager.onPointerDown, data);
    expect(isInputPointerButtonDown(state, 2, 0)).toBe(true);

    emitSignal(manager.onPointerCancel, data);
    expect(isInputPointerButtonDown(state, 2, 0)).toBe(false);
  });

  it('tracks gamepad button state via isInputGamepadButtonDown', () => {
    const manager = createInputManager();
    const state = createInputState();
    connectInputStateToInputManager(state, manager);

    emitSignal(manager.onGamepadButtonDown, { button: 0, gamepad: 0, timeStamp: 1, value: 1 });
    expect(isInputGamepadButtonDown(state, 0, 0)).toBe(true);
    emitSignal(manager.onGamepadButtonUp, { button: 0, gamepad: 0, timeStamp: 2, value: 0 });
    expect(isInputGamepadButtonDown(state, 0, 0)).toBe(false);
  });

  it('tracks gamepad axis values via getInputGamepadAxis', () => {
    const manager = createInputManager();
    const state = createInputState();
    connectInputStateToInputManager(state, manager);

    emitSignal(manager.onGamepadAxisMove, { axis: 0, gamepad: 0, timeStamp: 1, value: 0.75 });
    expect(getInputGamepadAxis(state, 0, 0)).toBe(0.75);
  });

  it('returns a disposer that stops tracking', () => {
    const manager = createInputManager();
    const state = createInputState();
    const dispose = connectInputStateToInputManager(state, manager);
    const data = createInputKeyboardData(KeyCode.A);

    emitSignal(manager.onKeyDown, data);
    expect(isInputKeyDown(state, KeyCode.A)).toBe(true);

    emitSignal(manager.onKeyUp, data);
    dispose();

    // After dispose, subsequent events should not update state.
    emitSignal(manager.onKeyDown, data);
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
  it('releases the matching ingress binding', () => {
    expectInputDetachment(attachGamepadInput, detachGamepadInput, 'gamepad');
  });
});

describe('detachKeyboardInput', () => {
  it('releases the matching ingress binding', () => {
    expectInputDetachment(attachKeyboardInput, detachKeyboardInput, 'keyboard');
  });
});

describe('detachPointerInput', () => {
  it('releases the matching ingress binding', () => {
    expectInputDetachment(attachPointerInput, detachPointerInput, 'pointer');
  });
});

describe('detachRelativePointerInput', () => {
  it('releases the matching ingress binding', () => {
    expectInputDetachment(attachRelativePointerInput, detachRelativePointerInput, 'relativePointer');
  });
});

describe('detachTextInput', () => {
  it('releases the matching ingress binding', () => {
    expectInputDetachment(attachTextInput, detachTextInput, 'text');
  });
});

describe('detachWheelInput', () => {
  it('releases the matching ingress binding', () => {
    expectInputDetachment(attachWheelInput, detachWheelInput, 'wheel');
  });
});

describe('endInputStateFrame', () => {
  it('clears all frame-edge sets', () => {
    const manager = createInputManager();
    const state = createInputState();
    connectInputStateToInputManager(state, manager);

    emitSignal(manager.onKeyDown, createInputKeyboardData(KeyCode.A));
    expect(state.justPressedKeys.size).toBe(1);

    endInputStateFrame(state);
    expect(state.justPressedKeys.size).toBe(0);
    expect(state.justReleasedKeys.size).toBe(0);
    expect(state.justPressedGamepadButtons.size).toBe(0);
    expect(state.justReleasedGamepadButtons.size).toBe(0);
  });

  it('does not affect held-state sets', () => {
    const manager = createInputManager();
    const state = createInputState();
    connectInputStateToInputManager(state, manager);

    emitSignal(manager.onKeyDown, createInputKeyboardData(KeyCode.A));
    endInputStateFrame(state);
    // Key is still held even after frame roll
    expect(state.keysDown.has(KeyCode.A)).toBe(true);
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

describe('getInputIngressBackend', () => {
  it('uses one stable portable fallback', () => {
    const fallback = getInputIngressBackend();
    expect(getInputIngressBackend()).toBe(fallback);
  });

  it('returns inert releases for every attachment family when no provider is installed', () => {
    const fallback = getInputIngressBackend();
    const source = {};
    const sink = {} as InputIngressSink;
    expect(() => fallback.attachGamepad(source, sink)()).not.toThrow();
    expect(() => fallback.attachKeyboard(source, sink)()).not.toThrow();
    expect(() => fallback.attachPointer(source, sink)()).not.toThrow();
    expect(() => fallback.attachRelativePointer(source, sink)()).not.toThrow();
    expect(() => fallback.attachText(source, sink)()).not.toThrow();
    expect(() => fallback.attachWheel(source, sink)()).not.toThrow();
  });
});

describe('initializeInputKeyRepeatTimer', () => {
  it('is the construction initializer of createInputKeyRepeatTimer', () => {
    expect(typeof initializeInputKeyRepeatTimer).toBe('function');
  });
});

describe('initializeInputManager', () => {
  it('is the construction initializer of createInputManager', () => {
    expect(typeof initializeInputManager).toBe('function');
  });
});

describe('initializeInputSignals', () => {
  it('is the construction initializer of createInputSignals', () => {
    expect(typeof initializeInputSignals).toBe('function');
  });
});

describe('initializeInputState', () => {
  it('is the construction initializer of createInputState', () => {
    expect(typeof initializeInputState).toBe('function');
  });
});

describe('installInputIngressHostBackend', () => {
  it('preserves the first installed host identity', () => {
    const firstHost = createTestInputIngressBackend();
    installInputIngressHostBackend(firstHost);
    installInputIngressHostBackend(createTestInputIngressBackend());
    expect(getInputIngressBackend()).toBe(firstHost);
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

describe('resetInputIngressBackendForTest', () => {
  it('clears custom and host slots back to the portable fallback', () => {
    const fallback = getInputIngressBackend();
    installInputIngressHostBackend(createTestInputIngressBackend());
    setInputIngressBackend(createTestInputIngressBackend());

    resetInputIngressBackendForTest();
    expect(getInputIngressBackend()).toBe(fallback);
  });
});

describe('setInputIngressBackend', () => {
  it('gives a custom backend precedence and reveals the installed host when cleared', () => {
    const firstHost = createTestInputIngressBackend();
    installInputIngressHostBackend(firstHost);
    const custom = createTestInputIngressBackend();
    setInputIngressBackend(custom);
    expect(getInputIngressBackend()).toBe(custom);
    setInputIngressBackend(null);
    expect(getInputIngressBackend()).toBe(firstHost);
  });

  it('passes each exact source identity through all six attachment families and releases each once', () => {
    const attachments: Array<Readonly<{ kind: InputIngressAttachmentKind; source: InputIngressSource }>> = [];
    const releases = new Map<InputIngressAttachmentKind, ReturnType<typeof vi.fn>>();
    setInputIngressBackend(
      createTestInputIngressBackend((kind, source) => {
        attachments.push({ kind, source });
        const release = vi.fn();
        releases.set(kind, release);
        return release;
      }),
    );
    const manager = createInputManager();
    const sources = {
      gamepad: {},
      keyboard: {},
      pointer: {},
      relativePointer: {},
      text: {},
      wheel: {},
    } satisfies Record<InputIngressAttachmentKind, InputIngressSource>;

    attachGamepadInput(manager, sources.gamepad);
    attachKeyboardInput(manager, sources.keyboard);
    attachPointerInput(manager, sources.pointer);
    attachRelativePointerInput(manager, sources.relativePointer);
    attachTextInput(manager, sources.text);
    attachWheelInput(manager, sources.wheel);

    expect(attachments).toEqual([
      { kind: 'gamepad', source: sources.gamepad },
      { kind: 'keyboard', source: sources.keyboard },
      { kind: 'pointer', source: sources.pointer },
      { kind: 'relativePointer', source: sources.relativePointer },
      { kind: 'text', source: sources.text },
      { kind: 'wheel', source: sources.wheel },
    ]);

    detachGamepadInput(manager, sources.gamepad);
    detachKeyboardInput(manager, sources.keyboard);
    detachPointerInput(manager, sources.pointer);
    detachRelativePointerInput(manager, sources.relativePointer);
    detachTextInput(manager, sources.text);
    detachWheelInput(manager, sources.wheel);
    detachGamepadInput(manager, sources.gamepad);
    detachKeyboardInput(manager, sources.keyboard);
    detachPointerInput(manager, sources.pointer);
    detachRelativePointerInput(manager, sources.relativePointer);
    detachTextInput(manager, sources.text);
    detachWheelInput(manager, sources.wheel);

    expect([...releases.values()].every((release) => release.mock.calls.length === 1)).toBe(true);
  });

  it('pins cleanup to the originating backend and never destroys the borrowed source', () => {
    const releaseA = vi.fn();
    const releaseB = vi.fn();
    const backendA = createTestInputIngressBackend((kind) => (kind === 'keyboard' ? releaseA : vi.fn()));
    const backendB = createTestInputIngressBackend((kind) => (kind === 'keyboard' ? releaseB : vi.fn()));
    const source = { destroy: vi.fn() };
    const manager = createInputManager();

    setInputIngressBackend(backendA);
    attachKeyboardInput(manager, source);
    setInputIngressBackend(backendB);
    detachKeyboardInput(manager, source);
    detachKeyboardInput(manager, source);

    expect(releaseA).toHaveBeenCalledOnce();
    expect(releaseB).not.toHaveBeenCalled();
    expect(source.destroy).not.toHaveBeenCalled();
  });

  it('releases the old origin once when the same source is reattached after backend replacement', () => {
    const releaseA = vi.fn();
    const releaseB = vi.fn();
    const source = {};
    const manager = createInputManager();

    setInputIngressBackend(createTestInputIngressBackend(() => releaseA));
    attachPointerInput(manager, source);
    setInputIngressBackend(createTestInputIngressBackend(() => releaseB));
    attachPointerInput(manager, source);
    expect(releaseA).toHaveBeenCalledOnce();

    detachPointerInput(manager, source);
    detachPointerInput(manager, source);
    expect(releaseA).toHaveBeenCalledOnce();
    expect(releaseB).toHaveBeenCalledOnce();
  });
});

function createInputKeyboardData(keyCode: number): InputKeyboardData {
  return {
    altKey: false,
    capsLock: false,
    code: '',
    ctrlKey: false,
    key: '',
    keyCode,
    location: 0,
    metaKey: false,
    modifier: 0,
    numLock: false,
    repeat: false,
    shiftKey: false,
    timeStamp: 0,
  };
}

function createInputPointerData(pointerId: number, button: number): InputPointerData {
  return {
    altKey: false,
    button,
    buttons: 0,
    ctrlKey: false,
    deltaX: 0,
    deltaY: 0,
    height: 1,
    isPrimary: true,
    metaKey: false,
    pointerId,
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
}

describe('wasInputGamepadButtonPressed', () => {
  it('returns true when a button was pressed this frame', () => {
    const manager = createInputManager();
    const state = createInputState();
    connectInputStateToInputManager(state, manager);

    emitSignal(manager.onGamepadButtonDown, { button: 0, gamepad: 0, timeStamp: 1, value: 1 });

    expect(wasInputGamepadButtonPressed(state, 0, 0)).toBe(true);
  });

  it('returns false after endInputStateFrame', () => {
    const manager = createInputManager();
    const state = createInputState();
    connectInputStateToInputManager(state, manager);

    emitSignal(manager.onGamepadButtonDown, { button: 0, gamepad: 0, timeStamp: 1, value: 1 });
    endInputStateFrame(state);

    expect(wasInputGamepadButtonPressed(state, 0, 0)).toBe(false);
  });

  // Driven by emitting the signal because the Web adapter already edge-detects and cannot produce a
  // repeat. A native backend reporting held buttons every poll can, and these signals are public —
  // which is why the guard belongs on the state machine.
  it('returns false when a held button is reported down again', () => {
    const manager = createInputManager();
    const state = createInputState();
    connectInputStateToInputManager(state, manager);
    const data = { button: 1, gamepad: 0, timeStamp: 0, value: 1 } as InputGamepadButtonData;

    emitSignal(manager.onGamepadButtonDown, data);
    expect(wasInputGamepadButtonPressed(state, 0, 1)).toBe(true);

    endInputStateFrame(state);
    emitSignal(manager.onGamepadButtonDown, data);
    expect(wasInputGamepadButtonPressed(state, 0, 1)).toBe(false);
    expect(isInputGamepadButtonDown(state, 0, 1)).toBe(true);
  });

  it('returns true for a button pressed and released within the same frame', () => {
    const manager = createInputManager();
    const state = createInputState();
    connectInputStateToInputManager(state, manager);
    const data = { button: 1, gamepad: 0, timeStamp: 0, value: 1 } as InputGamepadButtonData;

    emitSignal(manager.onGamepadButtonDown, data);
    emitSignal(manager.onGamepadButtonUp, data);

    expect(wasInputGamepadButtonPressed(state, 0, 1)).toBe(true);
    expect(wasInputGamepadButtonReleased(state, 0, 1)).toBe(true);
    expect(isInputGamepadButtonDown(state, 0, 1)).toBe(false);
  });
});

describe('wasInputGamepadButtonReleased', () => {
  it('returns true when a button was released this frame', () => {
    const manager = createInputManager();
    const state = createInputState();
    connectInputStateToInputManager(state, manager);

    // Press the button first.
    emitSignal(manager.onGamepadButtonDown, { button: 0, gamepad: 0, timeStamp: 1, value: 1 });
    endInputStateFrame(state);

    // Release it.
    emitSignal(manager.onGamepadButtonUp, { button: 0, gamepad: 0, timeStamp: 2, value: 0 });

    expect(wasInputGamepadButtonReleased(state, 0, 0)).toBe(true);
  });
});

describe('wasInputKeyPressed', () => {
  it('returns true when a key was pressed this frame', () => {
    const manager = createInputManager();
    const state = createInputState();
    connectInputStateToInputManager(state, manager);

    emitSignal(manager.onKeyDown, createInputKeyboardData(KeyCode.A));
    expect(wasInputKeyPressed(state, KeyCode.A)).toBe(true);
  });

  it('returns false when key was not pressed this frame', () => {
    const state = createInputState();
    expect(wasInputKeyPressed(state, KeyCode.A)).toBe(false);
  });

  it('returns false after endInputStateFrame', () => {
    const manager = createInputManager();
    const state = createInputState();
    connectInputStateToInputManager(state, manager);

    emitSignal(manager.onKeyDown, createInputKeyboardData(KeyCode.A));
    endInputStateFrame(state);
    expect(wasInputKeyPressed(state, KeyCode.A)).toBe(false);
  });

  // The DOM re-fires keydown while a key is held. Only the first is an up→down transition, so a held
  // key must not keep reporting a press — otherwise anything that fires on press autofires.
  it('returns false for the auto-repeat keydowns of a key that is still held', () => {
    const manager = createInputManager();
    const state = createInputState();
    connectInputStateToInputManager(state, manager);
    const data = createInputKeyboardData(KeyCode.A);

    emitSignal(manager.onKeyDown, data);
    expect(wasInputKeyPressed(state, KeyCode.A)).toBe(true);

    endInputStateFrame(state);
    emitSignal(manager.onKeyDown, { ...data, repeat: true });
    expect(wasInputKeyPressed(state, KeyCode.A)).toBe(false);
    expect(isInputKeyDown(state, KeyCode.A)).toBe(true);
  });

  // A tap that starts and ends between two frames still contains a real press; reporting only the
  // release would swallow the input rather than delay it.
  it('returns true for a key pressed and released within the same frame', () => {
    const manager = createInputManager();
    const state = createInputState();
    connectInputStateToInputManager(state, manager);
    const data = createInputKeyboardData(KeyCode.A);

    emitSignal(manager.onKeyDown, data);
    emitSignal(manager.onKeyUp, data);

    expect(wasInputKeyPressed(state, KeyCode.A)).toBe(true);
    expect(wasInputKeyReleased(state, KeyCode.A)).toBe(true);
    expect(isInputKeyDown(state, KeyCode.A)).toBe(false);
  });

  // Re-pressing after a release inside one frame is a second up→down transition, and leaves the key
  // held — so the frame reports a press, a release, and a key that is still down.
  it('returns true for a key released and pressed again within the same frame', () => {
    const manager = createInputManager();
    const state = createInputState();
    connectInputStateToInputManager(state, manager);
    const data = createInputKeyboardData(KeyCode.A);

    emitSignal(manager.onKeyDown, data);
    endInputStateFrame(state);
    emitSignal(manager.onKeyUp, data);
    emitSignal(manager.onKeyDown, data);

    expect(wasInputKeyPressed(state, KeyCode.A)).toBe(true);
    expect(wasInputKeyReleased(state, KeyCode.A)).toBe(true);
    expect(isInputKeyDown(state, KeyCode.A)).toBe(true);
  });
});

describe('wasInputKeyReleased', () => {
  it('returns true when a key was released this frame', () => {
    const manager = createInputManager();
    const state = createInputState();
    connectInputStateToInputManager(state, manager);
    const data = createInputKeyboardData(KeyCode.A);

    emitSignal(manager.onKeyDown, data);
    endInputStateFrame(state);
    emitSignal(manager.onKeyUp, data);
    expect(wasInputKeyReleased(state, KeyCode.A)).toBe(true);
  });

  it('returns false when key was not released this frame', () => {
    const state = createInputState();
    expect(wasInputKeyReleased(state, KeyCode.A)).toBe(false);
  });

  it('returns false after endInputStateFrame', () => {
    const manager = createInputManager();
    const state = createInputState();
    connectInputStateToInputManager(state, manager);
    const data = createInputKeyboardData(KeyCode.A);

    emitSignal(manager.onKeyDown, data);
    emitSignal(manager.onKeyUp, data);
    endInputStateFrame(state);
    expect(wasInputKeyReleased(state, KeyCode.A)).toBe(false);
  });
});
