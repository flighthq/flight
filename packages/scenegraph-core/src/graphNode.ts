import { createNode, createRuntime, getRuntime } from '@flighthq/foundation';
import { createSignal } from '@flighthq/signals';
import type {
  GraphNode,
  GraphNodeData,
  GraphNodeDataFactory,
  GraphNodeRuntime,
  GraphNodeRuntimeFactory,
  GraphNodeSignals,
  GraphNodeTraits,
  MethodsOf,
  NodeRuntimeFactory,
  PartialNode,
} from '@flighthq/types';
import { EntityRuntimeKey } from '@flighthq/types';

import { invalidate } from './revision';

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
  out[EntityRuntimeKey]!.graph = graph;
  out.enabled = obj?.enabled ?? true;
  return out;
}

export function setEnabled<GraphKind extends symbol, Traits extends object>(
  source: GraphNode<GraphKind, Traits>,
  value: boolean,
): void {
  source.enabled = value;
  invalidate(source);
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
  out.signals = null;
  out.worldBoundsUsingLocalBoundsID = -1;
  out.worldBoundsUsingWorldTransformID = -1;
  out.worldTransformID = 0;
  out.worldTransformUsingLocalTransformID = -1;
  out.worldTransformUsingParentTransformID = -1;
  out.canAddChild = methods?.canAddChild ?? defaultGraphNodeRuntimeCanAddChild;
  return out;
}

export function createGraphNodeSignals(): GraphNodeSignals {
  return {
    onChildrenChanged: createSignal(),
    onChildrenOrderChanged: createSignal(),
    onParentChanged: createSignal(),
  };
}

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

export function getGraphNodeSignals<GraphKind extends symbol, Traits extends object>(
  source: GraphNode<GraphKind, Traits>,
): GraphNodeSignals {
  const runtime = getRuntime(source) as GraphNodeRuntime<GraphKind, Traits>;
  return (runtime.signals ??= createGraphNodeSignals());
}
