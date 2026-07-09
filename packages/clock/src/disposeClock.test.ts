import { connectSignal, hasSignalSlots } from '@flighthq/signals';

import { addClockChild } from './addClockChild';
import { createClock } from './createClock';
import { disposeClock } from './disposeClock';
import { enableClockSignals } from './enableClockSignals';

describe('disposeClock', () => {
  it('detaches the clock from its parent', () => {
    const parent = createClock();
    const clock = createClock();
    addClockChild(parent, clock);
    disposeClock(clock);
    expect(parent.children).toEqual([]);
    expect(clock.parent).toBeNull();
  });

  it('releases its children, making each a root', () => {
    const clock = createClock();
    const child = createClock();
    addClockChild(clock, child);
    disposeClock(clock);
    expect(clock.children).toEqual([]);
    expect(child.parent).toBeNull();
  });

  it('clears onTick listeners', () => {
    const clock = createClock();
    const onTick = enableClockSignals(clock);
    connectSignal(onTick, () => {});
    expect(hasSignalSlots(onTick)).toBe(true);
    disposeClock(clock);
    expect(hasSignalSlots(onTick)).toBe(false);
  });

  it('is safe on a rootless, childless, signal-free clock', () => {
    const clock = createClock();
    expect(() => disposeClock(clock)).not.toThrow();
  });
});
