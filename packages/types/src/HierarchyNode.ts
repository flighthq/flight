import type { Node, NodeAny, NodeFields } from './Node.ts';

/**
 * A scene-graph entity whose only required feature is hierarchy membership. APIs typed on this
 * alias use node identity, parentage, or child order without requiring a transform, bounds, or a
 * concrete 2D/3D graph family.
 */
export type HierarchyNode<Fields extends object = NodeFields> = Node<Fields>;

// Trait-erased hierarchy identity for state that may hold nodes from any graph family.
export type HierarchyNodeAny = NodeAny;
