import type { Entity, EntityRuntime } from './Entity';
import type { GraphNode, GraphNodeSignals, GraphNodeTraits, NullGraph } from './GraphNode';

export interface HasGraphHierarchy extends Entity {}

export interface HasGraphHierarchyRuntime<
  GraphKind extends symbol = typeof NullGraph,
  Traits extends object = GraphNodeTraits,
> extends EntityRuntime {
  children: GraphNode<GraphKind, Traits>[] | null;
  parent: GraphNode<GraphKind, Traits> | null;
  signals: GraphNodeSignals | null;

  canAddChild: (target: GraphNode<GraphKind, Traits>, child: GraphNode<GraphKind, Traits>) => boolean;
}

export type GraphHierarchyNode<
  GraphKind extends symbol = typeof NullGraph,
  Traits extends object = GraphNodeTraits,
> = GraphNode<GraphKind, Traits> & HasGraphHierarchy;

export type GraphHierarchyNodeOf<
  GraphKind extends symbol = typeof NullGraph,
  Traits extends object = GraphNodeTraits,
> = GraphHierarchyNode<GraphKind, Traits> & Traits;
