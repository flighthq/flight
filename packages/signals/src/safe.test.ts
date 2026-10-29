// Generated from crates/flight-signals/tests/safe_test.rs by flight-compiler.
// Rust is authoritative; run `npm run generate` after changing it.

import { describe, expect, it } from 'vitest';

import { cancelSignal, connectSignal, createSignal, disconnectSignal, emitSignalSafe } from './contract.ts';
import type { SignalConnectOptions, SignalRaw, SlotId } from './contract.ts';

interface ValueEvent {
  value: number;
}

interface TextEvent {
  value: string;
}

describe('emitSignalSafe', () => {
  it('passes typed payload in priority order', () => {
    const signal: SignalRaw<ValueEvent> = createSignal();
    const received: { value: string[] } = { value: [] as never[] };
    for (const [label, priority] of [
      ['low', -1],
      ['high', 10],
      ['normal', 0],
    ] as const) {
      const receivedForSlot = received;
      const options: SignalConnectOptions = { priority: priority, once: undefined };
      connectSignal(
        signal,
        (event: Readonly<ValueEvent>) => {
          receivedForSlot.value.push(`${label}:${event.value}`);
        },
        options,
      );
    }
    emitSignalSafe(signal, { value: 42 });
    expect(received.value).toEqual(['high:42', 'normal:42', 'low:42']);
  });
  it('does not call a slot added during the current dispatch', () => {
    const signal: SignalRaw<void> = createSignal();
    const calls: { value: string[] } = { value: [] as never[] };
    const added = { value: false };
    const slotSignal = Object.defineProperties(
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
    const aCalls = calls;
    const aAdded = added;
    connectSignal(
      signal,
      (_unused0: void) => {
        aCalls.value.push('a');
        let added = aAdded;
        if (!added.value) {
          added.value = true;
          void added;
          const addedCalls = aCalls;
          connectSignal(slotSignal, (_unused0: void) => addedCalls.value.push('added'), undefined);
        }
      },
      undefined,
    );
    const bCalls = calls;
    connectSignal(signal, (_unused0: void) => bCalls.value.push('b'), undefined);
    emitSignalSafe(signal, undefined);
    expect(calls.value).toEqual(['a', 'b']);
    calls.value = [] as never[];
    emitSignalSafe(signal, undefined);
    expect(calls.value).toEqual(['a', 'b', 'added']);
  });
  it('still calls a copied slot removed during the current dispatch', () => {
    const signal: SignalRaw<void> = createSignal();
    const calls: { value: string[] } = { value: [] as never[] };
    const idHolder: { value: SlotId | undefined } = { value: undefined };
    const holder = idHolder;
    const firstCalls = calls;
    const firstSignal = Object.defineProperties(
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
    connectSignal(
      signal,
      (_unused0: void) => {
        firstCalls.value.push('first');
        const currentId = holder.value;
        if (currentId !== undefined) {
          disconnectSignal(firstSignal, currentId);
        }
      },
      undefined,
    );
    const removedCalls = calls;
    const removedId = connectSignal(signal, (_unused0: void) => removedCalls.value.push('removed'), undefined);
    idHolder.value = removedId;
    emitSignalSafe(signal, undefined);
    expect(calls.value).toEqual(['first', 'removed']);
    calls.value = [] as never[];
    emitSignalSafe(signal, undefined);
    expect(calls.value).toEqual(['first']);
  });
  it('gives a nested safe emission its own snapshot and arguments', () => {
    const signal: SignalRaw<TextEvent> = createSignal();
    const calls: { value: string[] } = { value: [] as never[] };
    const nested = { value: false };
    const nestedSignal = Object.defineProperties(
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
    const aCalls = calls;
    const aNested = nested;
    connectSignal(
      signal,
      (event: Readonly<TextEvent>) => {
        aCalls.value.push(`a:${event.value}`);
        let nested = aNested;
        if (!nested.value) {
          nested.value = true;
          void nested;
          emitSignalSafe(nestedSignal, { value: 'nested' });
        }
      },
      undefined,
    );
    const bCalls = calls;
    connectSignal(
      signal,
      (event: Readonly<TextEvent>) => {
        bCalls.value.push(`b:${event.value}`);
      },
      undefined,
    );
    emitSignalSafe(signal, { value: 'outer' });
    expect(calls.value).toEqual(['a:outer', 'a:nested', 'b:nested', 'b:outer']);
  });
  it('removes a once slot before invoking it so a nested emission cannot repeat it', () => {
    const signal: SignalRaw<void> = createSignal();
    const calls: { value: string[] } = { value: [] as never[] };
    const onceCalls = calls;
    const nested = { value: false };
    const nestedSignal = Object.defineProperties(
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
    const options: SignalConnectOptions = { priority: undefined, once: true };
    connectSignal(
      signal,
      (_unused0: void) => {
        onceCalls.value.push('once');
        let nestedFlag = nested;
        if (!nestedFlag.value) {
          nestedFlag.value = true;
          void nestedFlag;
          emitSignalSafe(nestedSignal, undefined);
        }
      },
      options,
    );
    const tailCalls = calls;
    connectSignal(signal, (_unused0: void) => tailCalls.value.push('tail'), undefined);
    emitSignalSafe(signal, undefined);
    emitSignalSafe(signal, undefined);
    expect(calls.value).toEqual(['once', 'tail', 'tail', 'tail']);
  });
  it('stops after cancellation and resets cancellation before the next emission', () => {
    const signal: SignalRaw<void> = createSignal();
    const calls: { value: string[] } = { value: [] as never[] };
    const cancel = { value: true };
    const firstCalls = calls;
    const firstCancel = cancel;
    const cancelSignalHandle = Object.defineProperties(
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
    connectSignal(
      signal,
      (_unused0: void) => {
        firstCalls.value.push('first');
        const cancel = firstCancel.value;
        if (cancel) {
          cancelSignal(cancelSignalHandle);
        }
      },
      undefined,
    );
    const secondCalls = calls;
    connectSignal(signal, (_unused0: void) => secondCalls.value.push('second'), undefined);
    emitSignalSafe(signal, undefined);
    expect(calls.value).toEqual(['first']);
    cancel.value = false;
    emitSignalSafe(signal, undefined);
    expect(calls.value).toEqual(['first', 'first', 'second']);
  });
  it('does nothing when no slots are connected', () => {
    const signal: SignalRaw<void> = createSignal();
    emitSignalSafe(signal, undefined);
  });
});
