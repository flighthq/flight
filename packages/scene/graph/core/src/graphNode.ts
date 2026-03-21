import type { NodeDataFactory, NodeRuntimeFactory } from '@flighthq/core';
import { createNode, createRuntime, getRuntime } from '@flighthq/core';
import type {
  GraphNode,
  GraphNodeData,
  GraphNodeRuntime,
  GraphNodeTraits,
  MethodsOf,
  PartialNode,
} from '@flighthq/types';
import { RuntimeKey } from '@flighthq/types';

export type GraphNodeDataFactory<Data extends GraphNodeData> = NodeDataFactory<Data>;
export type GraphNodeRuntimeFactory<
  GraphKind extends symbol,
  Traits extends object,
  Runtime extends GraphNodeRuntime<GraphKind, Traits>,
> = NodeRuntimeFactory<Runtime>;

export function createGraphNode<
  GraphKind extends symbol,
  Traits extends object = GraphNodeTraits,
  Data extends GraphNodeData = GraphNodeData,
  Runtime extends GraphNodeRuntime<GraphKind, Traits> = GraphNodeRuntime<GraphKind, Traits>,
>(
  graph: GraphKind,
  nodeKind: symbol,
  obj?: Readonly<PartialNode<GraphNode<GraphKind, Traits>>>,
  createData?: GraphNodeDataFactory<Data>,
  createRuntime?: GraphNodeRuntimeFactory<GraphKind, Traits, Runtime>,
): GraphNode<GraphKind, Traits> & Traits {
  const out = createNode(
    nodeKind,
    obj,
    createData,
    createRuntime ?? (createGraphNodeRuntime as NodeRuntimeFactory<Runtime>),
  ) as GraphNode<GraphKind, Traits> & Traits;
  out[RuntimeKey]!.graph = graph;
  out.visible = obj?.visible ?? true;
  return out;
}

export function createGraphNodeRuntime<GraphKind extends symbol, Traits extends object>(
  methods?: Readonly<Partial<MethodsOf<GraphNodeRuntime<GraphKind, Traits>>>>,
): GraphNodeRuntime<GraphKind, Traits> {
  const out = createRuntime() as GraphNodeRuntime<GraphKind, Traits>;
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

export function defaultGraphNodeRuntimeCallback<GraphKind extends symbol, Traits extends object>(
  _target: GraphNode<GraphKind, Traits>,
): void {}
export function defaultGraphNodeRuntimeCanAddChild<GraphKind extends symbol, Traits extends object>(
  _target: GraphNode<GraphKind, Traits>,
  _child: GraphNode<GraphKind, Traits>,
): boolean {
  return true;
}

export function getGraphNodeRuntime<GraphKind extends symbol, Traits extends object>(
  source: Readonly<GraphNode<GraphKind, Traits>>,
): Readonly<GraphNodeRuntime<GraphKind, Traits>> {
  return getRuntime(source) as GraphNodeRuntime<GraphKind, Traits>;
}
