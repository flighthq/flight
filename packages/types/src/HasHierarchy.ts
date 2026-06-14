import type { Entity, EntityRuntime } from './Entity';
import type { Node, NodeTraits, NullScene } from './Node';
import type { NodeSignals } from './NodeSignals';

export interface HasHierarchy extends Entity {}

export interface HasHierarchyRuntime<
  Kind extends symbol = typeof NullScene,
  Traits extends object = NodeTraits,
> extends EntityRuntime {
  canAddChild: (target: Node<Kind, Traits>, child: Node<Kind, Traits>) => boolean;
  children: Node<Kind, Traits>[] | null;
  nodeSignals: NodeSignals;
  parent: Node<Kind, Traits> | null;
}

export type HierarchyNode<Kind extends symbol = typeof NullScene, Traits extends object = NodeTraits> = Node<
  Kind,
  Traits
> &
  HasHierarchy;

export type HierarchyNodeOf<Kind extends symbol = typeof NullScene, Traits extends object = NodeTraits> = HierarchyNode<
  Kind,
  Traits
> &
  Traits;
