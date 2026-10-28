import { logOnce } from '@flighthq/log/contract';
import type { LogState } from '@flighthq/log/contract';
import { LogLevel } from '@flighthq/types/contract';

import type { FlowGuardKind, FlowGuardState } from './types.ts';

// Turns the guards off on `state` and drops the log context it held.
export function disableFlowGuards(state: FlowGuardState): void {
  state.enabled = false;
  state.context = null;
}

// Turns the opt-in guards on for `state`, reporting through the caller-owned `logState` with a live
// `clock` read at report time.
export function enableFlowGuards(state: FlowGuardState, logState: LogState, clock: () => number): void {
  state.enabled = true;
  state.context = { logState, clock };
}

// The canonical string for a guard kind (the guard kind union is already that string).
export function getFlowGuardKindString(value: FlowGuardKind): string {
  return value;
}

// Parses a guard kind string back to a FlowGuardKind; null for unknown names.
export function parseFlowGuardKind(value: string): FlowGuardKind | null {
  return value === 'duplicate-state-push' || value === 'transition-during-transition' ? value : null;
}

// Reports a guard violation once per kind when the guards on `state` are enabled.
export function reportFlowGuard(state: Readonly<FlowGuardState>, kind: FlowGuardKind): void {
  const context = state.context;
  if (!state.enabled || context === null) return;
  logOnce(context.logState, context.clock(), `flow:${kind}`, LogLevel.Warn, { kind }, 'flow');
}
