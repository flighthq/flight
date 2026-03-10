import type { GraphNode, GraphNodeData, GraphNodeRuntime, NodeData, PartialWithData } from '@flighthq/types';
import { NodeRuntimeKey } from '@flighthq/types';

import type { GraphNodeInternal } from './internal';
import type { NodeDataFactory, NodeRuntimeFactory } from './node';
import { getRuntime } from './node';
import { createNode, createNodeRuntime } from './node';

export type GraphNodeDataFactory<D extends GraphNodeData> = NodeDataFactory<D>;
export type GraphNodeRuntimeFactory<G extends symbol, R extends GraphNodeRuntime<G>> = NodeRuntimeFactory<R>;

export function createGraphNode<G extends symbol, D extends GraphNodeData, R extends GraphNodeRuntime<G>>(
  graph: G,
  nodeKind: symbol,
  obj?: Readonly<PartialWithData<GraphNode<G>>>,
  createData?: GraphNodeDataFactory<D>,
  createRuntime?: GraphNodeRuntimeFactory<G, R>,
): GraphNode<G> {
  const out = createNode(
    nodeKind,
    obj,
    createData,
    createRuntime ?? (createGraphNodeRuntime as NodeRuntimeFactory<R>),
  ) as GraphNode<G>;
  out[NodeRuntimeKey]!.graph = graph;
  (out as GraphNodeInternal<G>).children = obj?.children ?? null;
  (out as GraphNodeInternal<G>).parent = obj?.parent ?? null;
  out.visible = obj?.visible ?? true;
  return out;
}

export function createGraphNodeRuntime<G extends symbol>(
  methods?: Readonly<Partial<GraphNodeRuntime<G>>>,
): GraphNodeRuntime<G> {
  const out = createNodeRuntime(methods) as GraphNodeRuntime<G>;
  out.appearanceID = 0;
  out.boundsUsingLocalBoundsID = -1;
  out.boundsUsingLocalTransformID = -1;
  out.localBoundsID = 0;
  out.localBoundsUsingLocalBoundsID = -1;
  out.localTransformID = 0;
  out.localTransformUsingLocalTransformID = -1;
  out.worldBoundsUsingLocalBoundsID = -1;
  out.worldBoundsUsingWorldTransformID = -1;
  out.worldTransformID = 0;
  out.worldTransformUsingLocalTransformID = -1;
  out.worldTransformUsingParentTransformID = -1;
  out.canAddChild = methods?.canAddChild ?? defaultGraphNodeRuntimeCanAddChild;
  out.onChildrenChanged = methods?.onChildrenChanged ?? defaultGraphNodeRuntimeCallback;
  out.onChildrenOrderChanged = methods?.onChildrenOrderChanged ?? defaultGraphNodeRuntimeCallback;
  out.onParentChanged = methods?.onParentChanged ?? defaultGraphNodeRuntimeCallback;
  return out;
}

export function defaultGraphNodeRuntimeCallback<G extends symbol>(_target: GraphNode<G>): void {}
export function defaultGraphNodeRuntimeCanAddChild<G extends symbol>(
  _target: GraphNode<G>,
  _child: GraphNode<G>,
): boolean {
  return true;
}

export function getGraphNodeRuntime<G extends symbol>(source: Readonly<GraphNode<G>>): GraphNodeRuntime<G> {
  return getRuntime(source) as GraphNodeRuntime<G>;
}
