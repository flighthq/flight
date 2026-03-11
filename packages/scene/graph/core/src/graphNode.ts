import type { NodeDataFactory, NodeRuntimeFactory } from '@flighthq/core';
import { createNode, createNodeRuntime, getNodeRuntime } from '@flighthq/core';
import type { GraphNode, GraphNodeData, GraphNodeRuntime, MethodsOf, PartialNode } from '@flighthq/types';
import { NodeRuntimeKey } from '@flighthq/types';

export type GraphNodeDataFactory<D extends GraphNodeData> = NodeDataFactory<D>;
export type GraphNodeRuntimeFactory<G extends symbol, R extends GraphNodeRuntime<G>> = NodeRuntimeFactory<R>;

export function createGraphNode<G extends symbol, D extends GraphNodeData, R extends GraphNodeRuntime<G>>(
  graph: G,
  nodeKind: symbol,
  obj?: Readonly<PartialNode<GraphNode<G>>>,
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
  out.visible = obj?.visible ?? true;
  return out;
}

export function createGraphNodeRuntime<G extends symbol>(
  methods?: Readonly<Partial<MethodsOf<GraphNodeRuntime<G>>>>,
): GraphNodeRuntime<G> {
  const out = createNodeRuntime(methods) as GraphNodeRuntime<G>;
  out.appearanceID = 0;
  out.boundsUsingLocalBoundsID = -1;
  out.boundsUsingLocalTransformID = -1;
  out.children = null;
  out.localBoundsID = 0;
  out.localBoundsUsingLocalBoundsID = -1;
  out.localTransformID = 0;
  out.localTransformUsingLocalTransformID = -1;
  out.parent = null;
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

export function getGraphNodeRuntime<G extends symbol>(source: Readonly<GraphNode<G>>): Readonly<GraphNodeRuntime<G>> {
  return getNodeRuntime(source) as GraphNodeRuntime<G>;
}
