import { emitSignal } from './emitter';
import { createSignal } from './signal';
import { connectSignal, disconnectAllSignals, disconnectSignal, isSlotConnected } from './slot';

describe('connectSignal', () => {
  it('connects a slot that receives emits', () => {
    const signal = createSignal<() => void>();
    let called = false;
    connectSignal(signal, () => {
      called = true;
    });
    emitSignal(signal);
    expect(called).toBe(true);
  });

  it('connects multiple slots emitted in insertion order', () => {
    const signal = createSignal<() => void>();
    const order: number[] = [];
    connectSignal(signal, () => order.push(1));
    connectSignal(signal, () => order.push(2));
    connectSignal(signal, () => order.push(3));
    emitSignal(signal);
    expect(order).toEqual([1, 2, 3]);
  });

  it('passes typed arguments to slot', () => {
    const signal = createSignal<(x: number, y: number) => void>();
    let received: [number, number] | null = null;
    connectSignal(signal, (x, y) => {
      received = [x, y];
    });
    emitSignal(signal, 3, 7);
    expect(received).toEqual([3, 7]);
  });

  it('removes slot after first emit when once=true', () => {
    const signal = createSignal<() => void>();
    let count = 0;
    connectSignal(signal, () => count++, { once: true });
    emitSignal(signal);
    emitSignal(signal);
    expect(count).toBe(1);
  });

  it('keeps slot across emits when once is not set', () => {
    const signal = createSignal<() => void>();
    let count = 0;
    connectSignal(signal, () => count++);
    emitSignal(signal);
    emitSignal(signal);
    expect(count).toBe(2);
  });

  it('emits higher priority slots first', () => {
    const signal = createSignal<() => void>();
    const order: number[] = [];
    connectSignal(signal, () => order.push(1), { priority: 0 });
    connectSignal(signal, () => order.push(2), { priority: 10 });
    connectSignal(signal, () => order.push(3), { priority: 5 });
    emitSignal(signal);
    expect(order).toEqual([2, 3, 1]);
  });
});

describe('disconnectSignal', () => {
  it('removes a specific slot', () => {
    const signal = createSignal<() => void>();
    let count = 0;
    const slot = () => count++;
    connectSignal(signal, slot);
    disconnectSignal(signal, slot);
    emitSignal(signal);
    expect(count).toBe(0);
  });

  it('does not remove other slots', () => {
    const signal = createSignal<() => void>();
    let a = 0,
      b = 0;
    const slotA = () => a++;
    connectSignal(signal, slotA);
    connectSignal(signal, () => b++);
    disconnectSignal(signal, slotA);
    emitSignal(signal);
    expect(a).toBe(0);
    expect(b).toBe(1);
  });
});

describe('disconnectAllSignals', () => {
  it('removes all slots', () => {
    const signal = createSignal<() => void>();
    let count = 0;
    connectSignal(signal, () => count++);
    connectSignal(signal, () => count++);
    disconnectAllSignals(signal);
    emitSignal(signal);
    expect(count).toBe(0);
  });
});

describe('isSlotConnected', () => {
  it('returns true when slot is connected', () => {
    const signal = createSignal<() => void>();
    const slot = () => {};
    connectSignal(signal, slot);
    expect(isSlotConnected(signal, slot)).toBe(true);
  });

  it('returns false when slot is not connected', () => {
    const signal = createSignal<() => void>();
    expect(isSlotConnected(signal, () => {})).toBe(false);
  });

  it('returns false after slot is disconnected', () => {
    const signal = createSignal<() => void>();
    const slot = () => {};
    connectSignal(signal, slot);
    disconnectSignal(signal, slot);
    expect(isSlotConnected(signal, slot)).toBe(false);
  });
});
