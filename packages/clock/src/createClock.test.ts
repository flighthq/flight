import { createChildClock, createClock } from './createClock';

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
