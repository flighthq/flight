import type { NodeRef } from '@flighthq/node/contract';

// Node identity for selection membership: the same node object, never structural equality.
export function isSameSelectionNode(a: Readonly<NodeRef>, b: Readonly<NodeRef>): boolean {
  return a === b;
}
