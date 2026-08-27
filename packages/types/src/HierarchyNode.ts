import type { Node, NodeAny, NodeTraits } from './Node';

/**
 * A scene-graph entity whose only required feature is hierarchy membership. APIs typed on this
 * alias use node identity, parentage, or child order without requiring a transform, bounds, or a
 * concrete 2D/3D graph family.
 */
export type HierarchyNode<Traits extends object = NodeTraits> = Node<Traits>;

// Trait-erased hierarchy identity for state that may hold nodes from any graph family.
export type HierarchyNodeAny = NodeAny;
