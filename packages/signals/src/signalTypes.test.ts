import { advanceSignalTimers, clearSignalTimeout, createSignalTimerState, setSignalTimeout } from './index.ts';
import type { FrameTick, SignalTimerState, TimerId } from './index.ts';
import { createSignalScope } from './scope.ts';
import { createSignal } from './signal.ts';
import type { Signal, SignalScope } from './signalTypes.ts';

describe('Signal public types', () => {
  it('parameterizes a signal by its payload', () => {
    const signal: Signal<{ x: number; y: number }> = createSignal();

    signal.emit({ x: 1, y: 2 });
    expect(signal.data).toBeUndefined();
  });

  it('aliases the generated signal-scope representation', () => {
    const scope: SignalScope = createSignalScope();

    expect(scope.connections).toEqual([]);
  });

  it('exports the explicit timer lane and frame payload from the package root', () => {
    const state: SignalTimerState = createSignalTimerState();
    const tick: FrameTick = { deltaTime: 16 };
    let fired = 0;
    const cancelled: TimerId = setSignalTimeout(state, tick.deltaTime, () => {
      fired += 1;
    });
    clearSignalTimeout(state, cancelled);
    setSignalTimeout(state, tick.deltaTime, () => {
      fired += 1;
    });

    advanceSignalTimers(state, tick.deltaTime);

    expect(fired).toBe(1);
  });
});
