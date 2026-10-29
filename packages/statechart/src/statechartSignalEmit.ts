import { emitSignal } from '@flighthq/signals/contract';

import type { StatechartSignals } from './types.ts';

export function emitStatechartStateChange(
  signals: StatechartSignals,
  regionIndex: number,
  previousStateIndex: number,
  stateIndex: number,
): void {
  emitSignal(signals.onStateChange, [regionIndex, previousStateIndex, stateIndex]);
}
