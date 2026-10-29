// Generated from crates/flight-flow/src/types.rs by flight-compiler.
// Rust is authoritative; run `npm run generate` after changing it.

import type { LogStateRaw } from '@flighthq/log/contract';

/**
 * The kind of flow guard violation detected during a stack transition. The strings match the TS
 * string union exactly (D9e).
 */
export type FlowGuardKind = 'duplicate-state-push' | 'transition-during-transition';

/**
 * Approved enable-time guard context: explicit caller-owned log state plus a live clock invoked at
 * operation time (never a frozen timestamp or hidden clock).
 */
export interface FlowGuardContext {
  logState: LogStateRaw;
  clock: () => number;
}

/**
 * Explicit diagnostics state for the opt-in flow guards (D5). Plain Rust-only dispatch state: the
 * caller creates it with a literal and shares it with re-entrant transition callbacks.
 */
export interface FlowGuardState {
  enabled: boolean;
  transitionDepth: number;
  context: FlowGuardContext | null;
}
