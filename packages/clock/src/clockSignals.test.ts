import { createClock } from './clock';
import { enableClockSignals } from './clockSignals';

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
