import { createSignal } from '@flighthq/signals';
import type { Clock, Signal } from '@flighthq/types';

// Opts the clock into the onTick signal, allocating it on first call and returning it (idempotent — a
// second call returns the same signal). onTick emits the clock's scaled deltaTime on every advance, so it
// plugs straight into signals' rate helpers, e.g. connectSignalAtFrameRate(clock.onTick, 30, slot). Bare
// clocks that never call this keep onTick null and pay no signal allocation or dispatch cost.
export function enableClockSignals(clock: Clock): Signal<(deltaTime: number) => void> {
  if (clock.onTick === null) {
    clock.onTick = createSignal<(deltaTime: number) => void>();
  }
  return clock.onTick;
}
