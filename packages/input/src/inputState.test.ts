// Generated from crates/flight-input/tests/input_state_test.rs by flight-compiler.
// Rust is authoritative; run `npm run generate` after changing it.

import { emitSignal } from '@flighthq/signals/contract';
import { describe, expect, it } from 'vitest';

import {
  connectInputStateToInputManager,
  createInputManager,
  createInputState,
  endInputStateFrame,
  getInputGamepadAxis,
  initializeInputState,
  isInputGamepadButtonDown,
  isInputKeyDown,
  isInputPointerButtonDown,
  wasInputGamepadButtonPressed,
  wasInputGamepadButtonReleased,
  wasInputKeyPressed,
  wasInputKeyReleased,
} from './contract.ts';
import type {
  InputDisposer,
  InputGamepadAxisData,
  InputGamepadButtonData,
  InputGamepadConnectData,
  InputKeyboardData,
  InputManagerRaw,
  InputPointerData,
  InputStateRaw,
} from './contract.ts';

function keyboardData(keyCode: number): InputKeyboardData {
  return {
    altKey: false,
    capsLock: false,
    code: '',
    ctrlKey: false,
    key: '',
    keyCode: keyCode,
    location: 0,
    metaKey: false,
    modifier: 0,
    numLock: false,
    repeat: false,
    shiftKey: false,
    timeStamp: 0.0,
  };
}

function pointerData(pointerId: number, button: number): InputPointerData {
  return {
    altKey: false,
    button: button,
    buttons: 0,
    ctrlKey: false,
    deltaX: 0.0,
    deltaY: 0.0,
    height: 1.0,
    isPrimary: true,
    metaKey: false,
    pointerId: pointerId,
    pointerType: 'mouse',
    pressure: 0.0,
    shiftKey: false,
    tiltX: 0.0,
    tiltY: 0.0,
    timeStamp: 0.0,
    twist: 0.0,
    wheelMode: 'unknown',
    width: 1.0,
    x: 0.0,
    y: 0.0,
  };
}

function gamepadButton(gamepad: number, button: number, value: number): InputGamepadButtonData {
  return { button: button, gamepad: gamepad, timeStamp: 0.0, value: value };
}

function gamepadConnect(gamepad: number): InputGamepadConnectData {
  return { gamepad: gamepad, id: 'Pad', mapping: 'standard' };
}

function connected(): readonly [InputStateRaw, InputManagerRaw, InputDisposer] {
  const manager = createInputManager();
  const state = createInputState();
  const disposer = connectInputStateToInputManager(state, manager);
  return [state, manager, disposer];
}

describe('connectInputStateToInputManager', () => {
  it('tracks held keys', () => {
    const [state, manager, _disposer] = connected();
    const data = keyboardData(65);
    emitSignal(manager!.onKeyDown, data);
    expect(isInputKeyDown(state, 65)).toBe(true);
    emitSignal(manager!.onKeyUp, data);
    expect(!isInputKeyDown(state, 65)).toBe(true);
  });
  it('tracks held pointer buttons and clears on cancel', () => {
    const [state, manager, _disposer] = connected();
    const data = pointerData(1, 0);
    emitSignal(manager!.onPointerDown, data);
    expect(isInputPointerButtonDown(state, 1, 0)).toBe(true);
    emitSignal(manager!.onPointerUp, data);
    expect(!isInputPointerButtonDown(state, 1, 0)).toBe(true);
    emitSignal(manager!.onPointerDown, data);
    emitSignal(manager!.onPointerCancel, data);
    expect(!isInputPointerButtonDown(state, 1, 0)).toBe(true);
  });
  it('tracks gamepad buttons and axes and clears on connect', () => {
    const [state, manager, _disposer] = connected();
    emitSignal(manager!.onGamepadButtonDown, gamepadButton(2, 3, 1.0));
    emitSignal(manager!.onGamepadAxisMove, { axis: 1, gamepad: 2, timeStamp: 0.0, value: 0.75 });
    expect(isInputGamepadButtonDown(state, 2, 3)).toBe(true);
    expect(getInputGamepadAxis(state, 2, 1)).toEqual(0.75);
    emitSignal(manager!.onGamepadConnect, gamepadConnect(2));
    expect(!isInputGamepadButtonDown(state, 2, 3)).toBe(true);
    expect(getInputGamepadAxis(state, 2, 1)).toEqual(0.0);
  });
  it('records edges only for genuine transitions', () => {
    const [state, manager, _disposer] = connected();
    const data = gamepadButton(0, 1, 1.0);
    emitSignal(manager!.onGamepadButtonDown, data);
    expect(wasInputGamepadButtonPressed(state, 0, 1)).toBe(true);
    endInputStateFrame(state);
    emitSignal(manager!.onGamepadButtonDown, data);
    expect(!wasInputGamepadButtonPressed(state, 0, 1)).toBe(true);
    expect(isInputGamepadButtonDown(state, 0, 1)).toBe(true);
  });
  it('keeps a press and release in the same frame', () => {
    const [state, manager, _disposer] = connected();
    const data = keyboardData(65);
    emitSignal(manager!.onKeyDown, data);
    emitSignal(manager!.onKeyUp, data);
    expect(wasInputKeyPressed(state, 65)).toBe(true);
    expect(wasInputKeyReleased(state, 65)).toBe(true);
    expect(!isInputKeyDown(state, 65)).toBe(true);
  });
  it('ignores the auto repeat keydown of a held key', () => {
    const [state, manager, _disposer] = connected();
    const data = keyboardData(65);
    emitSignal(manager!.onKeyDown, data);
    endInputStateFrame(state);
    let repeat = data;
    repeat.repeat = true;
    emitSignal(manager!.onKeyDown, repeat);
    expect(!wasInputKeyPressed(state, 65)).toBe(true);
    expect(isInputKeyDown(state, 65)).toBe(true);
  });
  it('records a release then press again in the same frame', () => {
    const [state, manager, _disposer] = connected();
    const data = keyboardData(65);
    emitSignal(manager!.onKeyDown, data);
    endInputStateFrame(state);
    emitSignal(manager!.onKeyUp, data);
    emitSignal(manager!.onKeyDown, data);
    expect(wasInputKeyPressed(state, 65)).toBe(true);
    expect(wasInputKeyReleased(state, 65)).toBe(true);
    expect(isInputKeyDown(state, 65)).toBe(true);
  });
  it('the disposer stops tracking', () => {
    const [state, manager, disposer] = connected();
    const data = keyboardData(65);
    emitSignal(manager!.onKeyDown, data);
    expect(isInputKeyDown(state, 65)).toBe(true);
    disposer();
    emitSignal(manager!.onKeyUp, data);
    expect(isInputKeyDown(state, 65)).toBe(true);
  });
  it('every button of one pointer is tracked independently', () => {
    const [state, manager, _disposer] = connected();
    emitSignal(manager!.onPointerDown, pointerData(1, 0));
    emitSignal(manager!.onPointerDown, pointerData(1, 1));
    expect(isInputPointerButtonDown(state, 1, 0)).toBe(true);
    expect(isInputPointerButtonDown(state, 1, 1)).toBe(true);
    emitSignal(manager!.onPointerUp, pointerData(1, 0));
    expect(!isInputPointerButtonDown(state, 1, 0)).toBe(true);
    expect(isInputPointerButtonDown(state, 1, 1)).toBe(true);
  });
});

describe('createInputState', () => {
  it('starts with empty maps and sets', () => {
    const state = createInputState();
    const borrowed: Readonly<InputStateRaw> = state!;
    expect(borrowed.keysDown.size === 0).toBe(true);
    expect(borrowed.pointerButtonsDown.size === 0).toBe(true);
    expect(borrowed.gamepadButtonsDown.size === 0).toBe(true);
    expect(borrowed.axisValues.size === 0).toBe(true);
    expect(borrowed.justPressedKeys.size === 0).toBe(true);
    expect(borrowed.justReleasedKeys.size === 0).toBe(true);
    expect(borrowed.justPressedGamepadButtons.size === 0).toBe(true);
    expect(borrowed.justReleasedGamepadButtons.size === 0).toBe(true);
  });
});

describe('endInputStateFrame', () => {
  function markEdges(state: InputStateRaw): void {
    const borrowed: InputStateRaw = state!;
    (<T>(items: Set<T>, value: T): boolean => {
      if (items.has(value)) {
        return false;
      }
      items.add(value);
      return true;
    })(borrowed.justPressedKeys, 1);
    (<T>(items: Set<T>, value: T): boolean => {
      if (items.has(value)) {
        return false;
      }
      items.add(value);
      return true;
    })(borrowed.justReleasedKeys, 2);
    (<T>(items: Set<T>, value: T): boolean => {
      if (items.has(value)) {
        return false;
      }
      items.add(value);
      return true;
    })(borrowed.justPressedGamepadButtons, 3);
    (<T>(items: Set<T>, value: T): boolean => {
      if (items.has(value)) {
        return false;
      }
      items.add(value);
      return true;
    })(borrowed.justReleasedGamepadButtons, 4);
  }
  it('clears all four edge sets', () => {
    const state = createInputState();
    markEdges(state);
    endInputStateFrame(state);
    const borrowed: Readonly<InputStateRaw> = state!;
    expect(borrowed.justPressedKeys.size === 0).toBe(true);
    expect(borrowed.justReleasedKeys.size === 0).toBe(true);
    expect(borrowed.justPressedGamepadButtons.size === 0).toBe(true);
    expect(borrowed.justReleasedGamepadButtons.size === 0).toBe(true);
  });
});

describe('getInputGamepadAxis', () => {
  it('returns zero for an unknown combination', () => {
    const state = createInputState();
    expect(getInputGamepadAxis(state, 0, 0)).toEqual(0.0);
  });
});

describe('initializeInputState', () => {
  function pressKey(state: InputStateRaw, keyCode: number): void {
    const borrowed: InputStateRaw = state!;
    (<T>(items: Set<T>, value: T): boolean => {
      if (items.has(value)) {
        return false;
      }
      items.add(value);
      return true;
    })(borrowed.keysDown, keyCode);
  }
  it('replaces the state with empty structures', () => {
    const state = createInputState();
    pressKey(state, 65);
    const raw = createInputState();
    initializeInputState(raw!);
    const held: Readonly<InputStateRaw> = state!;
    const cleared: Readonly<InputStateRaw> = raw!;
    expect(held.keysDown.has(65)).toBe(true);
    expect(cleared.keysDown.size === 0).toBe(true);
  });
});

describe('isInputGamepadButtonDown', () => {
  it('returns false for an unknown combination', () => {
    const state = createInputState();
    expect(!isInputGamepadButtonDown(state, 0, 0)).toBe(true);
  });
});

describe('isInputKeyDown', () => {
  it('returns false when no keys are held', () => {
    const state = createInputState();
    expect(!isInputKeyDown(state, 65)).toBe(true);
  });
});

describe('isInputPointerButtonDown', () => {
  it('returns false when no buttons are held', () => {
    const state = createInputState();
    expect(!isInputPointerButtonDown(state, 0, 0)).toBe(true);
  });
});

describe('wasInputGamepadButtonPressed', () => {
  it('returns true when a button was pressed this frame', () => {
    const [state, manager, _disposer] = connected();
    emitSignal(manager!.onGamepadButtonDown, gamepadButton(0, 0, 1.0));
    expect(wasInputGamepadButtonPressed(state, 0, 0)).toBe(true);
  });
});

describe('wasInputGamepadButtonReleased', () => {
  it('returns true when a button was released this frame', () => {
    const [state, manager, _disposer] = connected();
    emitSignal(manager!.onGamepadButtonDown, gamepadButton(0, 0, 1.0));
    endInputStateFrame(state);
    emitSignal(manager!.onGamepadButtonUp, gamepadButton(0, 0, 0.0));
    expect(wasInputGamepadButtonReleased(state, 0, 0)).toBe(true);
  });
});

describe('wasInputKeyPressed', () => {
  it('returns false before any event and after the frame ends', () => {
    const idle = createInputState();
    expect(!wasInputKeyPressed(idle, 65)).toBe(true);
    const [state, manager, _disposer] = connected();
    emitSignal(manager!.onKeyDown, keyboardData(65));
    expect(wasInputKeyPressed(state, 65)).toBe(true);
    endInputStateFrame(state);
    expect(!wasInputKeyPressed(state, 65)).toBe(true);
  });
});

describe('wasInputKeyReleased', () => {
  it('returns true only for a release this frame', () => {
    const idle = createInputState();
    expect(!wasInputKeyReleased(idle, 65)).toBe(true);
    const [state, manager, _disposer] = connected();
    emitSignal(manager!.onKeyDown, keyboardData(65));
    emitSignal(manager!.onKeyUp, keyboardData(65));
    expect(wasInputKeyReleased(state, 65)).toBe(true);
    endInputStateFrame(state);
    expect(!wasInputKeyReleased(state, 65)).toBe(true);
  });
});
