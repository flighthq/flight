import type { Node, NodeFields } from './Node.ts';

// Visitor invoked for each descendant during a depth-first walk. Returning `false` stops the walk
// early (the current node's subtree and remaining siblings are skipped); returning `true` (or any
// truthy value) continues.
export type NodeDescendantVisitor<Fields extends object = NodeFields> = (node: Node<Fields>) => boolean;
