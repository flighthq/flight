// Generated from crates/flight-signals/tests/emitter_test.rs by flight-compiler.
// Rust is authoritative; run `npm run generate` after changing it.

import * as flightEntity from '@flighthq/entity/contract';
import { describe, expect, it } from 'vitest';

import {
  cancelSignal,
  clearSignal,
  connectSignal,
  createSignal,
  disconnectSignal,
  emitSignal,
  emitSignalSafe,
  hasSignalSlots,
  isSlotConnected,
} from './contract.ts';
import type { SignalConnectOptions, SignalRaw, SignalSlot, SlotId } from './contract.ts';

interface ValueEvent {
  value: number;
}

describe('cancelSignal', () => {
  it('does nothing when no slots are connected', () => {
    const signal: SignalRaw<void> = createSignal();
    cancelSignal(signal);
    emitSignal(signal, undefined);
  });
  it('stops emit after the canceling slot', () => {
    const signal: SignalRaw<void> = createSignal();
    const order: { value: number[] } = { value: [] as never[] };
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
    const firstOrder = order;
    connectSignal(
      signal,
      (_unused0: void) => {
        firstOrder.value.push(1);
        cancelSignal(cancelSignalHandle);
      },
      undefined,
    );
    const secondOrder = order;
    connectSignal(signal, (_unused0: void) => secondOrder.value.push(2), undefined);
    emitSignal(signal, undefined);
    expect(order.value).toEqual([1]);
  });
  it('does not prevent subsequent emits', () => {
    const signal: SignalRaw<void> = createSignal();
    const count = { value: 0 };
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
    const firstCount = count;
    connectSignal(
      signal,
      (_unused0: void) => {
        firstCount.value += 1;
        cancelSignal(cancelSignalHandle);
      },
      undefined,
    );
    const secondCount = count;
    connectSignal(signal, (_unused0: void) => (secondCount.value += 1), undefined);
    emitSignal(signal, undefined);
    emitSignal(signal, undefined);
    expect(count.value).toEqual(2);
  });
});

describe('emitSignal', () => {
  // Rust-only: emitter cell is unlocked while a callback replaces it
  // Rust-only: clone owns an independent emitter cell
  it('clear replaces a custom callback with noop even without data', () => {
    const signal: SignalRaw<void> = createSignal();
    const calls = { value: 0 };
    const count = calls;
    signal.emit = (_unused0) => (count.value += 1);
    emitSignal(signal, undefined);
    clearSignal(signal);
    emitSignal(signal, undefined);
    expect(calls.value).toEqual(1);
    expect(signal.data! === undefined).toBe(true);
  });
  it('first connect replaces a custom callback with native data dispatch', () => {
    const signal: SignalRaw<void> = createSignal();
    const customCalls = { value: 0 };
    const customCount = customCalls;
    const custom: SignalSlot<void> = (_unused0) => (customCount.value += 1);
    signal.emit = custom;
    const calls = { value: 0 };
    const count = calls;
    connectSignal(signal, (_unused0) => (count.value += 1), undefined);
    expect(!(signal.emit! === custom)).toBe(true);
    emitSignal(signal, undefined);
    expect(customCalls.value).toEqual(0);
    expect(calls.value).toEqual(1);
  });
  it('native and safe once teardown replace emitters installed during dispatch', () => {
    for (const safe of [false, true]) {
      const signal: SignalRaw<void> = createSignal();
      const cell = signal.emit;
      const customCalls = { value: 0 };
      const count = customCalls;
      const options: SignalConnectOptions = { priority: undefined, once: true };
      connectSignal(
        signal,
        (_unused0) => {
          const callbackCount = count;
          signal.emit = (_unused0: void) => (callbackCount.value += 1);
        },
        options,
      );
      if (safe) {
        emitSignalSafe(signal, undefined);
      } else {
        emitSignal(signal, undefined);
      }
      emitSignal(signal, undefined);
      expect(customCalls.value).toEqual(0);
      expect(signal.data! === undefined).toBe(true);
    }
  });
  it('clear during dispatch does not let old teardown erase a later custom emitter', () => {
    const signal: SignalRaw<void> = createSignal();
    const callbackSignal = Object.defineProperties(
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
    const originalCell = signal.emit;
    const calls = { value: 0 };
    const count = calls;
    connectSignal(
      signal,
      (_unused0) => {
        clearSignal(callbackSignal);
        const callbackCount = count;
        signal.emit = (_unused0: void) => (callbackCount.value += 1);
      },
      { priority: undefined, once: true },
    );
    emitSignal(signal, undefined);
    emitSignal(signal, undefined);
    expect(calls.value).toEqual(1);
  });
  it('invokes a required custom emitter instead of bypassing it for slots', () => {
    const signal: SignalRaw<number> = createSignal();
    const calls: { value: Array<readonly [string, number]> } = { value: [] as never[] };
    const slots = calls;
    connectSignal(signal, (value) => slots.value.push(['slot', value]), undefined);
    const custom = calls;
    signal.emit = (value) => custom.value.push(['custom', value]);
    emitSignal(signal, 7);
    expect(Array.from(calls.value)).toEqual([['custom', 7]]);
    emitSignalSafe(signal, 8);
    expect(Array.from(calls.value)).toEqual([
      ['custom', 7],
      ['slot', 8],
    ]);
  });
  it('spread wrapper shares slots but only its own emission marks the wrapper', () => {
    const original: SignalRaw<number> = createSignal();
    const seen: { value: number[] } = { value: [] as never[] };
    const output = seen;
    connectSignal(original, (value) => output.value.push(value), undefined);
    const marked = { value: 0 };
    const count = marked;
    const originalEmit = original.emit!;
    const wrapper = Object.defineProperties(
      { ...original },
      {
        data: {
          get: () => original.data,
          set: (value) => {
            original.data = value;
          },
          enumerable: true,
          configurable: true,
        },
      },
    );
    wrapper.emit = (value) => {
      count.value += 1;
      originalEmit(value);
    };
    expect(wrapper.data === original.data).toBe(true);
    expect(!(wrapper.emit === original.emit)).toBe(true);
    expect(!(wrapper.emit! === original.emit!)).toBe(true);
    emitSignal(original, 1);
    expect(marked.value).toEqual(0);
    emitSignal(wrapper, 2);
    expect(marked.value).toEqual(1);
    expect(Array.from(seen.value)).toEqual([1, 2]);
  });
  it('spread wrapper calls an original custom emitter even without signal data', () => {
    const original: SignalRaw<number> = createSignal();
    const seen: { value: number[] } = { value: [] as never[] };
    const output = seen;
    original.emit = (value) => output.value.push(value);
    const wrappedCalls = { value: 0 };
    const count = wrappedCalls;
    const originalEmit = original.emit!;
    const wrapper = Object.defineProperties(
      { ...original },
      {
        data: {
          get: () => original.data,
          set: (value) => {
            original.data = value;
          },
          enumerable: true,
          configurable: true,
        },
      },
    );
    wrapper.emit = (value) => {
      count.value += 1;
      originalEmit(value);
    };
    emitSignal(original, 1);
    emitSignal(wrapper, 2);
    expect(Array.from(seen.value)).toEqual([1, 2]);
    expect(wrappedCalls.value).toEqual(1);
    expect(original.data! === undefined).toBe(true);
  });
  it('clone copies emitter value and data but has a fresh entity runtime', () => {
    let original: SignalRaw<void> = createSignal();
    flightEntity.setEntityUid(original, 'original');
    let clone = Object.defineProperties(
      { ...original },
      {
        data: {
          get: () => original.data,
          set: (value) => {
            original.data = value;
          },
          enumerable: true,
          configurable: true,
        },
      },
    );
    expect(clone.data === original.data).toBe(true);
    expect(clone.emit! === original.emit!).toBe(true);
    expect(!flightEntity.hasEntityRuntime(clone)).toBe(true);
    expect(flightEntity.getEntityUid(clone)).not.toEqual('original');
  });
  it('calls all connected slots', () => {
    const signal: SignalRaw<void> = createSignal();
    const count = { value: 0 };
    for (let _ = 0; _ < 2; _ += 1) {
      const slotCount = count;
      connectSignal(signal, (_unused0: void) => (slotCount.value += 1), undefined);
    }
    emitSignal(signal, undefined);
    expect(count.value).toEqual(2);
  });
  it('passes typed payload to each slot', () => {
    const signal: SignalRaw<ValueEvent> = createSignal();
    const received: { value: number[] } = { value: [] as never[] };
    const out = received;
    connectSignal(signal, (event: Readonly<ValueEvent>) => out.value.push(event.value), undefined);
    emitSignal(signal, { value: 42 });
    expect(received.value).toEqual([42]);
  });
  it('resets cancelled before each emit', () => {
    const signal: SignalRaw<void> = createSignal();
    const count = { value: 0 };
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
    const firstCount = count;
    connectSignal(
      signal,
      (_unused0: void) => {
        firstCount.value += 1;
        cancelSignal(cancelSignalHandle);
      },
      undefined,
    );
    const secondCount = count;
    connectSignal(signal, (_unused0: void) => (secondCount.value += 1), undefined);
    emitSignal(signal, undefined);
    expect(count.value).toEqual(1);
    emitSignal(signal, undefined);
    expect(count.value).toEqual(2);
  });
  it('removes once slots after they fire', () => {
    const signal: SignalRaw<void> = createSignal();
    const count = { value: 0 };
    const counter = count;
    const options: SignalConnectOptions = { priority: undefined, once: true };
    connectSignal(signal, (_unused0: void) => (counter.value += 1), options);
    emitSignal(signal, undefined);
    emitSignal(signal, undefined);
    expect(count.value).toEqual(1);
  });
  it('does nothing when no slots are connected', () => {
    const signal: SignalRaw<void> = createSignal();
    emitSignal(signal, undefined);
  });
  it('runs the slot that shifts into a disconnected earlier position', () => {
    const signal: SignalRaw<void> = createSignal();
    const calls: { value: string[] } = { value: [] as never[] };
    const aCalls = calls;
    const aId = connectSignal(signal, (_unused0: void) => aCalls.value.push('a'), undefined);
    const bCalls = calls;
    const bSignal = Object.defineProperties(
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
        bCalls.value.push('b');
        disconnectSignal(bSignal, aId);
      },
      undefined,
    );
    const cCalls = calls;
    connectSignal(signal, (_unused0: void) => cCalls.value.push('c'), undefined);
    emitSignal(signal, undefined);
    expect(calls.value).toEqual(['a', 'b', 'c']);
  });
  it('keeps dispatching to later slots after a slot disconnects itself', () => {
    const signal: SignalRaw<void> = createSignal();
    const calls: { value: string[] } = { value: [] as never[] };
    const aCalls = calls;
    const aSignal = Object.defineProperties(
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
    const idHolder: { value: SlotId | undefined } = { value: undefined };
    const holder = idHolder;
    const id = connectSignal(
      signal,
      (_unused0: void) => {
        aCalls.value.push('a');
        const currentId = holder.value;
        if (currentId !== undefined) {
          disconnectSignal(aSignal, currentId);
        }
      },
      undefined,
    );
    idHolder.value = id;
    const bCalls = calls;
    connectSignal(signal, (_unused0: void) => bCalls.value.push('b'), undefined);
    emitSignal(signal, undefined);
    expect(calls.value).toEqual(['a', 'b']);
  });
  it('does not deliver to a slot disconnected earlier in the same dispatch', () => {
    const signal: SignalRaw<void> = createSignal();
    const calls: { value: string[] } = { value: [] as never[] };
    const idHolder: { value: SlotId | undefined } = { value: undefined };
    const holder = idHolder;
    const aCalls = calls;
    const aSignal = Object.defineProperties(
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
        aCalls.value.push('a');
        const currentId = holder.value;
        if (currentId !== undefined) {
          disconnectSignal(aSignal, currentId);
        }
      },
      undefined,
    );
    const bCalls = calls;
    connectSignal(signal, (_unused0: void) => bCalls.value.push('b'), undefined);
    const cCalls = calls;
    const cId = connectSignal(signal, (_unused0: void) => cCalls.value.push('c'), undefined);
    idHolder.value = cId;
    emitSignal(signal, undefined);
    expect(calls.value).toEqual(['a', 'b']);
  });
  it('gives a nested emit its own cursor unskewed by a disconnect inside it', () => {
    const signal: SignalRaw<void> = createSignal();
    const nested: { value: string[] } = { value: [] as never[] };
    const depth = { value: 0 };
    const reentered = { value: false };
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
    const aNested = nested;
    const aDepth = depth;
    const aReentered = reentered;
    const aId = connectSignal(
      signal,
      (_unused0: void) => {
        if (aDepth.value > 0) {
          aNested.value.push('a');
        }
        let reentered = aReentered;
        if (!reentered.value) {
          reentered.value = true;
          void reentered;
          aDepth.value += 1;
          emitSignal(nestedSignal, undefined);
          aDepth.value -= 1;
        }
      },
      undefined,
    );
    const bNested = nested;
    const bDepth = depth;
    const bSignal = Object.defineProperties(
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
        if (bDepth.value > 0) {
          bNested.value.push('b');
        }
        disconnectSignal(bSignal, aId);
      },
      undefined,
    );
    const cNested = nested;
    const cDepth = depth;
    connectSignal(
      signal,
      (_unused0: void) => {
        if (cDepth.value > 0) {
          cNested.value.push('c');
        }
      },
      undefined,
    );
    emitSignal(signal, undefined);
    expect(nested.value).toEqual(['a', 'b', 'c']);
  });
  it('fires a once slot exactly once when a nested emit walks past it', () => {
    const signal: SignalRaw<void> = createSignal();
    const calls: { value: string[] } = { value: [] as never[] };
    const onceCalls = calls;
    const options: SignalConnectOptions = { priority: undefined, once: true };
    connectSignal(signal, (_unused0: void) => onceCalls.value.push('once'), options);
    const reentered = { value: false };
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
    const outerCalls = calls;
    const outerReentered = reentered;
    connectSignal(
      signal,
      (_unused0: void) => {
        outerCalls.value.push('outer');
        let reentered = outerReentered;
        if (!reentered.value) {
          reentered.value = true;
          void reentered;
          emitSignal(nestedSignal, undefined);
        }
      },
      undefined,
    );
    const tailCalls = calls;
    connectSignal(signal, (_unused0: void) => tailCalls.value.push('tail'), undefined);
    emitSignal(signal, undefined);
    const snapshot = calls.value;
    const once: string[] = snapshot.filter((name) => name === 'once');
    expect(once.length).toEqual(1);
    const tail: string[] = snapshot.filter((name) => name === 'tail');
    expect(tail.length).toEqual(2);
  });
  it('purges disconnected entries once the outermost emit exits', () => {
    const signal: SignalRaw<void> = createSignal();
    const calls: { value: string[] } = { value: [] as never[] };
    const aCalls = calls;
    const bCalls = calls;
    const bSignal = Object.defineProperties(
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
    const bId = connectSignal(signal, (_unused0: void) => bCalls.value.push('b'), undefined);
    connectSignal(
      signal,
      (_unused0: void) => {
        aCalls.value.push('a');
        disconnectSignal(bSignal, bId);
      },
      undefined,
    );
    emitSignal(signal, undefined);
    expect(!isSlotConnected(signal, bId)).toBe(true);
    expect(hasSignalSlots(signal)).toBe(true);
    const state = signal.data!;
    const data = state!;
    expect(data.slots.length).toEqual(1);
    expect(data.priorities.length).toEqual(1);
    expect(data.repeat.length).toEqual(1);
    void state;
    calls.value = [] as never[];
    emitSignal(signal, undefined);
    expect(calls.value).toEqual(['a']);
  });
  it('returns the signal to its empty state when every slot disconnects during dispatch', () => {
    const signal: SignalRaw<void> = createSignal();
    const aSignal = Object.defineProperties(
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
    const idHolder: { value: SlotId | undefined } = { value: undefined };
    const holder = idHolder;
    const id = connectSignal(
      signal,
      (_unused0: void) => {
        const currentId = holder.value;
        if (currentId !== undefined) {
          disconnectSignal(aSignal, currentId);
        }
      },
      undefined,
    );
    idHolder.value = id;
    emitSignal(signal, undefined);
    expect(!hasSignalSlots(signal)).toBe(true);
    expect(!isSlotConnected(signal, id)).toBe(true);
    expect(signal.data! === undefined).toBe(true);
  });
  it('reports no slots from inside the dispatch that disconnected the last one', () => {
    const signal: SignalRaw<void> = createSignal();
    const observed: { value: boolean[] } = { value: [] as never[] };
    const idHolder: { value: SlotId | undefined } = { value: undefined };
    const holder = idHolder;
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
    const seen = observed;
    const id = connectSignal(
      signal,
      (_unused0: void) => {
        const currentId = holder.value;
        if (currentId !== undefined) {
          disconnectSignal(slotSignal, currentId);
        }
        seen.value.push(hasSignalSlots(slotSignal));
      },
      undefined,
    );
    idHolder.value = id;
    emitSignal(signal, undefined);
    expect(observed.value).toEqual([false]);
  });
  it('reports a slot disconnected mid dispatch as disconnected from inside the same dispatch', () => {
    const signal: SignalRaw<void> = createSignal();
    const observed: { value: boolean[] } = { value: [] as never[] };
    const bId = connectSignal(signal, (_unused0: void) => {}, undefined);
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
    const seen = observed;
    connectSignal(
      signal,
      (_unused0: void) => {
        disconnectSignal(slotSignal, bId);
        seen.value.push(isSlotConnected(slotSignal, bId));
        seen.value.push(hasSignalSlots(slotSignal));
      },
      undefined,
    );
    emitSignal(signal, undefined);
    expect(observed.value).toEqual([false, true]);
  });
});
