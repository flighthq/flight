import { createClock } from './createClock';
import { pauseClock, resumeClock } from './pauseClock';

describe('pauseClock', () => {
  it('sets paused to true', () => {
    const clock = createClock();
    pauseClock(clock);
    expect(clock.paused).toBe(true);
  });
});

describe('resumeClock', () => {
  it('sets paused to false', () => {
    const clock = createClock({ paused: true });
    resumeClock(clock);
    expect(clock.paused).toBe(false);
  });
});
