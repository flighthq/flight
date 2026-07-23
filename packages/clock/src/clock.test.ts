import { connectSignal, hasSignalSlots } from '@flighthq/signals';

import {
  addClockChild,
  advanceClock,
  createChildClock,
  createClock,
  disposeClock,
  getClockEffectiveScale,
  getClockParent,
  isClockEffectivelyPaused,
  pauseClock,
  removeClockChild,
  resetClock,
  resumeClock,
  setClockScale,
} from './clock';
import { enableClockSignals } from './clockSignals';

describe('addClockChild', () => {
  it('attaches a child and sets its parent', () => {
    const parent = createClock();
    const child = createClock();
    addClockChild(parent, child);
    expect(child.parent).toBe(parent);
    expect(parent.children).toEqual([child]);
  });

  it('is a no-op when the child is already parented here', () => {
    const parent = createClock();
    const child = createClock();
    addClockChild(parent, child);
    addClockChild(parent, child);
    expect(parent.children).toEqual([child]);
  });

  it('reparents, detaching from the previous parent first', () => {
    const a = createClock();
    const b = createClock();
    const child = createClock();
    addClockChild(a, child);
    addClockChild(b, child);
    expect(a.children).toEqual([]);
    expect(b.children).toEqual([child]);
    expect(child.parent).toBe(b);
  });
});

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

describe('createChildClock', () => {
  it('creates a clock attached to the parent', () => {
    const parent = createClock();
    const child = createChildClock(parent);
    expect(child.parent).toBe(parent);
    expect(parent.children).toContain(child);
  });

  it('applies options to the child', () => {
    const parent = createClock();
    const child = createChildClock(parent, { scale: 0.5, paused: true });
    expect(child.scale).toBe(0.5);
    expect(child.paused).toBe(true);
  });
});

describe('createClock', () => {
  it('defaults to realtime, running, zeroed, rootless, and signal-free', () => {
    const clock = createClock();
    expect(clock.scale).toBe(1);
    expect(clock.paused).toBe(false);
    expect(clock.deltaTime).toBe(0);
    expect(clock.elapsed).toBe(0);
    expect(clock.parent).toBeNull();
    expect(clock.children).toEqual([]);
    expect(clock.onTick).toBeNull();
  });

  it('applies scale and paused options', () => {
    const clock = createClock({ scale: 3, paused: true });
    expect(clock.scale).toBe(3);
    expect(clock.paused).toBe(true);
  });
});

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

describe('getClockEffectiveScale', () => {
  it('returns the local scale for a root', () => {
    expect(getClockEffectiveScale(createClock({ scale: 2 }))).toBe(2);
  });

  it('multiplies through the ancestor chain', () => {
    const a = createClock({ scale: 2 });
    const b = createChildClock(a, { scale: 0.5 });
    const c = createChildClock(b, { scale: 3 });
    expect(getClockEffectiveScale(c)).toBe(3); // 2 * 0.5 * 3
  });
});

describe('getClockParent', () => {
  it('returns null for a root clock', () => {
    expect(getClockParent(createClock())).toBeNull();
  });

  it('returns the parent for a child clock', () => {
    const parent = createClock();
    const child = createChildClock(parent);
    expect(getClockParent(child)).toBe(parent);
  });
});

describe('isClockEffectivelyPaused', () => {
  it('is false for a running root', () => {
    expect(isClockEffectivelyPaused(createClock())).toBe(false);
  });

  it('is true when the clock itself is paused', () => {
    expect(isClockEffectivelyPaused(createClock({ paused: true }))).toBe(true);
  });

  it('is true when an ancestor is paused even if the clock is running', () => {
    const parent = createClock({ paused: true });
    const child = createChildClock(parent);
    expect(child.paused).toBe(false);
    expect(isClockEffectivelyPaused(child)).toBe(true);
  });
});

describe('pauseClock', () => {
  it('sets paused to true', () => {
    const clock = createClock();
    pauseClock(clock);
    expect(clock.paused).toBe(true);
  });
});

describe('removeClockChild', () => {
  it('detaches a child and clears its parent', () => {
    const parent = createClock();
    const child = createClock();
    addClockChild(parent, child);
    removeClockChild(parent, child);
    expect(parent.children).toEqual([]);
    expect(child.parent).toBeNull();
  });

  it('is a no-op when the child is not parented here', () => {
    const parent = createClock();
    const child = createClock();
    expect(() => removeClockChild(parent, child)).not.toThrow();
    expect(parent.children).toEqual([]);
  });
});

describe('resetClock', () => {
  it('clears elapsed and deltaTime without touching scale or pause', () => {
    const clock = createClock({ scale: 2 });
    advanceClock(clock, 1);
    resetClock(clock);
    expect(clock.elapsed).toBe(0);
    expect(clock.deltaTime).toBe(0);
    expect(clock.scale).toBe(2);
    expect(clock.paused).toBe(false);
  });
});

describe('resumeClock', () => {
  it('sets paused to false', () => {
    const clock = createClock({ paused: true });
    resumeClock(clock);
    expect(clock.paused).toBe(false);
  });
});

describe('setClockScale', () => {
  it('updates the local scale', () => {
    const clock = createClock();
    setClockScale(clock, 0.25);
    expect(clock.scale).toBe(0.25);
  });
});
