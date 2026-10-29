// Generated from crates/flight-input/tests/input_signals_test.rs by flight-compiler.
// Rust is authoritative; run `npm run generate` after changing it.

import type { SignalRaw } from '@flighthq/signals/contract';
import { describe, expect, it } from 'vitest';

import { createInputManager, createInputSignals, initializeInputManager, initializeInputSignals } from './contract.ts';
import type { InputManagerRaw, InputSignalsRaw } from './contract.ts';

function signalIsInert<T>(signal: Readonly<SignalRaw<T>>): boolean {
  return signal.data! === undefined;
}

describe('createInputManager', () => {
  it('is enabled by default', () => {
    const manager = createInputManager();
    expect(manager!.enabled).toBe(true);
  });
  it('creates all fifteen inert signals', () => {
    const manager = createInputManager();
    const borrowed = manager!;
    expect(signalIsInert(borrowed.onKeyDown)).toBe(true);
    expect(signalIsInert(borrowed.onKeyUp)).toBe(true);
    expect(signalIsInert(borrowed.onPointerDown)).toBe(true);
    expect(signalIsInert(borrowed.onPointerUp)).toBe(true);
    expect(signalIsInert(borrowed.onPointerMove)).toBe(true);
    expect(signalIsInert(borrowed.onPointerMoveRelative)).toBe(true);
    expect(signalIsInert(borrowed.onPointerCancel)).toBe(true);
    expect(signalIsInert(borrowed.onGamepadButtonDown)).toBe(true);
    expect(signalIsInert(borrowed.onGamepadButtonUp)).toBe(true);
    expect(signalIsInert(borrowed.onGamepadAxisMove)).toBe(true);
    expect(signalIsInert(borrowed.onGamepadConnect)).toBe(true);
    expect(signalIsInert(borrowed.onGamepadDisconnect)).toBe(true);
    expect(signalIsInert(borrowed.onTextInput)).toBe(true);
    expect(signalIsInert(borrowed.onTextEdit)).toBe(true);
    expect(signalIsInert(borrowed.onWheel)).toBe(true);
  });
});

describe('createInputSignals', () => {
  it('creates all fifteen inert signals', () => {
    const signals = createInputSignals();
    const borrowed = signals!;
    expect(signalIsInert(borrowed.onKeyDown)).toBe(true);
    expect(signalIsInert(borrowed.onWheel)).toBe(true);
    expect(signalIsInert(borrowed.onGamepadAxisMove)).toBe(true);
  });
});

describe('initializeInputManager', () => {
  function reinitializeDisabled(manager: InputManagerRaw): void {
    let locked = manager!;
    locked.enabled = false;
    initializeInputManager(locked);
  }
  it('enables the manager and gives it inert signals', () => {
    const manager = createInputManager();
    reinitializeDisabled(manager);
    const borrowed = manager!;
    expect(borrowed.enabled).toBe(true);
    expect(signalIsInert(borrowed.onKeyDown)).toBe(true);
  });
});

describe('initializeInputSignals', () => {
  function reinitialize(signals: InputSignalsRaw): void {
    let locked = signals!;
    initializeInputSignals(locked);
  }
  it('replaces every signal with a fresh inert one', () => {
    const signals = createInputSignals();
    reinitialize(signals);
    const borrowed = signals!;
    expect(signalIsInert(borrowed.onTextInput)).toBe(true);
    expect(signalIsInert(borrowed.onGamepadConnect)).toBe(true);
  });
});
