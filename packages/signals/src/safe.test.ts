import { cancelSignal } from './emitter';
import { emitSignalSafe } from './safe';
import { createSignal } from './signal';
import { connectSignal, disconnectSignal } from './slot';

describe('emitSignalSafe', () => {
  it('passes typed arguments in priority order', () => {
    const signal = createSignal<(value: number) => void>();
    const received: string[] = [];
    connectSignal(signal, (value) => received.push(`low:${value}`), { priority: -1 });
    connectSignal(signal, (value) => received.push(`high:${value}`), { priority: 10 });
    connectSignal(signal, (value) => received.push(`normal:${value}`));

    emitSignalSafe(signal, 42);

    expect(received).toEqual(['high:42', 'normal:42', 'low:42']);
  });

  it('does not call a slot added during the current safe dispatch', () => {
    const signal = createSignal<() => void>();
    const calls: string[] = [];
    let added = false;
    connectSignal(signal, () => {
      calls.push('a');
      if (!added) {
        added = true;
        connectSignal(signal, () => calls.push('added'));
      }
    });
    connectSignal(signal, () => calls.push('b'));

    emitSignalSafe(signal);
    expect(calls).toEqual(['a', 'b']);

    calls.length = 0;
    emitSignalSafe(signal);
    expect(calls).toEqual(['a', 'b', 'added']);
  });

  it('still calls a copied slot removed during the current safe dispatch', () => {
    const signal = createSignal<() => void>();
    const calls: string[] = [];
    const removed = () => calls.push('removed');
    connectSignal(signal, () => {
      calls.push('first');
      disconnectSignal(signal, removed);
    });
    connectSignal(signal, removed);

    emitSignalSafe(signal);
    expect(calls).toEqual(['first', 'removed']);

    calls.length = 0;
    emitSignalSafe(signal);
    expect(calls).toEqual(['first']);
  });

  it('gives a nested safe emission its own snapshot and arguments', () => {
    const signal = createSignal<(value: string) => void>();
    const calls: string[] = [];
    let nested = false;
    connectSignal(signal, (value) => {
      calls.push(`a:${value}`);
      if (!nested) {
        nested = true;
        emitSignalSafe(signal, 'nested');
      }
    });
    connectSignal(signal, (value) => calls.push(`b:${value}`));

    emitSignalSafe(signal, 'outer');

    expect(calls).toEqual(['a:outer', 'a:nested', 'b:nested', 'b:outer']);
  });

  it('removes a once slot before invoking it so nested safe emission cannot repeat it', () => {
    const signal = createSignal<() => void>();
    const calls: string[] = [];
    let nested = false;
    connectSignal(
      signal,
      () => {
        calls.push('once');
        if (!nested) {
          nested = true;
          emitSignalSafe(signal);
        }
      },
      { once: true },
    );
    connectSignal(signal, () => calls.push('tail'));

    emitSignalSafe(signal);
    emitSignalSafe(signal);

    expect(calls).toEqual(['once', 'tail', 'tail', 'tail']);
  });

  it('stops after cancellation and resets cancellation before the next safe emission', () => {
    const signal = createSignal<() => void>();
    const calls: string[] = [];
    let cancel = true;
    connectSignal(signal, () => {
      calls.push('first');
      if (cancel) cancelSignal(signal);
    });
    connectSignal(signal, () => calls.push('second'));

    emitSignalSafe(signal);
    expect(calls).toEqual(['first']);

    cancel = false;
    emitSignalSafe(signal);
    expect(calls).toEqual(['first', 'first', 'second']);
  });

  it('does nothing when no slots are connected', () => {
    const signal = createSignal<() => void>();
    expect(() => emitSignalSafe(signal)).not.toThrow();
  });
});
