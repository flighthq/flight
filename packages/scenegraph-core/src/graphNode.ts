import { createNode, createNodeRuntime, getEntityRuntime } from '@flighthq/entity';
import { createSignal } from '@flighthq/signals';
import type {
  GraphHierarchyNode,
  GraphNode,
  GraphNodeData,
  GraphNodeDataFactory,
  GraphNodeRuntime,
  GraphNodeRuntimeFactory,
  GraphNodeTraits,
  GraphSignals,
  MethodsOf,
  NodeRuntimeFactory,
  PartialNode,
} from '@flighthq/types';
import { EntityRuntimeKey } from '@flighthq/types';

import { invalidateGraphNode } from './revision';

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
  createGraphNodeRuntimeFactory?: GraphNodeRuntimeFactory<GraphKind, Traits, Runtime>,
): GraphNode<GraphKind, Traits> & Traits {
  const out = createNode(
    nodeKind,
    obj,
    createData,
    createGraphNodeRuntimeFactory ?? (createGraphNodeRuntime as NodeRuntimeFactory<Runtime>),
  ) as GraphNode<GraphKind, Traits> & Traits;
  out[EntityRuntimeKey]!.graph = graph;
  out.enabled = obj?.enabled ?? true;
  return out;
}

export function createGraphNodeRuntime<GraphKind extends symbol, Traits extends object>(
  methods?: Readonly<Partial<MethodsOf<GraphNodeRuntime<GraphKind, Traits>>>>,
): GraphNodeRuntime<GraphKind, Traits> {
  const out = createNodeRuntime() as GraphNodeRuntime<GraphKind, Traits>;
  out.appearanceID = 0;
  out.boundsUsingLocalBoundsID = -1;
  out.boundsUsingLocalTransformID = -1;
  out.canAddChild = methods?.canAddChild ?? defaultGraphNodeRuntimeCanAddChild;
  out.children = null;
  out.graphSignals = createGraphSignals();
  out.imageCache = null;
  out.interactionSignals = null;
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
  return out;
}

export function createGraphSignals(): GraphSignals {
  return {
    onChildAdded: createSignal(),
    onChildRemoved: createSignal(),
    onChildrenChanged: createSignal(),
    onChildrenOrderChanged: createSignal(),
    onParentChanged: createSignal(),
  };
}

export function defaultGraphNodeRuntimeCanAddChild<GraphKind extends symbol, Traits extends object>(
  _target: GraphHierarchyNode<GraphKind, Traits>,
  _child: GraphHierarchyNode<GraphKind, Traits>,
): boolean {
  return true;
}

export function getGraphNodeRuntime<GraphKind extends symbol, Traits extends object>(
  source: Readonly<GraphNode<GraphKind, Traits>>,
): Readonly<GraphNodeRuntime<GraphKind, Traits>> {
  return getEntityRuntime(source) as GraphNodeRuntime<GraphKind, Traits>;
}

export function getGraphSignals<GraphKind extends symbol, Traits extends object>(
  source: GraphNode<GraphKind, Traits>,
): GraphSignals {
  return (getEntityRuntime(source) as GraphNodeRuntime<GraphKind, Traits>).graphSignals;
}

export function setGraphNodeEnabled<GraphKind extends symbol, Traits extends object>(
  target: GraphNode<GraphKind, Traits>,
  value: boolean,
): void {
  target.enabled = value;
  invalidateGraphNode(target);
}
