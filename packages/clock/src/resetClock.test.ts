import { advanceClock } from './advanceClock';
import { createClock } from './createClock';
import { resetClock } from './resetClock';

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
