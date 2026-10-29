// Generated from crates/flight-signals/tests/signal_test.rs by flight-compiler.
// Rust is authoritative; run `npm run generate` after changing it.

import { initializeSignal } from '@flighthq/signals/contract';
import { describe, expect, it } from 'vitest';

import { connectSignal, createSignal, emitSignal, hasSignalSlots } from './contract.ts';
import type { SignalRaw } from './contract.ts';

describe('createSignal', () => {
  it('initializes with data none', () => {
    const signal: SignalRaw<void> = createSignal();
    expect(signal.data! === undefined).toBe(true);
  });
  it('initializes with no connected slots', () => {
    const signal: SignalRaw<void> = createSignal();
    expect(!hasSignalSlots(signal)).toBe(true);
  });
});

describe('initializeSignal', () => {
  // Rust-only: preserves emit and data cell handles
  it('reinstalls the default emitter after a custom callback', () => {
    let signal: SignalRaw<void> = createSignal();
    const customCalls = { value: 0 };
    const customCount = customCalls;
    signal.emit = (_unused0) => {
      customCount.value += 1;
    };
    initializeSignal(signal);
    emitSignal(signal, undefined);
    expect(customCalls.value).toEqual(0);
    const calls = { value: 0 };
    const count = calls;
    connectSignal(signal, (_unused0) => (count.value += 1), undefined);
    emitSignal(signal, undefined);
    expect(calls.value).toEqual(1);
  });
  it('is the construction initializer of create signal', () => {
    const signal: SignalRaw<void> = createSignal();
    connectSignal(signal, (_unused0) => {}, undefined);
    expect(hasSignalSlots(signal)).toBe(true);
    let reset: SignalRaw<void> = createSignal();
    connectSignal(reset, (_unused0) => {}, undefined);
    initializeSignal(reset);
    expect(!hasSignalSlots(reset)).toBe(true);
  });
});
