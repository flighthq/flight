import { connectSignal } from '@flighthq/signals';

import { advanceClock } from './advanceClock';
import { createChildClock, createClock } from './createClock';
import { enableClockSignals } from './enableClockSignals';

describe('advanceClock', () => {
  it('sets deltaTime to the real delta and accumulates elapsed on a realtime root', () => {
    const clock = createClock();
    advanceClock(clock, 0.5);
    expect(clock.deltaTime).toBe(0.5);
    expect(clock.elapsed).toBe(0.5);
    advanceClock(clock, 0.25);
    expect(clock.deltaTime).toBe(0.25);
    expect(clock.elapsed).toBe(0.75);
  });

  it('applies the local scale', () => {
    const clock = createClock({ scale: 2 });
    advanceClock(clock, 1);
    expect(clock.deltaTime).toBe(2);
    expect(clock.elapsed).toBe(2);
  });

  it('feeds a zero delta while paused, freezing elapsed', () => {
    const clock = createClock({ paused: true });
    advanceClock(clock, 1);
    expect(clock.deltaTime).toBe(0);
    expect(clock.elapsed).toBe(0);
  });

  it('composes scale down a 3-level hierarchy — grandparent to parent to child', () => {
    const grandparent = createClock({ scale: 2 });
    const parent = createChildClock(grandparent, { scale: 3 });
    const child = createChildClock(parent, { scale: 0.5 });
    advanceClock(grandparent, 1);
    expect(grandparent.deltaTime).toBe(2); // 1 * 2
    expect(parent.deltaTime).toBe(6); // 2 * 3
    expect(child.deltaTime).toBe(3); // 6 * 0.5
    expect(child.elapsed).toBe(3);
  });

  it('composes scale down the hierarchy — a child rate is the product of the chain', () => {
    const parent = createClock({ scale: 2 });
    const child = createChildClock(parent, { scale: 0.5 });
    advanceClock(parent, 1);
    expect(parent.deltaTime).toBe(2);
    expect(child.deltaTime).toBe(1); // 1 * 2 * 0.5
    expect(child.elapsed).toBe(1);
  });

  it('freezes a subtree when an ancestor is paused even if the child is running', () => {
    const parent = createClock({ paused: true });
    const child = createChildClock(parent);
    advanceClock(parent, 1);
    expect(parent.deltaTime).toBe(0);
    expect(child.deltaTime).toBe(0);
    expect(child.elapsed).toBe(0);
  });

  it('emits onTick with the scaled delta when signals are enabled', () => {
    const clock = createClock({ scale: 2 });
    const received: number[] = [];
    const onTick = enableClockSignals(clock);
    connectSignal(onTick, (deltaTime) => received.push(deltaTime));
    advanceClock(clock, 0.5);
    expect(received).toEqual([1]); // 0.5 * 2
  });

  it('applies a negative deltaTime, producing negative deltaTime and decreasing elapsed', () => {
    const clock = createClock();
    advanceClock(clock, 1);
    expect(clock.elapsed).toBe(1);
    advanceClock(clock, -0.5);
    expect(clock.deltaTime).toBe(-0.5);
    expect(clock.elapsed).toBe(0.5);
  });

  it('applies a negative scale, reversing the effective delta direction', () => {
    const clock = createClock({ scale: -1 });
    advanceClock(clock, 1);
    expect(clock.deltaTime).toBe(-1);
    expect(clock.elapsed).toBe(-1);
  });

  it('does not emit or throw when signals are not enabled', () => {
    const clock = createClock();
    expect(() => advanceClock(clock, 1)).not.toThrow();
    expect(clock.onTick).toBeNull();
  });
});
