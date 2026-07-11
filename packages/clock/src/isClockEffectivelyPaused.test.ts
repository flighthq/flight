import { createChildClock, createClock } from './createClock';
import { isClockEffectivelyPaused } from './isClockEffectivelyPaused';

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
