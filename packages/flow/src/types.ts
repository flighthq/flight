import type { LogState } from '@flighthq/log/contract';

// Enable-time guard context: the caller-owned log state plus a live clock invoked at operation time
// (never a frozen timestamp or hidden clock).
export interface FlowGuardContext {
  logState: LogState;
  clock: () => number;
}

// The kind of flow guard violation detected during a stack transition.
export type FlowGuardKind = 'duplicate-state-push' | 'transition-during-transition';

// Caller-owned diagnostics state for the opt-in flow guards. Create it as a literal
// (`{ enabled: false, transitionDepth: 0, context: null }`) and pass the same object to every push and
// replace on stacks that share a transition timeline, including re-entrant calls from callbacks.
export interface FlowGuardState {
  enabled: boolean;
  transitionDepth: number;
  context: FlowGuardContext | null;
}
