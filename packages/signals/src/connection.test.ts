// Generated from crates/flight-signals/tests/connection_test.rs by flight-compiler.
// Rust is authoritative; run `npm run generate` after changing it.

import { describe, expect, it } from 'vitest';

import {
  connectSignal,
  connectSignalTracked,
  createSignal,
  disconnectSignalConnection,
  emitSignal,
  emitSignalSafe,
  isSignalConnectionConnected,
  isSignalConnectionPaused,
  pauseSignalConnection,
  resumeSignalConnection,
} from './contract.ts';
import type { SignalConnectOptions, SignalRaw, SignalTrackedConnectOptions } from './contract.ts';

interface ValueEvent {
  value: number;
}

describe('connectSignalTracked', () => {
  it('returns a connected handle whose slot receives typed payload', () => {
    const signal: SignalRaw<ValueEvent> = createSignal();
    const received: { value: number[] } = { value: [] as never[] };
    const out = received;
    const connection = connectSignalTracked(
      signal,
      (event: Readonly<ValueEvent>) => out.value.push(event.value),
      undefined,
    );
    expect(isSignalConnectionConnected(connection)).toBe(true);
    expect(!isSignalConnectionPaused(connection)).toBe(true);
    emitSignal(signal, { value: 42 });
    expect(received.value).toEqual([42]);
  });
  it('preserves priority ordering among tracked and ordinary slots', () => {
    const signal: SignalRaw<void> = createSignal();
    const calls: { value: string[] } = { value: [] as never[] };
    const lowCalls = calls;
    const lowOptions: SignalConnectOptions = { priority: -1, once: undefined };
    connectSignal(signal, (_unused0: void) => lowCalls.value.push('low'), lowOptions);
    const highCalls = calls;
    const highOptions: SignalTrackedConnectOptions = { priority: 10, once: undefined, scope: undefined };
    connectSignalTracked(signal, (_unused0: void) => highCalls.value.push('high'), highOptions);
    const normalCalls = calls;
    connectSignalTracked(signal, (_unused0: void) => normalCalls.value.push('normal'), undefined);
    emitSignal(signal, undefined);
    expect(calls.value).toEqual(['high', 'normal', 'low']);
  });
  it('disconnects a once connection after one ordinary emission', () => {
    const signal: SignalRaw<void> = createSignal();
    const count = { value: 0 };
    const counter = count;
    const options: SignalTrackedConnectOptions = { priority: undefined, once: true, scope: undefined };
    const connection = connectSignalTracked(signal, (_unused0: void) => (counter.value += 1), options);
    emitSignal(signal, undefined);
    emitSignal(signal, undefined);
    expect(count.value).toEqual(1);
    expect(!isSignalConnectionConnected(connection)).toBe(true);
  });
  it('disconnects a once connection after one safe emission', () => {
    const signal: SignalRaw<void> = createSignal();
    const count = { value: 0 };
    const counter = count;
    const options: SignalTrackedConnectOptions = { priority: undefined, once: true, scope: undefined };
    const connection = connectSignalTracked(signal, (_unused0: void) => (counter.value += 1), options);
    emitSignalSafe(signal, undefined);
    emitSignalSafe(signal, undefined);
    expect(count.value).toEqual(1);
    expect(!isSignalConnectionConnected(connection)).toBe(true);
  });
  it('skips a connection disconnected before its turn in ordinary dispatch', () => {
    const signal: SignalRaw<void> = createSignal();
    const calls: { value: string[] } = { value: [] as never[] };
    const laterCalls = calls;
    const later = connectSignalTracked(signal, (_unused0: void) => laterCalls.value.push('later'), undefined);
    const firstCalls = calls;
    const firstOptions: SignalTrackedConnectOptions = { priority: 10, once: undefined, scope: undefined };
    const laterForDisconnect = later;
    connectSignalTracked(
      signal,
      (_unused0: void) => {
        firstCalls.value.push('first');
        disconnectSignalConnection(laterForDisconnect);
      },
      firstOptions,
    );
    emitSignal(signal, undefined);
    expect(calls.value).toEqual(['first']);
    expect(!isSignalConnectionConnected(later)).toBe(true);
  });
  it('still invokes a snapshotted connection disconnected during safe dispatch', () => {
    const signal: SignalRaw<void> = createSignal();
    const calls: { value: string[] } = { value: [] as never[] };
    const laterCalls = calls;
    const later = connectSignalTracked(signal, (_unused0: void) => laterCalls.value.push('later'), undefined);
    const firstCalls = calls;
    const firstOptions: SignalTrackedConnectOptions = { priority: 10, once: undefined, scope: undefined };
    const laterForDisconnect = later;
    connectSignalTracked(
      signal,
      (_unused0: void) => {
        firstCalls.value.push('first');
        disconnectSignalConnection(laterForDisconnect);
      },
      firstOptions,
    );
    emitSignalSafe(signal, undefined);
    expect(calls.value).toEqual(['first', 'later']);
    expect(!isSignalConnectionConnected(later)).toBe(true);
  });
});

describe('disconnectSignalConnection', () => {
  it('disconnects idempotently and records the inactive state', () => {
    const signal: SignalRaw<void> = createSignal();
    const count = { value: 0 };
    const counter = count;
    const connection = connectSignalTracked(signal, (_unused0: void) => (counter.value += 1), undefined);
    disconnectSignalConnection(connection);
    disconnectSignalConnection(connection);
    emitSignal(signal, undefined);
    expect(count.value).toEqual(0);
    expect(!isSignalConnectionConnected(connection)).toBe(true);
  });
});

describe('isSignalConnectionConnected', () => {
  it('returns true while the registration is live', () => {
    const signal: SignalRaw<void> = createSignal();
    const connection = connectSignalTracked(signal, (_unused0: void) => {}, undefined);
    expect(isSignalConnectionConnected(connection)).toBe(true);
  });
  it('returns false after disconnect', () => {
    const signal: SignalRaw<void> = createSignal();
    const connection = connectSignalTracked(signal, (_unused0: void) => {}, undefined);
    disconnectSignalConnection(connection);
    expect(!isSignalConnectionConnected(connection)).toBe(true);
  });
});

describe('isSignalConnectionPaused', () => {
  it('returns false for an active connection', () => {
    const signal: SignalRaw<void> = createSignal();
    const connection = connectSignalTracked(signal, (_unused0: void) => {}, undefined);
    expect(!isSignalConnectionPaused(connection)).toBe(true);
  });
  it('returns true after pausing', () => {
    const signal: SignalRaw<void> = createSignal();
    const connection = connectSignalTracked(signal, (_unused0: void) => {}, undefined);
    pauseSignalConnection(connection);
    expect(isSignalConnectionPaused(connection)).toBe(true);
  });
});

describe('pauseSignalConnection', () => {
  it('skips a paused connection during ordinary emission without removing it', () => {
    const signal: SignalRaw<void> = createSignal();
    const count = { value: 0 };
    const counter = count;
    const connection = connectSignalTracked(signal, (_unused0: void) => (counter.value += 1), undefined);
    pauseSignalConnection(connection);
    emitSignal(signal, undefined);
    expect(count.value).toEqual(0);
    expect(isSignalConnectionConnected(connection)).toBe(true);
    expect(isSignalConnectionPaused(connection)).toBe(true);
  });
  it('skips a paused connection during safe emission without removing it', () => {
    const signal: SignalRaw<void> = createSignal();
    const count = { value: 0 };
    const counter = count;
    const connection = connectSignalTracked(signal, (_unused0: void) => (counter.value += 1), undefined);
    pauseSignalConnection(connection);
    emitSignalSafe(signal, undefined);
    expect(count.value).toEqual(0);
    expect(isSignalConnectionConnected(connection)).toBe(true);
    expect(isSignalConnectionPaused(connection)).toBe(true);
  });
  it('does not consume a paused once connection in either emission mode', () => {
    const signal: SignalRaw<void> = createSignal();
    const count = { value: 0 };
    const counter = count;
    const options: SignalTrackedConnectOptions = { priority: undefined, once: true, scope: undefined };
    const connection = connectSignalTracked(signal, (_unused0: void) => (counter.value += 1), options);
    pauseSignalConnection(connection);
    emitSignal(signal, undefined);
    emitSignalSafe(signal, undefined);
    resumeSignalConnection(connection);
    emitSignal(signal, undefined);
    emitSignalSafe(signal, undefined);
    expect(count.value).toEqual(1);
    expect(!isSignalConnectionConnected(connection)).toBe(true);
  });
});

describe('resumeSignalConnection', () => {
  it('restores a paused connection at its original priority position', () => {
    const signal: SignalRaw<void> = createSignal();
    const calls: { value: string[] } = { value: [] as never[] };
    const highCalls = calls;
    const options: SignalTrackedConnectOptions = { priority: 10, once: undefined, scope: undefined };
    const connection = connectSignalTracked(signal, (_unused0: void) => highCalls.value.push('high'), options);
    const lowCalls = calls;
    connectSignal(signal, (_unused0: void) => lowCalls.value.push('low'), undefined);
    pauseSignalConnection(connection);
    emitSignal(signal, undefined);
    resumeSignalConnection(connection);
    emitSignal(signal, undefined);
    expect(calls.value).toEqual(['low', 'high', 'low']);
    expect(isSignalConnectionConnected(connection)).toBe(true);
    expect(!isSignalConnectionPaused(connection)).toBe(true);
  });
});
