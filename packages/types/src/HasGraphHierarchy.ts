import type { Entity, EntityRuntime } from './Entity';
import type { GraphNode, GraphNodeTraits, NullGraph } from './GraphNode';
import type { GraphSignals } from './GraphNodeSignals';

export interface HasGraphHierarchy extends Entity {}

export interface HasGraphHierarchyRuntime<
  GraphKind extends symbol = typeof NullGraph,
  Traits extends object = GraphNodeTraits,
> extends EntityRuntime {
  canAddChild: (target: GraphNode<GraphKind, Traits>, child: GraphNode<GraphKind, Traits>) => boolean;
  children: GraphNode<GraphKind, Traits>[] | null;
  graphSignals: GraphSignals;
  parent: GraphNode<GraphKind, Traits> | null;
}

export type GraphHierarchyNode<
  GraphKind extends symbol = typeof NullGraph,
  Traits extends object = GraphNodeTraits,
> = GraphNode<GraphKind, Traits> & HasGraphHierarchy;

export type GraphHierarchyNodeOf<
  GraphKind extends symbol = typeof NullGraph,
  Traits extends object = GraphNodeTraits,
> = GraphHierarchyNode<GraphKind, Traits> & Traits;
