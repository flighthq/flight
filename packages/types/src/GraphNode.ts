import type { Node, NodeData } from './Node';
import type { Runtime, RuntimeKey } from './Runtime';
import type { Signal } from './Signal';

export interface GraphNodeTraits {
  data: GraphNodeData | null;
  enabled: boolean;
  kind: symbol;
  name: string | null;
}

export interface GraphNode<GraphKind extends symbol = typeof NullGraph, Traits extends object = GraphNodeTraits>
  extends Node, GraphNodeTraits {
  [RuntimeKey]: GraphNodeRuntime<GraphKind, Traits> | undefined;
  onChildrenChanged: Signal<() => void>;
  onChildrenOrderChanged: Signal<() => void>;
  onParentChanged: Signal<() => void>;
}

export interface GraphNodeRuntime<
  GraphKind extends symbol = typeof NullGraph,
  Traits extends object = GraphNodeTraits,
> extends Runtime {
  appearanceID: number;
  boundsUsingLocalBoundsID: number;
  boundsUsingLocalTransformID: number;
  children: GraphNode<GraphKind, Traits>[] | null;
  graph: GraphKind;
  localBoundsID: number;
  localBoundsUsingLocalBoundsID: number;
  localTransformID: number;
  localTransformUsingLocalTransformID: number;
  parent: GraphNode<GraphKind, Traits> | null;
  worldBoundsUsingLocalBoundsID: number;
  worldBoundsUsingWorldTransformID: number;
  worldTransformID: number;
  worldTransformUsingLocalTransformID: number;
  worldTransformUsingParentTransformID: number;

  canAddChild: (target: GraphNode<GraphKind, Traits>, child: GraphNode<GraphKind, Traits>) => boolean;
}

export interface GraphNodeData extends NodeData {}

export const GraphNodeKind: unique symbol = Symbol('GraphNode');

export type GraphNodeOf<GraphKind extends symbol, Traits extends object> = GraphNode<GraphKind, Traits> & Traits;

export const NullGraph: unique symbol = Symbol('NullGraph');
