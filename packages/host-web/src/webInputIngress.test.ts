import {
  attachGamepadInput,
  attachKeyboardInput,
  attachPointerInput,
  attachRelativePointerInput,
  attachTextInput,
  attachWheelInput,
  createInputManager,
  detachGamepadInput,
  detachKeyboardInput,
  detachPointerInput,
  detachRelativePointerInput,
  detachTextInput,
  detachWheelInput,
} from '@flighthq/input/contract';
import * as inputContract from '@flighthq/input/contract';
import { connectSignal } from '@flighthq/signals/contract';
import type { InputIngressSink, InputPointerData } from '@flighthq/types/contract';
import { KeyCode, KeyModifier } from '@flighthq/types/contract';

import * as hostWebPublic from './index';
import { webHostInput } from './webInputHost';
import {
  getWebCoalescedPointerEvents,
  getWebKeyCodeFromKeyboardEvent,
  getWebKeyModifierFromKeyboardEvent,
  getWebMouseWheelModeFromWheelEvent,
  releaseWebInputPointerCapture,
  setWebInputPointerCapture,
  webHostInputIngress,
} from './webInputIngress';

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('getWebCoalescedPointerEvents', () => {
  it('falls back to a single event when getCoalescedEvents is unavailable', () => {
    const event = createPointerEvent('pointermove', { clientX: 10, clientY: 20 });
    const received: number[] = [];
    getWebCoalescedPointerEvents(event, (data) => received.push(data.x));
    expect(received).toEqual([10]);
  });

  it('iterates coalesced events when available', () => {
    const coalesced = [
      createPointerEvent('pointermove', { clientX: 1, clientY: 0 }),
      createPointerEvent('pointermove', { clientX: 2, clientY: 0 }),
    ];
    const event = createPointerEvent('pointermove', { clientX: 3, clientY: 0 });
    Object.defineProperty(event, 'getCoalescedEvents', { value: () => coalesced });
    const received: number[] = [];
    getWebCoalescedPointerEvents(event, (data) => received.push(data.x));
    expect(received).toEqual([1, 2]);
  });
});

describe('getWebKeyCodeFromKeyboardEvent', () => {
  it('maps printable keys to SDL-compatible lower-case codes', () => {
    expect(getWebKeyCodeFromKeyboardEvent(createKeyboardEvent('keydown', { key: 'A' }))).toBe(KeyCode.A);
  });

  it('maps named keys', () => {
    expect(
      getWebKeyCodeFromKeyboardEvent(createKeyboardEvent('keydown', { code: 'ArrowLeft', key: 'ArrowLeft' })),
    ).toBe(KeyCode.LEFT);
  });

  it('maps numpad keys by location', () => {
    expect(
      getWebKeyCodeFromKeyboardEvent(
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
    expect(getWebKeyCodeFromKeyboardEvent(createKeyboardEvent('keydown', { code, key: '' }))).toBe(expected);
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
      getWebKeyCodeFromKeyboardEvent(
        createKeyboardEvent('keydown', { code, key: '', location: KeyboardEvent.DOM_KEY_LOCATION_NUMPAD }),
      ),
    ).toBe(expected);
  });
});

describe('getWebKeyModifierFromKeyboardEvent', () => {
  it('maps DOM modifier flags to Lime-compatible bit flags', () => {
    const modifier = getWebKeyModifierFromKeyboardEvent(
      createKeyboardEvent('keydown', { ctrlKey: true, shiftKey: true }),
    );
    expect((modifier & KeyModifier.CTRL) !== 0).toBe(true);
    expect((modifier & KeyModifier.SHIFT) !== 0).toBe(true);
  });
});

describe('getWebMouseWheelModeFromWheelEvent', () => {
  it('maps every DOM wheel delta mode without leaking that mapping into portable input', () => {
    expect(getWebMouseWheelModeFromWheelEvent(createWheelEvent({ deltaMode: WheelEvent.DOM_DELTA_PIXEL }))).toBe(
      'pixels',
    );
    expect(getWebMouseWheelModeFromWheelEvent(createWheelEvent({ deltaMode: WheelEvent.DOM_DELTA_LINE }))).toBe(
      'lines',
    );
    expect(getWebMouseWheelModeFromWheelEvent(createWheelEvent({ deltaMode: WheelEvent.DOM_DELTA_PAGE }))).toBe(
      'pages',
    );
    expect(getWebMouseWheelModeFromWheelEvent(createWheelEvent({ deltaMode: 99 }))).toBe('unknown');
  });
});

describe('releaseWebInputPointerCapture', () => {
  it('releases pointer capture from the Web element', () => {
    const element = document.createElement('div');
    element.releasePointerCapture = vi.fn();

    releaseWebInputPointerCapture(element, 5);

    expect(element.releasePointerCapture).toHaveBeenCalledWith(5);
  });

  it('does not throw when the pointer was already released', () => {
    const element = document.createElement('div');
    element.releasePointerCapture = () => {
      throw new DOMException('No pointer');
    };
    expect(() => releaseWebInputPointerCapture(element, 0)).not.toThrow();
  });
});

describe('setWebInputPointerCapture', () => {
  it('captures pointer events to the Web element', () => {
    const element = document.createElement('div');
    element.setPointerCapture = vi.fn();

    setWebInputPointerCapture(element, 7);

    expect(element.setPointerCapture).toHaveBeenCalledWith(7);
  });
});

describe('web input ingress listeners', () => {
  it('normalizes keyboard input and detaches its listeners', () => {
    const manager = createInputManager();
    const target = document.createElement('input');
    const received: number[] = [];
    connectSignal(manager.onKeyDown, (data) => received.push(data.keyCode));
    attachKeyboardInput(webHostInputIngress, manager, target);

    target.dispatchEvent(createKeyboardEvent('keydown', { code: 'KeyA', key: 'a' }));
    detachKeyboardInput(manager, target);
    target.dispatchEvent(createKeyboardEvent('keydown', { code: 'KeyB', key: 'b' }));
    expect(received).toEqual([KeyCode.A]);
  });

  it('normalizes pointer input and detaches one source independently', () => {
    const manager = createInputManager();
    const first = document.createElement('div');
    const second = document.createElement('div');
    const received: InputPointerData[] = [];
    connectSignal(manager.onPointerDown, (data) => received.push({ ...data }));
    attachPointerInput(webHostInputIngress, manager, first);
    attachPointerInput(webHostInputIngress, manager, second);

    first.dispatchEvent(createPointerEvent('pointerdown', { clientX: 20, clientY: 30, pointerId: 4 }));
    detachPointerInput(manager, first);
    first.dispatchEvent(createPointerEvent('pointerdown'));
    second.dispatchEvent(createPointerEvent('pointerdown', { pressure: 0.5, tiltX: 10 }));
    expect(received).toHaveLength(2);
    expect(received[0]).toMatchObject({ pointerId: 4, x: 20, y: 30 });
    expect(received[1]).toMatchObject({ pressure: 0.5, tiltX: 10 });
    detachPointerInput(manager, second);
  });

  it('normalizes relative pointer input from the owner document', () => {
    const manager = createInputManager();
    const element = document.createElement('div');
    let received: Readonly<InputPointerData> | null = null;
    connectSignal(manager.onPointerMoveRelative, (data) => {
      received = { ...data };
    });
    attachRelativePointerInput(webHostInputIngress, manager, element, { preventDefault: true });

    const event = new MouseEvent('mousemove', {
      cancelable: true,
      clientX: 7,
      clientY: 9,
      ctrlKey: true,
      movementX: 2,
      movementY: 4,
    });
    element.ownerDocument.dispatchEvent(event);
    expect(received).toMatchObject({
      ctrlKey: true,
      deltaX: 2,
      deltaY: 4,
      pointerType: 'mouse',
      x: 7,
      y: 9,
    });
    expect(event.defaultPrevented).toBe(true);
    detachRelativePointerInput(manager, element);
  });

  it('normalizes text and composition input', () => {
    const manager = createInputManager();
    const element = document.createElement('div');
    const received: Array<Readonly<{ composing: boolean; text: string }>> = [];
    connectSignal(manager.onTextInput, (data) => received.push({ composing: data.isComposing, text: data.text }));
    connectSignal(manager.onTextEdit, (data) => received.push({ composing: data.isComposing, text: data.text }));
    attachTextInput(webHostInputIngress, manager, element);

    element.dispatchEvent(new InputEvent('beforeinput', { data: 'x' }));
    element.dispatchEvent(new CompositionEvent('compositionupdate', { data: 'hi' }));
    detachTextInput(manager, element);
    element.dispatchEvent(new InputEvent('beforeinput', { data: 'ignored' }));
    expect(received).toEqual([
      { composing: false, text: 'x' },
      { composing: true, text: 'hi' },
    ]);
  });

  it('normalizes wheel deltas and mode', () => {
    const manager = createInputManager();
    const element = document.createElement('div');
    let received: Readonly<InputPointerData> | null = null;
    connectSignal(manager.onWheel, (data) => {
      received = { ...data };
    });
    attachWheelInput(webHostInputIngress, manager, element);

    element.dispatchEvent(createWheelEvent({ deltaMode: WheelEvent.DOM_DELTA_LINE, deltaY: -3 }));
    expect(received).toMatchObject({ deltaY: -3, wheelMode: 'lines' });
    detachWheelInput(manager, element);
  });

  it('does not deliver any family while its sink is disabled', () => {
    const manager = createInputManager();
    const keyboard = document.createElement('input');
    const pointer = document.createElement('div');
    let fired = 0;
    connectSignal(manager.onKeyDown, () => fired++);
    connectSignal(manager.onPointerDown, () => fired++);
    attachKeyboardInput(webHostInputIngress, manager, keyboard);
    attachPointerInput(webHostInputIngress, manager, pointer);
    manager.enabled = false;

    keyboard.dispatchEvent(createKeyboardEvent('keydown', { code: 'KeyA', key: 'a' }));
    pointer.dispatchEvent(createPointerEvent('pointerdown'));
    expect(fired).toBe(0);
    detachKeyboardInput(manager, keyboard);
    detachPointerInput(manager, pointer);
  });
});

describe('webHostInputIngress', () => {
  it('implements all six input attachment families', () => {
    const backend = webHostInputIngress;
    expect(backend.attachGamepad).toBeTypeOf('function');
    expect(backend.attachKeyboard).toBeTypeOf('function');
    expect(backend.attachPointer).toBeTypeOf('function');
    expect(backend.attachRelativePointer).toBeTypeOf('function');
    expect(backend.attachText).toBeTypeOf('function');
    expect(backend.attachWheel).toBeTypeOf('function');
  });

  it('owns gamepad polling and emits only changed Web state', () => {
    const frames = installManualAnimationFrames();
    const getGamepads = vi.fn<() => Gamepad[]>();
    Object.defineProperty(navigator, 'getGamepads', { configurable: true, value: getGamepads });
    const manager = createInputManager();
    const axes: number[] = [];
    const buttons: number[] = [];
    connectSignal(manager.onGamepadAxisMove, (data) => axes.push(data.value));
    connectSignal(manager.onGamepadButtonUp, (data) => buttons.push(data.value));
    attachGamepadInput(webHostInputIngress, manager, window);

    const initial = createGamepad(0, 'Pad', [0.25], [{ pressed: true, touched: true, value: 1 }]);
    getGamepads.mockReturnValue([initial]);
    window.dispatchEvent(createGamepadEvent('gamepadconnected', initial));
    frames.runAllCurrent();
    expect(axes).toEqual([]);
    expect(buttons).toEqual([]);

    getGamepads.mockReturnValue([createGamepad(0, 'Pad', [0.75], [{ pressed: false, touched: false, value: 0 }])]);
    frames.runAllCurrent();
    expect(axes).toEqual([0.75]);
    expect(buttons).toEqual([0]);
    frames.runAllCurrent();
    expect(axes).toEqual([0.75]);
    expect(buttons).toEqual([0]);
    detachGamepadInput(manager, window);
  });

  it('keeps Web polling state and releases independent per source', () => {
    const frames = installManualAnimationFrames();
    const getGamepads = vi.fn<() => Gamepad[]>().mockReturnValue([createGamepad(0, 'Pad', [0.5], [])]);
    Object.defineProperty(navigator, 'getGamepads', { configurable: true, value: getGamepads });
    const firstSource = new EventTarget();
    const secondSource = new EventTarget();
    const firstManager = createInputManager();
    const secondManager = createInputManager();
    let firstMoves = 0;
    let secondMoves = 0;
    connectSignal(firstManager.onGamepadAxisMove, () => firstMoves++);
    connectSignal(secondManager.onGamepadAxisMove, () => secondMoves++);
    attachGamepadInput(webHostInputIngress, firstManager, firstSource);
    attachGamepadInput(webHostInputIngress, secondManager, secondSource);

    frames.runAllCurrent();
    expect([firstMoves, secondMoves]).toEqual([1, 1]);
    detachGamepadInput(firstManager, firstSource);
    getGamepads.mockReturnValue([createGamepad(0, 'Pad', [0.75], [])]);
    frames.runAllCurrent();
    expect([firstMoves, secondMoves]).toEqual([1, 2]);
    detachGamepadInput(secondManager, secondSource);
    expect(frames.pending.size).toBe(0);
  });

  it('cannot resurrect Web polling when detached from a sink callback', () => {
    const frames = installManualAnimationFrames();
    Object.defineProperty(navigator, 'getGamepads', {
      configurable: true,
      value: () => [createGamepad(0, 'Pad', [0.5], [])],
    });
    const manager = createInputManager();
    connectSignal(manager.onGamepadAxisMove, () => detachGamepadInput(manager, window));
    attachGamepadInput(webHostInputIngress, manager, window);

    frames.runAllCurrent();
    expect(frames.pending.size).toBe(0);
    expect(frames.cancel).toHaveBeenCalledOnce();
  });

  it('routes two window identities only to their corresponding managers', () => {
    installManualAnimationFrames();
    const firstFrame = document.createElement('iframe');
    const secondFrame = document.createElement('iframe');
    document.body.append(firstFrame, secondFrame);
    const firstWindow = firstFrame.contentWindow!;
    const secondWindow = secondFrame.contentWindow!;
    const firstManager = createInputManager();
    const secondManager = createInputManager();
    const firstEvents: number[] = [];
    const secondEvents: number[] = [];
    connectSignal(firstManager.onKeyDown, (data) => firstEvents.push(data.keyCode));
    connectSignal(secondManager.onKeyDown, (data) => secondEvents.push(data.keyCode));
    attachKeyboardInput(webHostInputIngress, firstManager, firstWindow);
    attachKeyboardInput(webHostInputIngress, secondManager, secondWindow);

    firstWindow.dispatchEvent(createKeyboardEvent('keydown', { code: 'KeyA', key: 'a' }));
    expect(firstEvents).toEqual([KeyCode.A]);
    expect(secondEvents).toEqual([]);

    secondWindow.dispatchEvent(createKeyboardEvent('keydown', { code: 'KeyB', key: 'b' }));
    expect(firstEvents).toEqual([KeyCode.A]);
    expect(secondEvents).toEqual([KeyCode.B]);

    detachKeyboardInput(firstManager, firstWindow);
    detachKeyboardInput(secondManager, secondWindow);
    firstFrame.remove();
    secondFrame.remove();
  });

  it('returns inert releases for native source identities the Web adapter cannot interpret', () => {
    const frames = installManualAnimationFrames();
    const backend = webHostInputIngress;
    const source = {};
    const sink = {} as InputIngressSink;
    expect(() => backend.attachKeyboard(source, sink)()).not.toThrow();
    expect(() => backend.attachGamepad(source, sink)()).not.toThrow();
    expect(frames.request).not.toHaveBeenCalled();
  });
});

function createGamepad(
  index: number,
  id: string,
  axes: readonly number[] = [],
  buttons: readonly GamepadButton[] = [],
): Gamepad {
  return {
    axes,
    buttons,
    connected: true,
    id,
    index,
    mapping: 'standard',
    timestamp: 0,
  } as unknown as Gamepad;
}

function createGamepadEvent(type: string, gamepad: Gamepad): Event {
  const event = new Event(type, { bubbles: false }) as GamepadEvent;
  Object.defineProperty(event, 'gamepad', { value: gamepad });
  return event;
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

function installManualAnimationFrames(): Readonly<{
  cancel: ReturnType<typeof vi.fn>;
  pending: Map<number, FrameRequestCallback>;
  request: ReturnType<typeof vi.fn>;
  runAllCurrent(): void;
}> {
  let nextHandle = 1;
  const pending = new Map<number, FrameRequestCallback>();
  const request = vi.fn((callback: FrameRequestCallback): number => {
    const handle = nextHandle++;
    pending.set(handle, callback);
    return handle;
  });
  const cancel = vi.fn((handle: number): void => {
    pending.delete(handle);
  });
  vi.stubGlobal('requestAnimationFrame', request);
  vi.stubGlobal('cancelAnimationFrame', cancel);
  return {
    cancel,
    pending,
    request,
    runAllCurrent(): void {
      const current = [...pending.entries()];
      for (const [handle, callback] of current) {
        if (!pending.delete(handle)) continue;
        callback(performance.now());
      }
    },
  };
}
