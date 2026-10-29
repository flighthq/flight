// Generated from crates/flight-signals/tests/slot_test.rs by flight-compiler.
// Rust is authoritative; run `npm run generate` after changing it.

import { describe, expect, it } from 'vitest';

import {
  clearSignal,
  connectSignal,
  createSignal,
  disconnectSignal,
  emitSignal,
  hasSignalSlots,
  isSlotConnected,
} from './contract.ts';
import type { SignalConnectOptions, SignalRaw, SlotId } from './contract.ts';

interface PairEvent {
  x: number;
  y: number;
}

describe('clearSignal', () => {
  it('removes all slots', () => {
    const signal: SignalRaw<void> = createSignal();
    const count = { value: 0 };
    for (let _ = 0; _ < 2; _ += 1) {
      const slotCount = count;
      connectSignal(signal, (_unused0: void) => (slotCount.value += 1), undefined);
    }
    clearSignal(signal);
    emitSignal(signal, undefined);
    expect(count.value).toEqual(0);
  });
});

describe('connectSignal', () => {
  it('connects a slot that receives emits', () => {
    const signal: SignalRaw<void> = createSignal();
    const called = { value: false };
    const flag = called;
    connectSignal(signal, (_unused0: void) => (flag.value = true), undefined);
    emitSignal(signal, undefined);
    expect(called.value).toBe(true);
  });
  it('connects multiple slots emitted in insertion order', () => {
    const signal: SignalRaw<void> = createSignal();
    const order: { value: number[] } = { value: [] as never[] };
    for (const value of [1, 2, 3]) {
      const slotOrder = order;
      connectSignal(signal, (_unused0: void) => slotOrder.value.push(value), undefined);
    }
    emitSignal(signal, undefined);
    expect(order.value).toEqual([1, 2, 3]);
  });
  it('passes typed payload to slot', () => {
    const signal: SignalRaw<PairEvent> = createSignal();
    const received: { value: PairEvent | undefined } = { value: undefined };
    const out = received;
    connectSignal(signal, (event: Readonly<PairEvent>) => (out.value = event), undefined);
    emitSignal(signal, { x: 3, y: 7 });
    expect(received.value).toEqual({ x: 3, y: 7 });
  });
  it('removes slot after first emit when once is set', () => {
    const signal: SignalRaw<void> = createSignal();
    const count = { value: 0 };
    const counter = count;
    const options: SignalConnectOptions = { priority: undefined, once: true };
    connectSignal(signal, (_unused0: void) => (counter.value += 1), options);
    emitSignal(signal, undefined);
    emitSignal(signal, undefined);
    expect(count.value).toEqual(1);
  });
  it('keeps slot across emits when once is not set', () => {
    const signal: SignalRaw<void> = createSignal();
    const count = { value: 0 };
    const counter = count;
    connectSignal(signal, (_unused0: void) => (counter.value += 1), undefined);
    emitSignal(signal, undefined);
    emitSignal(signal, undefined);
    expect(count.value).toEqual(2);
  });
  it('emits higher priority slots first', () => {
    const signal: SignalRaw<void> = createSignal();
    const order: { value: number[] } = { value: [] as never[] };
    for (const [value, priority] of [
      [1, 0],
      [2, 10],
      [3, 5],
    ] as const) {
      const slotOrder = order;
      const options: SignalConnectOptions = { priority: priority, once: undefined };
      connectSignal(signal, (_unused0: void) => slotOrder.value.push(value), options);
    }
    emitSignal(signal, undefined);
    expect(order.value).toEqual([2, 3, 1]);
  });
  it('delivers to every slot when a slot re emits the same signal', () => {
    const signal: SignalRaw<void> = createSignal();
    const calls: { value: string[] } = { value: [] as never[] };
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
    const firstCalls = calls;
    const firstReentered = reentered;
    connectSignal(
      signal,
      (_unused0: void) => {
        firstCalls.value.push('a');
        let reentered = firstReentered;
        if (!reentered.value) {
          reentered.value = true;
          void reentered;
          emitSignal(nestedSignal, undefined);
        }
      },
      undefined,
    );
    const tailCalls = calls;
    connectSignal(signal, (_unused0: void) => tailCalls.value.push('b'), undefined);
    emitSignal(signal, undefined);
    const snapshot = calls.value;
    expect(snapshot.includes('a')).toBe(true);
    expect(snapshot.includes('b')).toBe(true);
  });
  it('removes a once slot exactly once across a reentrant emit', () => {
    const signal: SignalRaw<void> = createSignal();
    const onceCount = { value: 0 };
    const counter = onceCount;
    const options: SignalConnectOptions = { priority: undefined, once: true };
    connectSignal(signal, (_unused0: void) => (counter.value += 1), options);
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
    const flag = reentered;
    connectSignal(
      signal,
      (_unused0: void) => {
        let reentered = flag;
        if (!reentered.value) {
          reentered.value = true;
          void reentered;
          emitSignal(nestedSignal, undefined);
        }
      },
      undefined,
    );
    emitSignal(signal, undefined);
    emitSignal(signal, undefined);
    expect(onceCount.value).toEqual(1);
  });
});

describe('disconnectSignal', () => {
  it('does nothing when no slots are connected', () => {
    const signal: SignalRaw<void> = createSignal();
    disconnectSignal(signal, { value: 999 });
    expect(!hasSignalSlots(signal)).toBe(true);
  });
  it('removes a specific slot', () => {
    const signal: SignalRaw<void> = createSignal();
    const count = { value: 0 };
    const counter = count;
    const id = connectSignal(signal, (_unused0: void) => (counter.value += 1), undefined);
    disconnectSignal(signal, id);
    emitSignal(signal, undefined);
    expect(count.value).toEqual(0);
  });
  it('does not remove other slots', () => {
    const signal: SignalRaw<void> = createSignal();
    const a = { value: 0 };
    const b = { value: 0 };
    const aCounter = a;
    const bCounter = b;
    const slotA = connectSignal(signal, (_unused0: void) => (aCounter.value += 1), undefined);
    connectSignal(signal, (_unused0: void) => (bCounter.value += 1), undefined);
    disconnectSignal(signal, slotA);
    emitSignal(signal, undefined);
    expect(a.value).toEqual(0);
    expect(b.value).toEqual(1);
  });
});

describe('hasSignalSlots', () => {
  it('returns false when no slot is connected', () => {
    const signal: SignalRaw<void> = createSignal();
    expect(!hasSignalSlots(signal)).toBe(true);
  });
  it('returns true when at least one slot is connected', () => {
    const signal: SignalRaw<void> = createSignal();
    connectSignal(signal, (_unused0: void) => {}, undefined);
    expect(hasSignalSlots(signal)).toBe(true);
  });
  it('returns false after the last slot is disconnected', () => {
    const signal: SignalRaw<void> = createSignal();
    const id = connectSignal(signal, (_unused0: void) => {}, undefined);
    disconnectSignal(signal, id);
    expect(!hasSignalSlots(signal)).toBe(true);
  });
});

describe('isSlotConnected', () => {
  it('returns true when slot is connected', () => {
    const signal: SignalRaw<void> = createSignal();
    const id = connectSignal(signal, (_unused0: void) => {}, undefined);
    expect(isSlotConnected(signal, id)).toBe(true);
  });
  it('returns false when slot is not connected', () => {
    const signal: SignalRaw<void> = createSignal();
    expect(!isSlotConnected(signal, { value: 999 })).toBe(true);
  });
  it('returns false after slot is disconnected', () => {
    const signal: SignalRaw<void> = createSignal();
    const id = connectSignal(signal, (_unused0: void) => {}, undefined);
    disconnectSignal(signal, id);
    expect(!isSlotConnected(signal, id)).toBe(true);
  });
});
