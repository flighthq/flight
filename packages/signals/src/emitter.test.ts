import { cancelSignal, emitSignal } from './emitter';
import { createSignal } from './signal';
import { connectSignal } from './slot';

describe('cancelSignal', () => {
  it('stops emit after the canceling slot', () => {
    const signal = createSignal<() => void>();
    const order: number[] = [];
    connectSignal(signal, () => {
      order.push(1);
      cancelSignal(signal);
    });
    connectSignal(signal, () => order.push(2));
    emitSignal(signal);
    expect(order).toEqual([1]);
  });

  it('does not prevent subsequent emits', () => {
    const signal = createSignal<() => void>();
    let count = 0;
    connectSignal(signal, () => {
      count++;
      cancelSignal(signal);
    });
    connectSignal(signal, () => {
      count++;
    });
    emitSignal(signal);
    emitSignal(signal);
    expect(count).toBe(2);
  });
});

describe('emitSignal', () => {
  it('calls all connected slots', () => {
    const signal = createSignal<() => void>();
    let count = 0;
    connectSignal(signal, () => count++);
    connectSignal(signal, () => count++);
    emitSignal(signal);
    expect(count).toBe(2);
  });

  it('passes typed arguments to each slot', () => {
    const signal = createSignal<(value: number) => void>();
    const received: number[] = [];
    connectSignal(signal, (v) => received.push(v));
    emitSignal(signal, 42);
    expect(received).toEqual([42]);
  });

  it('resets canceled=false before each emit', () => {
    const signal = createSignal<() => void>();
    let count = 0;
    connectSignal(signal, () => {
      count++;
      cancelSignal(signal);
    });
    connectSignal(signal, () => {
      count++;
    });
    emitSignal(signal);
    expect(count).toBe(1);
    emitSignal(signal);
    expect(count).toBe(2);
  });

  it('removes once slots after they fire', () => {
    const signal = createSignal<() => void>();
    let count = 0;
    connectSignal(signal, () => count++, { once: true });
    emitSignal(signal);
    emitSignal(signal);
    expect(count).toBe(1);
  });

  it('does nothing when no slots are connected', () => {
    const signal = createSignal<() => void>();
    expect(() => emitSignal(signal)).not.toThrow();
  });
});
