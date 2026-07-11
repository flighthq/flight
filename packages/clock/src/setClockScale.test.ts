import { createClock } from './createClock';
import { setClockScale } from './setClockScale';

describe('setClockScale', () => {
  it('updates the local scale', () => {
    const clock = createClock();
    setClockScale(clock, 0.25);
    expect(clock.scale).toBe(0.25);
  });
});
