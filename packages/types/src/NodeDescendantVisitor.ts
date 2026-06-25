import type { Node, NodeTraits } from './Node';

// Visitor invoked for each descendant during a depth-first walk. Returning `false` stops the walk
// early (the current node's subtree and remaining siblings are skipped); returning `true` (or any
// truthy value) continues.
export type NodeDescendantVisitor<Traits extends object = NodeTraits> = (node: Node<Traits>) => boolean;
