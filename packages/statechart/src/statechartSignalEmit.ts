// Generated from crates/flight-statechart/src/statechart_signal_emit.rs by flight-compiler.
// Rust is authoritative; run `npm run generate` after changing it.

import { emitSignal } from '@flighthq/signals/contract';

import type { StatechartSignals } from './types.ts';

export function emitStatechartStateChange(
  signals: Readonly<StatechartSignals>,
  regionIndex: number,
  previousStateIndex: number,
  stateIndex: number,
): void {
  emitSignal(signals.onStateChange, [regionIndex, previousStateIndex, stateIndex]);
}
