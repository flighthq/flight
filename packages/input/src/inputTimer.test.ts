// Generated from crates/flight-input/tests/input_timer_test.rs by flight-compiler.
// Rust is authoritative; run `npm run generate` after changing it.

import { describe, expect, it } from 'vitest';

import {
  advanceInputKeyRepeatTimer,
  createInputKeyRepeatTimer,
  initializeInputKeyRepeatTimer,
  startInputKeyRepeatTimer,
  stopInputKeyRepeatTimer,
} from './contract.ts';
import type { InputKeyRepeatOptions, InputKeyRepeatTimerRaw, InputRepeatCallback } from './contract.ts';

function options(delay: number, interval: number): InputKeyRepeatOptions {
  return { delay: delay, interval: interval };
}

function counter(): readonly [{ value: number }, InputRepeatCallback] {
  const count = { value: 0 };
  const captured = count;
  const callback: InputRepeatCallback = () => (captured.value += 1);
  return [count, callback];
}

describe('advanceInputKeyRepeatTimer', () => {
  it('fires the delayed tick then one tick per interval', () => {
    const timer = createInputKeyRepeatTimer(options(500.0, 33.0));
    const [count, callback] = counter();
    startInputKeyRepeatTimer(timer, callback, 0.0);
    expect(count.value).toEqual(1);
    advanceInputKeyRepeatTimer(timer, 499.0);
    expect(count.value).toEqual(1);
    advanceInputKeyRepeatTimer(timer, 500.0);
    expect(count.value).toEqual(2);
    advanceInputKeyRepeatTimer(timer, 533.0);
    expect(count.value).toEqual(3);
  });
  it('catches up every due tick in order', () => {
    const timer = createInputKeyRepeatTimer(options(10.0, 10.0));
    const [count, callback] = counter();
    startInputKeyRepeatTimer(timer, callback, 0.0);
    advanceInputKeyRepeatTimer(timer, 35.0);
    expect(count.value).toEqual(4);
  });
  it('a zero interval fires once per advance', () => {
    const timer = createInputKeyRepeatTimer(options(0.0, 0.0));
    const [count, callback] = counter();
    startInputKeyRepeatTimer(timer, callback, 0.0);
    expect(count.value).toEqual(1);
    advanceInputKeyRepeatTimer(timer, 0.0);
    expect(count.value).toEqual(2);
    advanceInputKeyRepeatTimer(timer, 0.0);
    expect(count.value).toEqual(3);
  });
  it('does nothing when stopped or not yet due', () => {
    const timer = createInputKeyRepeatTimer(options(100.0, 10.0));
    const [count, callback] = counter();
    advanceInputKeyRepeatTimer(timer, 1000.0);
    expect(count.value).toEqual(0);
    startInputKeyRepeatTimer(timer, callback, 0.0);
    stopInputKeyRepeatTimer(timer);
    advanceInputKeyRepeatTimer(timer, 1000.0);
    expect(count.value).toEqual(1);
  });
});

describe('createInputKeyRepeatTimer', () => {
  it('allocates an inactive timer with the supplied timings', () => {
    const timer = createInputKeyRepeatTimer(options(500.0, 33.0));
    const [count, callback] = counter();
    advanceInputKeyRepeatTimer(timer, 1000.0);
    expect(count.value).toEqual(0);
    startInputKeyRepeatTimer(timer, callback, 0.0);
    advanceInputKeyRepeatTimer(timer, 499.0);
    expect(count.value).toEqual(1);
    advanceInputKeyRepeatTimer(timer, 500.0);
    expect(count.value).toEqual(2);
    advanceInputKeyRepeatTimer(timer, 533.0);
    expect(count.value).toEqual(3);
  });
});

describe('initializeInputKeyRepeatTimer', () => {
  function reinitialize(timer: InputKeyRepeatTimerRaw, options: Readonly<InputKeyRepeatOptions>): void {
    let locked = timer!;
    initializeInputKeyRepeatTimer(locked, options);
  }
  it('resets the cycle and replaces the timings', () => {
    const timer = createInputKeyRepeatTimer(options(500.0, 33.0));
    const [count, callback] = counter();
    startInputKeyRepeatTimer(timer, callback, 0.0);
    reinitialize(timer, options(10.0, 5.0));
    advanceInputKeyRepeatTimer(timer, 100.0);
    expect(count.value).toEqual(1);
    const [newCount, newCallback] = counter();
    startInputKeyRepeatTimer(timer, newCallback, 0.0);
    advanceInputKeyRepeatTimer(timer, 9.0);
    expect(newCount.value).toEqual(1);
    advanceInputKeyRepeatTimer(timer, 10.0);
    expect(newCount.value).toEqual(2);
  });
});

describe('startInputKeyRepeatTimer', () => {
  it('invokes immediately and restarts the cycle', () => {
    const timer = createInputKeyRepeatTimer(options(100.0, 10.0));
    const [count, callback] = counter();
    startInputKeyRepeatTimer(timer, callback, 0.0);
    expect(count.value).toEqual(1);
    const [secondCount, secondCallback] = counter();
    startInputKeyRepeatTimer(timer, secondCallback, 50.0);
    expect(secondCount.value).toEqual(1);
    advanceInputKeyRepeatTimer(timer, 100.0);
    expect(count.value).toEqual(1);
    expect(secondCount.value).toEqual(1);
    advanceInputKeyRepeatTimer(timer, 150.0);
    expect(secondCount.value).toEqual(2);
  });
});

describe('stopInputKeyRepeatTimer', () => {
  it('cancels the cycle and is idempotent', () => {
    const timer = createInputKeyRepeatTimer(options(10.0, 10.0));
    const [count, callback] = counter();
    startInputKeyRepeatTimer(timer, callback, 0.0);
    stopInputKeyRepeatTimer(timer);
    stopInputKeyRepeatTimer(timer);
    advanceInputKeyRepeatTimer(timer, 1000.0);
    expect(count.value).toEqual(1);
  });
});
