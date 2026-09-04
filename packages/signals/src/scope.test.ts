import {
  connectSignalTracked,
  disconnectSignalConnection,
  pauseSignalConnection,
  resumeSignalConnection,
} from './connection';
import { emitSignal } from './emitter';
import { createSignalScope, disconnectSignalScope, initializeSignalScope } from './scope';
import { createSignal } from './signal';
import { connectSignal, hasSignalSlots, isSlotConnected } from './slot';

describe('createSignalScope', () => {
  it('starts empty and collects only the connections that name it', () => {
    const scope = createSignalScope();
    expect(scope.connections).toEqual([]);

    const signal = createSignal<() => void>();
    connectSignalTracked(signal, () => {}, { scope });
    connectSignalTracked(signal, () => {});
    expect(scope.connections).toHaveLength(1);
  });

  it('hands out an independent record per call', () => {
    const first = createSignalScope();
    const second = createSignalScope();
    const signal = createSignal<() => void>();
    connectSignalTracked(signal, () => {}, { scope: first });
    expect(second.connections).toEqual([]);
  });

  it('registers a connection without disturbing its handle semantics', () => {
    const scope = createSignalScope();
    const signal = createSignal<(value: number) => void>();
    const seen: number[] = [];
    const connection = connectSignalTracked(signal, (value) => seen.push(value), { priority: 5, scope });
    expect(connection.connected).toBe(true);
    expect(connection.paused).toBe(false);
    emitSignal(signal, 7);
    expect(seen).toEqual([7]);
    expect(scope.connections[0]).toBe(connection);
  });
});

describe('disconnectSignalScope', () => {
  it('tears down every member in one call and empties the scope', () => {
    const scope = createSignalScope();
    const signal = createSignal<() => void>();
    const calls: string[] = [];
    const first = connectSignalTracked(signal, () => calls.push('a'), { scope });
    const second = connectSignalTracked(signal, () => calls.push('b'), { scope });

    disconnectSignalScope(scope);

    emitSignal(signal);
    expect(calls).toEqual([]);
    expect(scope.connections).toEqual([]);
    expect(first.connected).toBe(false);
    expect(second.connected).toBe(false);
    expect(hasSignalSlots(signal)).toBe(false);
  });

  it('is idempotent across repeated teardowns', () => {
    const scope = createSignalScope();
    const signal = createSignal<() => void>();
    let calls = 0;
    connectSignalTracked(signal, () => calls++, { scope });

    disconnectSignalScope(scope);
    expect(() => disconnectSignalScope(scope)).not.toThrow();
    disconnectSignalScope(scope);

    emitSignal(signal);
    expect(calls).toBe(0);
    expect(scope.connections).toEqual([]);
  });

  it('accepts an empty scope', () => {
    const scope = createSignalScope();
    expect(() => disconnectSignalScope(scope)).not.toThrow();
    expect(scope.connections).toEqual([]);
  });

  it('leaves untracked and unscoped tracked connections on the signal', () => {
    const scope = createSignalScope();
    const signal = createSignal<() => void>();
    const calls: string[] = [];
    connectSignal(signal, () => calls.push('plain'));
    const unscoped = connectSignalTracked(signal, () => calls.push('unscoped'));
    connectSignalTracked(signal, () => calls.push('scoped'), { scope });

    disconnectSignalScope(scope);

    emitSignal(signal);
    expect(calls).toEqual(['plain', 'unscoped']);
    expect(unscoped.connected).toBe(true);
  });

  it('disconnects a paused member rather than skipping it', () => {
    const scope = createSignalScope();
    const signal = createSignal<() => void>();
    let calls = 0;
    const connection = connectSignalTracked(signal, () => calls++, { scope });
    pauseSignalConnection(connection);

    disconnectSignalScope(scope);

    expect(connection.connected).toBe(false);
    // Resume must not resurrect a torn-down connection: the handle is dead, not merely quiet.
    resumeSignalConnection(connection);
    emitSignal(signal);
    expect(calls).toBe(0);
    expect(connection.paused).toBe(true);
  });

  it('passes over a member already disconnected through its own handle', () => {
    const scope = createSignalScope();
    const signal = createSignal<() => void>();
    const calls: string[] = [];
    const first = connectSignalTracked(signal, () => calls.push('a'), { scope });
    const second = connectSignalTracked(signal, () => calls.push('b'), { scope });
    disconnectSignalConnection(first);

    expect(() => disconnectSignalScope(scope)).not.toThrow();

    emitSignal(signal);
    expect(calls).toEqual([]);
    expect(second.connected).toBe(false);
    expect(scope.connections).toEqual([]);
  });

  it('passes over a once member that already fired', () => {
    const scope = createSignalScope();
    const signal = createSignal<() => void>();
    let calls = 0;
    const connection = connectSignalTracked(signal, () => calls++, { once: true, scope });

    emitSignal(signal);
    expect(calls).toBe(1);
    expect(connection.connected).toBe(false);

    disconnectSignalScope(scope);
    emitSignal(signal);
    expect(calls).toBe(1);
    expect(scope.connections).toEqual([]);
  });

  it('tears down a once member that never fired', () => {
    const scope = createSignalScope();
    const signal = createSignal<() => void>();
    let calls = 0;
    connectSignalTracked(signal, () => calls++, { once: true, scope });

    disconnectSignalScope(scope);

    emitSignal(signal);
    expect(calls).toBe(0);
    expect(hasSignalSlots(signal)).toBe(false);
  });

  it('holds only the replacement after a member tears the scope down and reconnects', () => {
    // The scope is reusable, not consumed: tearing it down from inside a dispatch and registering a
    // replacement leaves exactly the replacement, with the torn-down member gone from both the scope
    // and the signal.
    const scope = createSignalScope();
    const signal = createSignal<() => void>();
    const calls: string[] = [];
    let readded = false;
    connectSignalTracked(
      signal,
      () => {
        calls.push('member');
        if (readded) return;
        readded = true;
        disconnectSignalScope(scope);
        connectSignalTracked(signal, () => calls.push('replacement'), { scope });
      },
      { scope },
    );

    emitSignal(signal);
    expect(scope.connections).toHaveLength(1);
    expect(scope.connections[0]?.connected).toBe(true);

    calls.length = 0;
    emitSignal(signal);
    expect(calls).toEqual(['replacement']);
  });

  it('tears the scope down from inside a dispatch without skipping the surviving slots', () => {
    const scope = createSignalScope();
    const signal = createSignal<() => void>();
    const calls: string[] = [];
    connectSignalTracked(
      signal,
      () => {
        calls.push('first');
        disconnectSignalScope(scope);
      },
      { scope },
    );
    connectSignalTracked(signal, () => calls.push('scoped'), { scope });
    connectSignal(signal, () => calls.push('plain'));

    emitSignal(signal);

    // The scoped member after the cursor is gone, and the unscoped slot that shifted with it is not
    // skipped: the tombstone discipline holds under a bulk teardown mid-dispatch.
    expect(calls).toEqual(['first', 'plain']);
    expect(scope.connections).toEqual([]);
  });

  it('drops the same connection listed twice without throwing', () => {
    const scope = createSignalScope();
    const signal = createSignal<() => void>();
    let calls = 0;
    const connection = connectSignalTracked(signal, () => calls++, { scope });
    scope.connections.push(connection);

    expect(() => disconnectSignalScope(scope)).not.toThrow();

    emitSignal(signal);
    expect(calls).toBe(0);
    expect(isSlotConnected(signal, connection.slot)).toBe(false);
  });
});
describe('initializeSignalScope', () => {
  it('is the construction initializer of createSignalScope', () => {
    expect(typeof initializeSignalScope).toBe('function');
  });
});
