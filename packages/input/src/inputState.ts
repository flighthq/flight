// Generated from crates/flight-input/src/input_state.rs by flight-compiler.
// Rust is authoritative; run `npm run generate` after changing it.

import { allocateEntity } from '@flighthq/entity/contract';
import { connectSignal, disconnectSignal } from '@flighthq/signals/contract';
import type { SignalSlot, SlotId } from '@flighthq/signals/contract';

import type {
  InputDisposer,
  InputGamepadAxisData,
  InputGamepadButtonData,
  InputGamepadConnectData,
  InputKeyboardData,
  InputManagerRaw,
  InputPointerData,
  InputStateRaw,
} from './types.ts';

const MAX_GAMEPAD_AXES: number = 32;

const MAX_GAMEPAD_BUTTONS: number = 64;

/**
 * Subscribes a state to every manager signal and returns a disposer (TS
 * `connectInputStateToInputManager`). Edge sets record transitions, so a held key's auto-repeat
 * does not count as a new press and a press plus release in one frame both survive.
 */
export function connectInputStateToInputManager(state: InputStateRaw, manager: InputManagerRaw): InputDisposer {
  const [
    keyDownSignal,
    keyUpSignal,
    pointerDownSignal,
    pointerUpSignal,
    pointerCancelSignal,
    gamepadButtonDownSignal,
    gamepadButtonUpSignal,
    gamepadAxisMoveSignal,
    gamepadConnectSignal,
    gamepadDisconnectSignal,
  ] = (() => {
    const locked = manager!;
    return [
      locked.onKeyDown,
      locked.onKeyUp,
      locked.onPointerDown,
      locked.onPointerUp,
      locked.onPointerCancel,
      locked.onGamepadButtonDown,
      locked.onGamepadButtonUp,
      locked.onGamepadAxisMove,
      locked.onGamepadConnect,
      locked.onGamepadDisconnect,
    ];
  })();
  const onKeyDown: SignalSlot<InputKeyboardData> = (() => {
    const target = state;
    return (data: Readonly<InputKeyboardData>) => {
      const locked: InputStateRaw = target!;
      if (!locked.keysDown.has(data.keyCode)) {
        (<T>(items: Set<T>, value: T): boolean => {
          if (items.has(value)) {
            return false;
          }
          items.add(value);
          return true;
        })(locked.justPressedKeys, data.keyCode);
      }
      (<T>(items: Set<T>, value: T): boolean => {
        if (items.has(value)) {
          return false;
        }
        items.add(value);
        return true;
      })(locked.keysDown, data.keyCode);
    };
  })();
  const onKeyUp: SignalSlot<InputKeyboardData> = (() => {
    const target = state;
    return (data: Readonly<InputKeyboardData>) => {
      const locked: InputStateRaw = target!;
      locked.keysDown.delete(data.keyCode);
      (<T>(items: Set<T>, value: T): boolean => {
        if (items.has(value)) {
          return false;
        }
        items.add(value);
        return true;
      })(locked.justReleasedKeys, data.keyCode);
    };
  })();
  const onPointerDown: SignalSlot<InputPointerData> = (() => {
    const target = state;
    return (data: Readonly<InputPointerData>) => {
      const locked: InputStateRaw = target!;
      const previous = locked.pointerButtonsDown.get(data.pointerId) ?? 0;
      const bit = pointerButtonBit(data.button);
      (<K, V>(entries: Map<K, V>, key: K, value: V): V | undefined => {
        const previous = entries.get(key);
        entries.set(key, value);
        return previous;
      })(locked.pointerButtonsDown, data.pointerId, previous | bit);
    };
  })();
  const onPointerUp: SignalSlot<InputPointerData> = (() => {
    const target = state;
    return (data: Readonly<InputPointerData>) => {
      const locked: InputStateRaw = target!;
      const previous = locked.pointerButtonsDown.get(data.pointerId) ?? 0;
      const bit = pointerButtonBit(data.button);
      const next = previous & ((bit ^ 0xffff_ffff) >>> 0);
      if (next === 0) {
        (<K, V>(entries: Map<K, V>, key: K): V | undefined => {
          const previous = entries.get(key);
          entries.delete(key);
          return previous;
        })(locked.pointerButtonsDown, data.pointerId);
      } else {
        (<K, V>(entries: Map<K, V>, key: K, value: V): V | undefined => {
          const previous = entries.get(key);
          entries.set(key, value);
          return previous;
        })(locked.pointerButtonsDown, data.pointerId, next);
      }
    };
  })();
  const onPointerCancel: SignalSlot<InputPointerData> = (() => {
    const target = state;
    return (data: Readonly<InputPointerData>) => {
      const locked: InputStateRaw = target!;
      (<K, V>(entries: Map<K, V>, key: K): V | undefined => {
        const previous = entries.get(key);
        entries.delete(key);
        return previous;
      })(locked.pointerButtonsDown, data.pointerId);
    };
  })();
  const onGamepadButtonDown: SignalSlot<InputGamepadButtonData> = (() => {
    const target = state;
    return (data: Readonly<InputGamepadButtonData>) => {
      const key = data.gamepad * MAX_GAMEPAD_BUTTONS + data.button;
      const locked: InputStateRaw = target!;
      if (!locked.gamepadButtonsDown.has(key)) {
        (<T>(items: Set<T>, value: T): boolean => {
          if (items.has(value)) {
            return false;
          }
          items.add(value);
          return true;
        })(locked.justPressedGamepadButtons, key);
      }
      (<T>(items: Set<T>, value: T): boolean => {
        if (items.has(value)) {
          return false;
        }
        items.add(value);
        return true;
      })(locked.gamepadButtonsDown, key);
    };
  })();
  const onGamepadButtonUp: SignalSlot<InputGamepadButtonData> = (() => {
    const target = state;
    return (data: Readonly<InputGamepadButtonData>) => {
      const key = data.gamepad * MAX_GAMEPAD_BUTTONS + data.button;
      const locked: InputStateRaw = target!;
      locked.gamepadButtonsDown.delete(key);
      (<T>(items: Set<T>, value: T): boolean => {
        if (items.has(value)) {
          return false;
        }
        items.add(value);
        return true;
      })(locked.justReleasedGamepadButtons, key);
    };
  })();
  const onGamepadAxisMove: SignalSlot<InputGamepadAxisData> = (() => {
    const target = state;
    return (data: Readonly<InputGamepadAxisData>) => {
      const key = data.gamepad * MAX_GAMEPAD_AXES + data.axis;
      const locked: InputStateRaw = target!;
      (<K, V>(entries: Map<K, V>, key: K, value: V): V | undefined => {
        const previous = entries.get(key);
        entries.set(key, value);
        return previous;
      })(locked.axisValues, key, data.value);
    };
  })();
  const onGamepadConnect: SignalSlot<InputGamepadConnectData> = (() => {
    const target = state;
    return (data: Readonly<InputGamepadConnectData>) => {
      const locked: InputStateRaw = target!;
      clearGamepadState(locked, data.gamepad);
    };
  })();
  const onGamepadDisconnect: SignalSlot<InputGamepadConnectData> = (() => {
    const target = state;
    return (data: Readonly<InputGamepadConnectData>) => {
      const locked: InputStateRaw = target!;
      clearGamepadState(locked, data.gamepad);
    };
  })();
  const ids: readonly [SlotId, SlotId, SlotId, SlotId, SlotId, SlotId, SlotId, SlotId, SlotId, SlotId] = [
    connectSignal(keyDownSignal, onKeyDown, undefined),
    connectSignal(keyUpSignal, onKeyUp, undefined),
    connectSignal(pointerDownSignal, onPointerDown, undefined),
    connectSignal(pointerUpSignal, onPointerUp, undefined),
    connectSignal(pointerCancelSignal, onPointerCancel, undefined),
    connectSignal(gamepadButtonDownSignal, onGamepadButtonDown, undefined),
    connectSignal(gamepadButtonUpSignal, onGamepadButtonUp, undefined),
    connectSignal(gamepadAxisMoveSignal, onGamepadAxisMove, undefined),
    connectSignal(gamepadConnectSignal, onGamepadConnect, undefined),
    connectSignal(gamepadDisconnectSignal, onGamepadDisconnect, undefined),
  ];
  return () => {
    disconnectSignal(keyDownSignal, ids[0]);
    disconnectSignal(keyUpSignal, ids[1]);
    disconnectSignal(pointerDownSignal, ids[2]);
    disconnectSignal(pointerUpSignal, ids[3]);
    disconnectSignal(pointerCancelSignal, ids[4]);
    disconnectSignal(gamepadButtonDownSignal, ids[5]);
    disconnectSignal(gamepadButtonUpSignal, ids[6]);
    disconnectSignal(gamepadAxisMoveSignal, ids[7]);
    disconnectSignal(gamepadConnectSignal, ids[8]);
    disconnectSignal(gamepadDisconnectSignal, ids[9]);
  };
}

/**
 * Allocates an empty held-state snapshot (TS `createInputState`).
 */
export function createInputState(): InputStateRaw {
  let out: InputStateRaw = allocateEntity<InputStateRaw>();
  initializeInputState(out);
  return out;
}

function clearGamepadState(state: InputStateRaw, gamepad: number): void {
  for (let button = 0; button < MAX_GAMEPAD_BUTTONS; button += 1) {
    const key = gamepad * MAX_GAMEPAD_BUTTONS + button;
    state.gamepadButtonsDown.delete(key);
    state.justPressedGamepadButtons.delete(key);
    state.justReleasedGamepadButtons.delete(key);
  }
  for (let axis = 0; axis < MAX_GAMEPAD_AXES; axis += 1) {
    (<K, V>(entries: Map<K, V>, key: K): V | undefined => {
      const previous = entries.get(key);
      entries.delete(key);
      return previous;
    })(state.axisValues, gamepad * MAX_GAMEPAD_AXES + axis);
  }
}

/**
 * Clears the four per-frame edge sets (TS `endInputStateFrame`).
 */
export function endInputStateFrame(state: InputStateRaw): void {
  const locked: InputStateRaw = state!;
  locked.justPressedKeys.clear();
  locked.justReleasedKeys.clear();
  locked.justPressedGamepadButtons.clear();
  locked.justReleasedGamepadButtons.clear();
}

/**
 * Returns the current gamepad axis value, or 0 when not recorded (TS `getInputGamepadAxis`).
 */
export function getInputGamepadAxis(state: InputStateRaw, gamepad: number, axis: number): number {
  const locked: Readonly<InputStateRaw> = state!;
  return locked.axisValues.get(gamepad * MAX_GAMEPAD_AXES + axis) ?? 0.0;
}

/**
 * Gives a state under construction empty maps and sets (TS `initializeInputState`).
 */
export function initializeInputState(out: InputStateRaw): void {
  out.axisValues = new Map();
  out.gamepadButtonsDown = new Set();
  out.justPressedGamepadButtons = new Set();
  out.justPressedKeys = new Set();
  out.justReleasedGamepadButtons = new Set();
  out.justReleasedKeys = new Set();
  out.keysDown = new Set();
  out.pointerButtonsDown = new Map();
}

/**
 * Returns whether the gamepad button is held (TS `isInputGamepadButtonDown`).
 */
export function isInputGamepadButtonDown(state: InputStateRaw, gamepad: number, button: number): boolean {
  const locked: Readonly<InputStateRaw> = state!;
  return locked.gamepadButtonsDown.has(gamepad * MAX_GAMEPAD_BUTTONS + button);
}

/**
 * Returns whether the key code is held (TS `isInputKeyDown`).
 */
export function isInputKeyDown(state: InputStateRaw, keyCode: number): boolean {
  const locked: Readonly<InputStateRaw> = state!;
  return locked.keysDown.has(keyCode);
}

/**
 * Returns whether the pointer button is held for that pointer (TS `isInputPointerButtonDown`).
 */
export function isInputPointerButtonDown(state: InputStateRaw, pointerId: number, button: number): boolean {
  const locked: Readonly<InputStateRaw> = state!;
  const bits = locked.pointerButtonsDown.get(pointerId) ?? 0;
  return (bits & pointerButtonBit(button)) !== 0;
}

function pointerButtonBit(button: number): number {
  return (1 << ((button >>> 0) & 31)) >>> 0;
}

/**
 * Returns whether the gamepad button transitioned up -> down this frame (TS
 * `wasInputGamepadButtonPressed`).
 */
export function wasInputGamepadButtonPressed(state: InputStateRaw, gamepad: number, button: number): boolean {
  const locked: Readonly<InputStateRaw> = state!;
  return locked.justPressedGamepadButtons.has(gamepad * MAX_GAMEPAD_BUTTONS + button);
}

/**
 * Returns whether the gamepad button transitioned down -> up this frame (TS
 * `wasInputGamepadButtonReleased`).
 */
export function wasInputGamepadButtonReleased(state: InputStateRaw, gamepad: number, button: number): boolean {
  const locked: Readonly<InputStateRaw> = state!;
  return locked.justReleasedGamepadButtons.has(gamepad * MAX_GAMEPAD_BUTTONS + button);
}

/**
 * Returns whether the key transitioned up -> down this frame (TS `wasInputKeyPressed`).
 */
export function wasInputKeyPressed(state: InputStateRaw, keyCode: number): boolean {
  const locked: Readonly<InputStateRaw> = state!;
  return locked.justPressedKeys.has(keyCode);
}

/**
 * Returns whether the key transitioned down -> up this frame (TS `wasInputKeyReleased`).
 */
export function wasInputKeyReleased(state: InputStateRaw, keyCode: number): boolean {
  const locked: Readonly<InputStateRaw> = state!;
  return locked.justReleasedKeys.has(keyCode);
}
