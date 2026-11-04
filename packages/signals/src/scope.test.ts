// Generated from crates/flight-signals/tests/scope_test.rs by flight-compiler.
// Rust is authoritative; run `npm run generate` after changing it.

import { initializeSignalScope } from '@flighthq/signals/contract';
import { describe, expect, it } from 'vitest';

import {
  connectSignal,
  connectSignalTracked,
  createSignal,
  createSignalScope,
  disconnectSignalConnection,
  disconnectSignalScope,
  emitSignal,
  hasSignalSlots,
  isSignalConnectionConnected,
  isSignalConnectionPaused,
  pauseSignalConnection,
  resumeSignalConnection,
} from './contract.ts';
import type { SignalRaw, SignalTrackedConnectOptions } from './contract.ts';

describe('createSignalScope', () => {
  it('starts empty and collects only the connections that name it', () => {
    const scope = createSignalScope();
    expect(scope.connections!.length === 0).toBe(true);
    const signal: SignalRaw<void> = createSignal();
    const options: SignalTrackedConnectOptions = { priority: undefined, once: undefined, scope: scope };
    connectSignalTracked(signal, (_unused0: void) => {}, options);
    connectSignalTracked(signal, (_unused0: void) => {}, undefined);
    expect(scope.connections!.length).toEqual(1);
  });
  it('hands out an independent record per call', () => {
    const first = createSignalScope();
    const second = createSignalScope();
    const signal: SignalRaw<void> = createSignal();
    const options: SignalTrackedConnectOptions = { priority: undefined, once: undefined, scope: first };
    connectSignalTracked(signal, (_unused0: void) => {}, options);
    expect(second.connections!.length === 0).toBe(true);
  });
  it('registers a connection without disturbing its handle semantics', () => {
    const scope = createSignalScope();
    const signal: SignalRaw<void> = createSignal();
    const seen: { value: number[] } = { value: [] as never[] };
    const out = seen;
    const options: SignalTrackedConnectOptions = { priority: 5, once: undefined, scope: scope };
    const connection = connectSignalTracked(signal, (_unused0: void) => out.value.push(7), options);
    expect(isSignalConnectionConnected(connection)).toBe(true);
    expect(!isSignalConnectionPaused(connection)).toBe(true);
    emitSignal(signal, undefined);
    expect(seen.value).toEqual([7]);
    expect(scope.connections!.length).toEqual(1);
  });
});

describe('disconnectSignalScope', () => {
  it('tears down every member in one call and empties the scope', () => {
    const scope = createSignalScope();
    const signal: SignalRaw<void> = createSignal();
    const calls: { value: string[] } = { value: [] as never[] };
    const firstCalls = calls;
    const firstOptions: SignalTrackedConnectOptions = { priority: undefined, once: undefined, scope: scope };
    const first = connectSignalTracked(signal, (_unused0: void) => firstCalls.value.push('a'), firstOptions);
    const secondCalls = calls;
    const secondOptions: SignalTrackedConnectOptions = { priority: undefined, once: undefined, scope: scope };
    const second = connectSignalTracked(signal, (_unused0: void) => secondCalls.value.push('b'), secondOptions);
    disconnectSignalScope(scope);
    emitSignal(signal, undefined);
    expect(calls.value.length === 0).toBe(true);
    expect(scope.connections!.length === 0).toBe(true);
    expect(!isSignalConnectionConnected(first)).toBe(true);
    expect(!isSignalConnectionConnected(second)).toBe(true);
    expect(!hasSignalSlots(signal)).toBe(true);
  });
  it('is idempotent across repeated teardowns', () => {
    const scope = createSignalScope();
    const signal: SignalRaw<void> = createSignal();
    const calls = { value: 0 };
    const counter = calls;
    const options: SignalTrackedConnectOptions = { priority: undefined, once: undefined, scope: scope };
    connectSignalTracked(signal, (_unused0: void) => (counter.value += 1), options);
    disconnectSignalScope(scope);
    disconnectSignalScope(scope);
    disconnectSignalScope(scope);
    emitSignal(signal, undefined);
    expect(calls.value).toEqual(0);
    expect(scope.connections!.length === 0).toBe(true);
  });
  it('accepts an empty scope', () => {
    const scope = createSignalScope();
    disconnectSignalScope(scope);
    expect(scope.connections!.length === 0).toBe(true);
  });
  it('leaves untracked and unscoped tracked connections on the signal', () => {
    const scope = createSignalScope();
    const signal: SignalRaw<void> = createSignal();
    const calls: { value: string[] } = { value: [] as never[] };
    const plainCalls = calls;
    connectSignal(signal, (_unused0: void) => plainCalls.value.push('plain'), undefined);
    const unscopedCalls = calls;
    const unscoped = connectSignalTracked(signal, (_unused0: void) => unscopedCalls.value.push('unscoped'), undefined);
    const scopedCalls = calls;
    const options: SignalTrackedConnectOptions = { priority: undefined, once: undefined, scope: scope };
    connectSignalTracked(signal, (_unused0: void) => scopedCalls.value.push('scoped'), options);
    disconnectSignalScope(scope);
    emitSignal(signal, undefined);
    expect(calls.value).toEqual(['plain', 'unscoped']);
    expect(isSignalConnectionConnected(unscoped)).toBe(true);
  });
  it('disconnects a paused member rather than skipping it', () => {
    const scope = createSignalScope();
    const signal: SignalRaw<void> = createSignal();
    const calls = { value: 0 };
    const counter = calls;
    const options: SignalTrackedConnectOptions = { priority: undefined, once: undefined, scope: scope };
    const connection = connectSignalTracked(signal, (_unused0: void) => (counter.value += 1), options);
    pauseSignalConnection(connection);
    disconnectSignalScope(scope);
    expect(!isSignalConnectionConnected(connection)).toBe(true);
    resumeSignalConnection(connection);
    emitSignal(signal, undefined);
    expect(calls.value).toEqual(0);
    expect(isSignalConnectionPaused(connection)).toBe(true);
  });
  it('passes over a member already disconnected through its own handle', () => {
    const scope = createSignalScope();
    const signal: SignalRaw<void> = createSignal();
    const calls: { value: string[] } = { value: [] as never[] };
    const firstCalls = calls;
    const firstOptions: SignalTrackedConnectOptions = { priority: undefined, once: undefined, scope: scope };
    const first = connectSignalTracked(signal, (_unused0: void) => firstCalls.value.push('a'), firstOptions);
    const secondCalls = calls;
    const secondOptions: SignalTrackedConnectOptions = { priority: undefined, once: undefined, scope: scope };
    const second = connectSignalTracked(signal, (_unused0: void) => secondCalls.value.push('b'), secondOptions);
    disconnectSignalConnection(first);
    disconnectSignalScope(scope);
    emitSignal(signal, undefined);
    expect(calls.value.length === 0).toBe(true);
    expect(!isSignalConnectionConnected(second)).toBe(true);
    expect(scope.connections!.length === 0).toBe(true);
  });
  it('passes over a once member that already fired', () => {
    const scope = createSignalScope();
    const signal: SignalRaw<void> = createSignal();
    const calls = { value: 0 };
    const counter = calls;
    const options: SignalTrackedConnectOptions = { priority: undefined, once: true, scope: scope };
    const connection = connectSignalTracked(signal, (_unused0: void) => (counter.value += 1), options);
    emitSignal(signal, undefined);
    expect(calls.value).toEqual(1);
    expect(!isSignalConnectionConnected(connection)).toBe(true);
    disconnectSignalScope(scope);
    emitSignal(signal, undefined);
    expect(calls.value).toEqual(1);
    expect(scope.connections!.length === 0).toBe(true);
  });
  it('tears down a once member that never fired', () => {
    const scope = createSignalScope();
    const signal: SignalRaw<void> = createSignal();
    const calls = { value: 0 };
    const counter = calls;
    const options: SignalTrackedConnectOptions = { priority: undefined, once: true, scope: scope };
    connectSignalTracked(signal, (_unused0: void) => (counter.value += 1), options);
    disconnectSignalScope(scope);
    emitSignal(signal, undefined);
    expect(calls.value).toEqual(0);
    expect(!hasSignalSlots(signal)).toBe(true);
  });
  it('holds only the replacement after a member tears the scope down and reconnects', () => {
    const scope = createSignalScope();
    const signal: SignalRaw<void> = createSignal();
    const calls: { value: string[] } = { value: [] as never[] };
    const readded = { value: false };
    const memberSignal = Object.defineProperties(
      { ...signal },
      {
        data: {
          get: () => signal.data,
          set: (value) => {
            signal.data = value;
          },
          enumerable: true,
          configurable: true,
        },
      },
    );
    const memberScope = scope;
    const memberCalls = calls;
    const memberReadded = readded;
    const options: SignalTrackedConnectOptions = { priority: undefined, once: undefined, scope: scope };
    connectSignalTracked(
      signal,
      (_unused0: void) => {
        memberCalls.value.push('member');
        let readded = memberReadded;
        if (readded.value) {
          return;
        }
        readded.value = true;
        void readded;
        disconnectSignalScope(memberScope);
        const replacementCalls = memberCalls;
        const replacementOptions: SignalTrackedConnectOptions = {
          priority: undefined,
          once: undefined,
          scope: memberScope,
        };
        connectSignalTracked(
          memberSignal,
          (_unused0: void) => replacementCalls.value.push('replacement'),
          replacementOptions,
        );
      },
      options,
    );
    emitSignal(signal, undefined);
    expect(scope.connections!.length).toEqual(1);
    expect(isSignalConnectionConnected(scope.connections![0])).toBe(true);
    calls.value = [] as never[];
    emitSignal(signal, undefined);
    expect(calls.value).toEqual(['replacement']);
  });
  it('tears the scope down from inside a dispatch without skipping surviving slots', () => {
    const scope = createSignalScope();
    const signal: SignalRaw<void> = createSignal();
    const calls: { value: string[] } = { value: [] as never[] };
    const memberScope = scope;
    const firstCalls = calls;
    const options: SignalTrackedConnectOptions = { priority: undefined, once: undefined, scope: scope };
    connectSignalTracked(
      signal,
      (_unused0: void) => {
        firstCalls.value.push('first');
        disconnectSignalScope(memberScope);
      },
      options,
    );
    const scopedCalls = calls;
    const scopedOptions: SignalTrackedConnectOptions = { priority: undefined, once: undefined, scope: scope };
    connectSignalTracked(signal, (_unused0: void) => scopedCalls.value.push('scoped'), scopedOptions);
    const plainCalls = calls;
    connectSignal(signal, (_unused0: void) => plainCalls.value.push('plain'), undefined);
    emitSignal(signal, undefined);
    expect(calls.value).toEqual(['first', 'plain']);
    expect(scope.connections!.length === 0).toBe(true);
  });
  it('drops the same connection listed twice without throwing', () => {
    const scope = createSignalScope();
    const signal: SignalRaw<void> = createSignal();
    const calls = { value: 0 };
    const counter = calls;
    const options: SignalTrackedConnectOptions = { priority: undefined, once: undefined, scope: scope };
    const connection = connectSignalTracked(signal, (_unused0: void) => (counter.value += 1), options);
    scope.connections!.push(connection);
    disconnectSignalScope(scope);
    emitSignal(signal, undefined);
    expect(calls.value).toEqual(0);
    expect(!isSignalConnectionConnected(connection)).toBe(true);
  });
});

describe('initializeSignalScope', () => {
  it('is the construction initializer of create signal scope', () => {
    let scope = createSignalScope();
    const signal: SignalRaw<void> = createSignal();
    const options: SignalTrackedConnectOptions = { priority: undefined, once: undefined, scope: scope };
    connectSignalTracked(signal, (_unused0: void) => {}, options);
    expect(scope.connections!.length).toEqual(1);
    initializeSignalScope(scope);
    expect(scope.connections!.length === 0).toBe(true);
  });
});
