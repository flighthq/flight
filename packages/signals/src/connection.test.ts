import {
  connectSignalTracked,
  disconnectSignalConnection,
  pauseSignalConnection,
  resumeSignalConnection,
} from './connection';
import { emitSignal } from './emitter';
import { emitSignalSafe } from './safe';
import { createSignal } from './signal';
import { connectSignal, isSlotConnected } from './slot';

describe('connectSignalTracked', () => {
  it('returns a connected handle whose slot receives typed arguments', () => {
    const signal = createSignal<(value: number) => void>();
    const received: number[] = [];
    const connection = connectSignalTracked(signal, (value) => received.push(value));

    expect(connection.signal).toBe(signal);
    expect(connection.connected).toBe(true);
    expect(connection.paused).toBe(false);
    expect(isSlotConnected(signal, connection.slot)).toBe(true);

    emitSignal(signal, 42);
    expect(received).toEqual([42]);
  });

  it('preserves priority ordering among tracked and ordinary slots', () => {
    const signal = createSignal<() => void>();
    const calls: string[] = [];
    connectSignal(signal, () => calls.push('low'), { priority: -1 });
    connectSignalTracked(signal, () => calls.push('high'), { priority: 10 });
    connectSignalTracked(signal, () => calls.push('normal'));

    emitSignal(signal);
    expect(calls).toEqual(['high', 'normal', 'low']);
  });

  it('disconnects a once connection after one ordinary emission', () => {
    const signal = createSignal<() => void>();
    let count = 0;
    const connection = connectSignalTracked(signal, () => count++, { once: true });

    emitSignal(signal);
    emitSignal(signal);

    expect(count).toBe(1);
    expect(connection.connected).toBe(false);
    expect(isSlotConnected(signal, connection.slot)).toBe(false);
  });

  it('disconnects a once connection after one safe emission', () => {
    const signal = createSignal<() => void>();
    let count = 0;
    const connection = connectSignalTracked(signal, () => count++, { once: true });

    emitSignalSafe(signal);
    emitSignalSafe(signal);

    expect(count).toBe(1);
    expect(connection.connected).toBe(false);
    expect(isSlotConnected(signal, connection.slot)).toBe(false);
  });

  it('skips a connection disconnected before its turn in ordinary dispatch', () => {
    const signal = createSignal<() => void>();
    const calls: string[] = [];
    const later = connectSignalTracked(signal, () => calls.push('later'));
    connectSignalTracked(
      signal,
      () => {
        calls.push('first');
        disconnectSignalConnection(later);
      },
      { priority: 10 },
    );

    emitSignal(signal);

    expect(calls).toEqual(['first']);
    expect(later.connected).toBe(false);
  });

  it('still invokes a snapshotted connection disconnected during safe dispatch', () => {
    const signal = createSignal<() => void>();
    const calls: string[] = [];
    const later = connectSignalTracked(signal, () => calls.push('later'));
    connectSignalTracked(
      signal,
      () => {
        calls.push('first');
        disconnectSignalConnection(later);
      },
      { priority: 10 },
    );

    emitSignalSafe(signal);

    expect(calls).toEqual(['first', 'later']);
    expect(later.connected).toBe(false);
  });
});

describe('disconnectSignalConnection', () => {
  it('disconnects idempotently and records the inactive state', () => {
    const signal = createSignal<() => void>();
    let count = 0;
    const connection = connectSignalTracked(signal, () => count++);

    disconnectSignalConnection(connection);
    disconnectSignalConnection(connection);
    emitSignal(signal);

    expect(count).toBe(0);
    expect(connection.connected).toBe(false);
    expect(isSlotConnected(signal, connection.slot)).toBe(false);
  });
});

describe('pauseSignalConnection', () => {
  it('skips a paused connection during ordinary emission without removing it', () => {
    const signal = createSignal<() => void>();
    let count = 0;
    const connection = connectSignalTracked(signal, () => count++);

    pauseSignalConnection(connection);
    emitSignal(signal);

    expect(count).toBe(0);
    expect(connection.connected).toBe(true);
    expect(connection.paused).toBe(true);
    expect(isSlotConnected(signal, connection.slot)).toBe(true);
  });

  it('skips a paused connection during safe emission without removing it', () => {
    const signal = createSignal<() => void>();
    let count = 0;
    const connection = connectSignalTracked(signal, () => count++);

    pauseSignalConnection(connection);
    emitSignalSafe(signal);

    expect(count).toBe(0);
    expect(connection.connected).toBe(true);
    expect(connection.paused).toBe(true);
    expect(isSlotConnected(signal, connection.slot)).toBe(true);
  });

  it('does not consume a paused once connection in either emission mode', () => {
    const signal = createSignal<() => void>();
    let count = 0;
    const connection = connectSignalTracked(signal, () => count++, { once: true });

    pauseSignalConnection(connection);
    emitSignal(signal);
    emitSignalSafe(signal);
    resumeSignalConnection(connection);
    emitSignal(signal);
    emitSignalSafe(signal);

    expect(count).toBe(1);
    expect(connection.connected).toBe(false);
  });
});

describe('resumeSignalConnection', () => {
  it('restores a paused connection at its original priority position', () => {
    const signal = createSignal<() => void>();
    const calls: string[] = [];
    const connection = connectSignalTracked(signal, () => calls.push('high'), { priority: 10 });
    connectSignal(signal, () => calls.push('low'));

    pauseSignalConnection(connection);
    emitSignal(signal);
    resumeSignalConnection(connection);
    emitSignal(signal);

    expect(calls).toEqual(['low', 'high', 'low']);
    expect(connection.connected).toBe(true);
    expect(connection.paused).toBe(false);
  });
});
