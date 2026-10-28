import { connectSignal, hasSignalSlots } from '@flighthq/signals/contract';

import { addClockChild, advanceClock, createChildClock, createClock, disposeClock } from './clock.ts';
import { enableClockSignals } from './clockSignals.ts';

describe('advanceClock signals', () => {
  it('does not emit or throw when signals are not enabled', () => {
    const clock = createClock();
    expect(() => advanceClock(clock, 1000)).not.toThrow();
    expect(clock.onTick).toBeNull();
  });

  it('emits onTick with the scaled delta when signals are enabled', () => {
    const clock = createClock({ scale: 2 });
    const received: number[] = [];
    const onTick = enableClockSignals(clock);
    connectSignal(onTick, (deltaTime) => received.push(deltaTime));
    advanceClock(clock, 500);
    expect(received).toEqual([1000]);
  });

  it('fires a clock onTick before its children advance', () => {
    const parent = createClock();
    const child = createChildClock(parent);
    const seenChildDelta: number[] = [];
    connectSignal(enableClockSignals(parent), () => seenChildDelta.push(child.deltaTime));
    advanceClock(parent, 100);
    expect(seenChildDelta).toEqual([0]);
    expect(child.deltaTime).toBe(100);
  });

  it('lets an onTick slot attach a child that advances in the same pass', () => {
    const parent = createClock();
    const late = createClock();
    connectSignal(enableClockSignals(parent), () => addClockChild(parent, late));
    advanceClock(parent, 40);
    expect(parent.children).toEqual([late]);
    expect(late.deltaTime).toBe(40);
  });
});

describe('disposeClock native representation', () => {
  it('clears the existing public children array in place', () => {
    const clock = createClock();
    addClockChild(clock, createClock());
    const children = clock.children;
    disposeClock(clock);
    expect(clock.children).toBe(children);
    expect(children).toEqual([]);
  });

  it('clears onTick listeners', () => {
    const clock = createClock();
    const onTick = enableClockSignals(clock);
    connectSignal(onTick, () => {});
    expect(hasSignalSlots(onTick)).toBe(true);
    disposeClock(clock);
    expect(hasSignalSlots(onTick)).toBe(false);
  });
});

describe('enableClockSignals', () => {
  it('allocates the onTick signal and returns it', () => {
    const clock = createClock();
    const onTick = enableClockSignals(clock);
    expect(clock.onTick).toBe(onTick);
    expect(onTick).not.toBeNull();
  });

  it('is idempotent — a second call returns the same signal', () => {
    const clock = createClock();
    const first = enableClockSignals(clock);
    const second = enableClockSignals(clock);
    expect(second).toBe(first);
  });
});

describe('native Clock option representation', () => {
  it('uses explicit null for parent and onTick', () => {
    const clock = createClock();
    expect(clock.parent).toBeNull();
    expect(clock.onTick).toBeNull();
  });
});
