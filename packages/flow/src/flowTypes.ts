// Generated from crates/flight-flow/src/flow_types.rs by flight-compiler.
// Rust is authoritative; run `npm run generate` after changing it.

import type { EntityRaw } from '@flighthq/entity/contract';

/**
 * A lifecycle callback stored on a flow state (D9 stored capturing form).
 */
export type FlowCallback = () => void;

/**
 * A per-frame update callback stored on a flow state.
 */
export type FlowUpdateCallback = (arg0: number) => void;

/**
 * A single application state in a flow stack. Plain data: callers construct it with a literal
 * (TS `FlowState` does not extend Entity). The stack stores it behind `Ref`, matching TS object
 * identity and enabling real re-entrant transitions.
 */
export interface FlowState {
  name?: string;
  onEnter?: FlowCallback;
  onExit?: FlowCallback;
  onPause?: FlowCallback;
  onResume?: FlowCallback;
  onUpdate?: FlowUpdateCallback;
  renderBelow?: boolean;
  updateBelow?: boolean;
}

/**
 * The flow-state stack. `states` is ordered bottom-to-top, so the last element is the active top;
 * each state is a shared `Ref`, so duplicate detection is `Arc::ptrEq` exactly as TS compares
 * object references.
 */
export interface FlowStackRaw extends EntityRaw {
  states: FlowState[];
}
