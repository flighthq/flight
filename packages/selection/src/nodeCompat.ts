// Generated from crates/flight-selection/src/node_compat.rs by flight-compiler.
// Rust is authoritative; run `npm run generate` after changing it.

import type { NodeRef } from '@flighthq/node/contract';

/**
 * Node identity for selection membership: the same node allocation, never structural equality.
 */
export function isSameSelectionNode(a: Readonly<NodeRef>, b: Readonly<NodeRef>): boolean {
  return a === b;
}
