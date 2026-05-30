import type { EntityRuntime, EntityRuntimeKey } from './Entity';
import type { HasGraphHierarchy, HasGraphHierarchyRuntime } from './HasGraphHierarchy';
import type { Matrix } from './Matrix';
import type { Node, NodeData, NodeDataFactory, NodeRuntimeFactory } from './Node';
import type { Signal } from './Signal';

export interface ImageCacheResult {
  canvas: HTMLCanvasElement | null;
  transform: Matrix;
}

export interface GraphNodeTraits {
  data: GraphNodeData | null;
  enabled: boolean;
  kind: symbol;
  name: string | null;
}

export interface GraphNodeSignals {
  onChildrenChanged: Signal<() => void>;
  onChildrenOrderChanged: Signal<() => void>;
  onParentChanged: Signal<() => void>;
}

export interface GraphNode<GraphKind extends symbol = typeof NullGraph, Traits extends object = GraphNodeTraits>
  extends Node, GraphNodeTraits, HasGraphHierarchy {
  [EntityRuntimeKey]: GraphNodeRuntime<GraphKind, Traits> | undefined;
}

export interface GraphNodeRuntime<GraphKind extends symbol = typeof NullGraph, Traits extends object = GraphNodeTraits>
  extends EntityRuntime, HasGraphHierarchyRuntime<GraphKind, Traits> {
  appearanceID: number;
  boundsUsingLocalBoundsID: number;
  boundsUsingLocalTransformID: number;
  graph: GraphKind;
  imageCache: ImageCacheResult | null;
  localBoundsID: number;
  localBoundsUsingLocalBoundsID: number;
  localTransformID: number;
  localTransformUsingLocalTransformID: number;
  worldBoundsUsingLocalBoundsID: number;
  worldBoundsUsingWorldTransformID: number;
  worldTransformID: number;
  worldTransformUsingLocalTransformID: number;
  worldTransformUsingParentTransformID: number;
}

export interface GraphNodeData extends NodeData {}

export const GraphNodeKind: unique symbol = Symbol('GraphNode');

export type GraphNodeOf<GraphKind extends symbol, Traits extends object> = GraphNode<GraphKind, Traits> & Traits;

export const NullGraph: unique symbol = Symbol('NullGraph');

export type GraphNodeDataFactory<Data extends GraphNodeData> = NodeDataFactory<Data>;
export type GraphNodeRuntimeFactory<
  GraphKind extends symbol,
  Traits extends object,
  Runtime extends GraphNodeRuntime<GraphKind, Traits> = GraphNodeRuntime<GraphKind, Traits>,
> = NodeRuntimeFactory<Runtime>;
