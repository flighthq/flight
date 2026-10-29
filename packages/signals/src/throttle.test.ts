// Generated from crates/flight-signals/tests/throttle_test.rs by flight-compiler.
// Rust is authoritative; run `npm run generate` after changing it.

import { initializeSignalTimerState } from '@flighthq/signals/contract';
import { describe, expect, it } from 'vitest';

import {
  advanceSignalTimers,
  clearSignalTimeout,
  connectSignalAtFrameRate,
  connectSignalDebounced,
  connectSignalThrottled,
  createSignal,
  createSignalTimerState,
  emitSignal,
  setSignalTimeout,
} from './contract.ts';
import type { FrameTick, SignalRaw, SignalThrottleOptions, SignalTimerState } from './contract.ts';

type TimerRef = SignalTimerState;

interface PairEvent {
  x: number;
  y: number;
}

function timerState(): TimerRef {
  return createSignalTimerState();
}

function now(state: Readonly<TimerRef>): number {
  return state!.nowMs;
}

describe('advanceSignalTimers', () => {
  it('runs due callbacks in fire time order and sets the current time', () => {
    const state = timerState();
    const order: { value: string[] } = { value: [] as never[] };
    for (const [label, delay] of [
      ['second', 20.0],
      ['first', 10.0],
    ] as const) {
      const timerOrder = order;
      setSignalTimeout(state, delay, () => timerOrder.value.push(label));
    }
    advanceSignalTimers(state, 15.0);
    expect(order.value).toEqual(['first']);
    expect(now(state)).toEqual(15.0);
    advanceSignalTimers(state, 25.0);
    expect(order.value).toEqual(['first', 'second']);
    expect(now(state)).toEqual(25.0);
  });
});

describe('clearSignalTimeout', () => {
  it('prevents a pending callback from running', () => {
    const state = timerState();
    const fired = { value: 0 };
    const counter = fired;
    const id = setSignalTimeout(state, 10.0, () => (counter.value += 1));
    clearSignalTimeout(state, id);
    advanceSignalTimers(state, 100.0);
    expect(fired.value).toEqual(0);
  });
});

describe('connectSignalAtFrameRate', () => {
  it('fires the slot only when accumulated delta reaches the period', () => {
    const source: SignalRaw<FrameTick> = createSignal();
    const fired: { value: number[] } = { value: [] as never[] };
    const out = fired;
    connectSignalAtFrameRate(source, 10.0, (delta: number) => out.value.push(delta));
    emitSignal(source, { deltaTime: 40.0 });
    emitSignal(source, { deltaTime: 40.0 });
    expect(fired.value.length === 0).toBe(true);
    emitSignal(source, { deltaTime: 40.0 });
    expect(fired.value.length).toEqual(1);
    expect(fired.value[0]).toEqual(120.0);
  });
  it('accumulates remainder across firings', () => {
    const source: SignalRaw<FrameTick> = createSignal();
    const fired = { value: 0 };
    const count = fired;
    connectSignalAtFrameRate(source, 10.0, (Delta: number) => (count.value += 1));
    emitSignal(source, { deltaTime: 110.0 });
    emitSignal(source, { deltaTime: 110.0 });
    expect(fired.value).toEqual(2);
  });
  it('returns a cleanup that stops the slot', () => {
    const source: SignalRaw<FrameTick> = createSignal();
    const fired = { value: 0 };
    const count = fired;
    const detach = connectSignalAtFrameRate(source, 10.0, (Delta: number) => (count.value += 1));
    detach();
    emitSignal(source, { deltaTime: 200.0 });
    expect(fired.value).toEqual(0);
  });
});

describe('connectSignalDebounced', () => {
  it('fires after the delay when the signal goes quiet', () => {
    const source: SignalRaw<number> = createSignal();
    const state = timerState();
    const fired: { value: number[] } = { value: [] as never[] };
    const out = fired;
    connectSignalDebounced(source, 100.0, (value: number) => out.value.push(value), undefined, state);
    emitSignal(source, 1);
    emitSignal(source, 2);
    expect(fired.value.length === 0).toBe(true);
    advanceSignalTimers(state, 100.0);
    expect(fired.value).toEqual([2]);
  });
  it('resets the timer on each emission', () => {
    const source: SignalRaw<void> = createSignal();
    const state = timerState();
    const count = { value: 0 };
    const counter = count;
    connectSignalDebounced(source, 100.0, (_unused0: void) => (counter.value += 1), undefined, state);
    emitSignal(source, undefined);
    advanceSignalTimers(state, 50.0);
    emitSignal(source, undefined);
    advanceSignalTimers(state, 100.0);
    expect(count.value).toEqual(0);
    advanceSignalTimers(state, 150.0);
    expect(count.value).toEqual(1);
  });
  it('fires on the leading edge when leading is true', () => {
    const source: SignalRaw<void> = createSignal();
    const state = timerState();
    const count = { value: 0 };
    const counter = count;
    const options: SignalThrottleOptions = { leading: true, trailing: false };
    connectSignalDebounced(source, 100.0, (_unused0: void) => (counter.value += 1), options, state);
    emitSignal(source, undefined);
    expect(count.value).toEqual(1);
    emitSignal(source, undefined);
    emitSignal(source, undefined);
    advanceSignalTimers(state, 100.0);
    expect(count.value).toEqual(1);
  });
  it('cleanup stops the slot and cancels the timer', () => {
    const source: SignalRaw<void> = createSignal();
    const state = timerState();
    const count = { value: 0 };
    const counter = count;
    const detach = connectSignalDebounced(source, 100.0, (_unused0: void) => (counter.value += 1), undefined, state);
    emitSignal(source, undefined);
    detach();
    advanceSignalTimers(state, 200.0);
    expect(count.value).toEqual(0);
  });
});

describe('connectSignalThrottled', () => {
  it('fires immediately on the first emission', () => {
    const source: SignalRaw<number> = createSignal();
    const state = timerState();
    const fired: { value: number[] } = { value: [] as never[] };
    const out = fired;
    connectSignalThrottled(source, 100.0, (value: number) => out.value.push(value), undefined, state);
    emitSignal(source, 1);
    expect(fired.value).toEqual([1]);
  });
  it('suppresses emissions within the interval then fires the trailing value', () => {
    const source: SignalRaw<number> = createSignal();
    const state = timerState();
    const fired: { value: number[] } = { value: [] as never[] };
    const out = fired;
    connectSignalThrottled(source, 100.0, (value: number) => out.value.push(value), undefined, state);
    emitSignal(source, 1);
    advanceSignalTimers(state, 50.0);
    emitSignal(source, 2);
    advanceSignalTimers(state, 100.0);
    expect(fired.value.includes(1)).toBe(true);
    expect(fired.value.includes(2)).toBe(true);
  });
  it('preserves the original payload', () => {
    const source: SignalRaw<PairEvent> = createSignal();
    const state = timerState();
    const fired: { value: Array<readonly [number, number]> } = { value: [] as never[] };
    const out = fired;
    connectSignalThrottled(
      source,
      100.0,
      (event: Readonly<PairEvent>) => out.value.push([event.x, event.y]),
      undefined,
      state,
    );
    emitSignal(source, { x: 3, y: 7 });
    expect(fired.value).toEqual([[3, 7]]);
  });
  it('cleanup stops the slot and cancels the trailing call', () => {
    const source: SignalRaw<void> = createSignal();
    const state = timerState();
    const count = { value: 0 };
    const counter = count;
    const detach = connectSignalThrottled(source, 100.0, (_unused0: void) => (counter.value += 1), undefined, state);
    emitSignal(source, undefined);
    expect(count.value).toEqual(1);
    emitSignal(source, undefined);
    detach();
    advanceSignalTimers(state, 200.0);
    expect(count.value).toEqual(1);
  });
  it('fires the first emission on the trailing edge when leading is disabled', () => {
    const source: SignalRaw<number> = createSignal();
    const state = timerState();
    const fired: { value: number[] } = { value: [] as never[] };
    const out = fired;
    const options: SignalThrottleOptions = { leading: false, trailing: true };
    connectSignalThrottled(source, 100.0, (value: number) => out.value.push(value), options, state);
    emitSignal(source, 3);
    expect(fired.value.length === 0).toBe(true);
    advanceSignalTimers(state, 99.0);
    expect(fired.value.length === 0).toBe(true);
    advanceSignalTimers(state, 100.0);
    expect(fired.value).toEqual([3]);
  });
  it('ignores cooldown emissions when trailing is disabled', () => {
    const source: SignalRaw<number> = createSignal();
    const state = timerState();
    const fired: { value: number[] } = { value: [] as never[] };
    const out = fired;
    const options: SignalThrottleOptions = { leading: undefined, trailing: false };
    connectSignalThrottled(source, 100.0, (value: number) => out.value.push(value), options, state);
    emitSignal(source, 3);
    advanceSignalTimers(state, 50.0);
    emitSignal(source, 7);
    advanceSignalTimers(state, 150.0);
    expect(fired.value).toEqual([3]);
  });
  it('does not fire when both leading and trailing are disabled', () => {
    const source: SignalRaw<number> = createSignal();
    const state = timerState();
    const fired: { value: number[] } = { value: [] as never[] };
    const out = fired;
    const options: SignalThrottleOptions = { leading: false, trailing: false };
    connectSignalThrottled(source, 100.0, (value: number) => out.value.push(value), options, state);
    emitSignal(source, 3);
    advanceSignalTimers(state, 100.0);
    expect(fired.value.length === 0).toBe(true);
  });
});

describe('createSignalTimerState', () => {
  it('starts at time zero with no timers', () => {
    const state = createSignalTimerState();
    expect(state.nowMs).toEqual(0.0);
    expect(state.timers.length === 0).toBe(true);
  });
});

describe('initializeSignalTimerState', () => {
  it('is the construction initializer of create signal timer state', () => {
    let state = createSignalTimerState();
    setSignalTimeout(state, 10.0, () => {});
    advanceSignalTimers(state, 5.0);
    state = state!;
    initializeSignalTimerState(state);
    expect(state.nowMs).toEqual(0.0);
    expect(state.timers.length === 0).toBe(true);
  });
});

describe('setSignalTimeout', () => {
  it('schedules a callback relative to the current time', () => {
    const state = timerState();
    const fired = { value: 0 };
    const counter = fired;
    advanceSignalTimers(state, 50.0);
    setSignalTimeout(state, 25.0, () => (counter.value += 1));
    advanceSignalTimers(state, 74.0);
    expect(fired.value).toEqual(0);
    advanceSignalTimers(state, 75.0);
    expect(fired.value).toEqual(1);
  });
  it('allocates a new id for each timer', () => {
    const state = timerState();
    const first = setSignalTimeout(state, 10.0, () => {});
    const second = setSignalTimeout(state, 20.0, () => {});
    expect(first).not.toEqual(second);
  });
  it('preserves insertion order for equal deadlines across multi digit ids', () => {
    const state = timerState();
    const order: { value: number[] } = { value: [] as never[] };
    for (let value = 0; value < 12; value += 1) {
      const timerOrder = order;
      setSignalTimeout(state, 10.0, () => timerOrder.value.push(value));
    }
    advanceSignalTimers(state, 10.0);
    expect(order.value).toEqual(Array.from({ length: 12 - 0 }, (_, index) => 0 + index));
  });
});
