import type { Node, NodeAny, NodeFields } from './Node.ts';

export type HierarchyNode<Fields extends object = NodeFields> = Node<Fields>;
export type HierarchyNodeAny = NodeAny;
