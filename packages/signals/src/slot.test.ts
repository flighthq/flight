import { emitSignal } from './emitter';
import { createSignal } from './signal';
import { clearSignal, connectSignal, disconnectSignal, hasSignalSlots, isSlotConnected } from './slot';

describe('clearSignal', () => {
  it('removes all slots', () => {
    const signal = createSignal<() => void>();
    let count = 0;
    connectSignal(signal, () => count++);
    connectSignal(signal, () => count++);
    clearSignal(signal);
    emitSignal(signal);
    expect(count).toBe(0);
  });
});

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

  it('delivers to every slot when a slot re-emits the same signal', () => {
    // Re-entrant emit on the same signal must not skip any slot. The inner
    // emit re-traverses the shared slot list, so each slot still runs; the
    // guard variable keeps the recursion to a single level.
    const signal = createSignal<() => void>();
    const calls: string[] = [];
    let reentered = false;
    connectSignal(signal, () => {
      calls.push('a');
      if (!reentered) {
        reentered = true;
        emitSignal(signal);
      }
    });
    connectSignal(signal, () => calls.push('b'));
    emitSignal(signal);
    expect(calls).toContain('a');
    expect(calls).toContain('b');
  });

  it('removes a once slot exactly once across a re-entrant emit', () => {
    // A once slot fired during a nested emit on the same signal must be
    // removed after its single invocation and never fire again, even though
    // the inner emit re-traverses the slot list.
    const signal = createSignal<() => void>();
    let onceCount = 0;
    connectSignal(signal, () => onceCount++, { once: true });
    let reentered = false;
    connectSignal(signal, () => {
      if (!reentered) {
        reentered = true;
        emitSignal(signal);
      }
    });
    emitSignal(signal);
    emitSignal(signal);
    expect(onceCount).toBe(1);
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

describe('hasSignalSlots', () => {
  it('returns false when no slot is connected', () => {
    const signal = createSignal<() => void>();
    expect(hasSignalSlots(signal)).toBe(false);
  });

  it('returns true when at least one slot is connected', () => {
    const signal = createSignal<() => void>();
    connectSignal(signal, () => {});
    expect(hasSignalSlots(signal)).toBe(true);
  });

  it('returns false after the last slot is disconnected', () => {
    const signal = createSignal<() => void>();
    const slot = () => {};
    connectSignal(signal, slot);
    disconnectSignal(signal, slot);
    expect(hasSignalSlots(signal)).toBe(false);
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
