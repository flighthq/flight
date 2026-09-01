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
  it('does nothing when no slots are connected', () => {
    const signal = createSignal<() => void>();
    expect(() => disconnectSignal(signal, () => {})).not.toThrow();
  });

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

describe('emitSignal dispatch mutation', () => {
  it('runs the slot that shifts into a disconnected earlier position', () => {
    // The dispatch cursor must not advance past an entry that moved down when an EARLIER slot was
    // removed mid-walk. Splicing shifted `c` into the cursor's own index and the post-slot increment
    // then stepped over it, so `c` never ran.
    const signal = createSignal<() => void>();
    const calls: string[] = [];
    const a = () => calls.push('a');
    connectSignal(signal, a);
    connectSignal(signal, () => {
      calls.push('b');
      disconnectSignal(signal, a);
    });
    connectSignal(signal, () => calls.push('c'));
    emitSignal(signal);
    expect(calls).toEqual(['a', 'b', 'c']);
  });

  it('keeps dispatching to later slots after a slot disconnects itself', () => {
    const signal = createSignal<() => void>();
    const calls: string[] = [];
    const a = () => {
      calls.push('a');
      disconnectSignal(signal, a);
    };
    connectSignal(signal, a);
    connectSignal(signal, () => calls.push('b'));
    emitSignal(signal);
    expect(calls).toEqual(['a', 'b']);
  });

  it('does not deliver to a slot disconnected earlier in the same dispatch', () => {
    const signal = createSignal<() => void>();
    const calls: string[] = [];
    const c = () => calls.push('c');
    connectSignal(signal, () => {
      calls.push('a');
      disconnectSignal(signal, c);
    });
    connectSignal(signal, () => calls.push('b'));
    connectSignal(signal, c);
    emitSignal(signal);
    expect(calls).toEqual(['a', 'b']);
  });

  it('gives a nested emit its own cursor, unskewed by a disconnect inside it', () => {
    // The inner emit removed a slot positioned before its own cursor. Under splicing that shifted the
    // inner walk and dropped `c` from the NESTED pass; the cursors must be independent.
    const signal = createSignal<() => void>();
    const nested: string[] = [];
    let depth = 0;
    let reentered = false;
    const a: () => void = () => {
      record('a');
      if (!reentered) {
        reentered = true;
        depth++;
        emitSignal(signal);
        depth--;
      }
    };
    const record = (name: string): void => {
      if (depth > 0) nested.push(name);
    };
    connectSignal(signal, a);
    connectSignal(signal, () => {
      record('b');
      disconnectSignal(signal, a);
    });
    connectSignal(signal, () => record('c'));
    emitSignal(signal);
    expect(nested).toEqual(['a', 'b', 'c']);
  });

  it('fires a once slot exactly once when a nested emit walks past it', () => {
    const signal = createSignal<() => void>();
    const calls: string[] = [];
    connectSignal(signal, () => calls.push('once'), { once: true });
    let reentered = false;
    connectSignal(signal, () => {
      calls.push('outer');
      if (!reentered) {
        reentered = true;
        emitSignal(signal);
      }
    });
    connectSignal(signal, () => calls.push('tail'));
    emitSignal(signal);
    expect(calls.filter((name) => name === 'once')).toEqual(['once']);
    expect(calls.filter((name) => name === 'tail')).toHaveLength(2);
  });

  it('purges disconnected entries once the outermost emit exits', () => {
    const signal = createSignal<() => void>();
    const calls: string[] = [];
    const b = () => calls.push('b');
    connectSignal(signal, () => {
      calls.push('a');
      disconnectSignal(signal, b);
    });
    connectSignal(signal, b);
    emitSignal(signal);
    expect(isSlotConnected(signal, b)).toBe(false);
    expect(hasSignalSlots(signal)).toBe(true);
    // Asserted on the arrays themselves because nothing observable distinguishes a compacted signal
    // from one carrying a dead cell: a tombstone that is never purged is a leak that still dispatches
    // correctly, so every behavioural assertion here would pass while the array grew without bound.
    expect(signal.data?.slots).toHaveLength(1);
    expect(signal.data?.priorities).toHaveLength(1);
    expect(signal.data?.repeat).toHaveLength(1);
    calls.length = 0;
    emitSignal(signal);
    expect(calls).toEqual(['a']);
  });

  it('returns the signal to its empty state when every slot disconnects during dispatch', () => {
    const signal = createSignal<() => void>();
    const a: () => void = () => disconnectSignal(signal, a);
    connectSignal(signal, a);
    emitSignal(signal);
    expect(hasSignalSlots(signal)).toBe(false);
    expect(isSlotConnected(signal, a)).toBe(false);
    expect(signal.data).toBeNull();
  });

  it('reports no slots from inside the dispatch that disconnected the last one', () => {
    // Splicing used to answer this by emptying the array outright. A tombstone leaves the entry in
    // place, so the query has to distinguish a dead entry from a live one rather than read length.
    const signal = createSignal<() => void>();
    const observed: boolean[] = [];
    const a: () => void = () => {
      disconnectSignal(signal, a);
      observed.push(hasSignalSlots(signal));
    };
    connectSignal(signal, a);
    emitSignal(signal);
    expect(observed).toEqual([false]);
  });

  it('reports a slot disconnected mid-dispatch as disconnected from inside the same dispatch', () => {
    const signal = createSignal<() => void>();
    const observed: boolean[] = [];
    const b = () => {};
    connectSignal(signal, () => {
      disconnectSignal(signal, b);
      observed.push(isSlotConnected(signal, b));
      observed.push(hasSignalSlots(signal));
    });
    connectSignal(signal, b);
    emitSignal(signal);
    expect(observed).toEqual([false, true]);
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
