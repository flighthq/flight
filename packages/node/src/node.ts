import { createEntityRuntime, getEntityRuntime } from '@flighthq/entity';
import { createSignal } from '@flighthq/signals';
import type {
  HierarchyNode,
  MethodsOf,
  Node,
  NodeData,
  NodeDataFactory,
  NodeRuntime,
  NodeRuntimeFactory,
  NodeSignals,
  NodeTraits,
  PartialNode,
} from '@flighthq/types';
import { EntityRuntimeKey } from '@flighthq/types';

import { invalidateNode } from './revision';

export function createNode<
  Kind extends symbol,
  Traits extends object = NodeTraits,
  Data extends NodeData = NodeData,
  Runtime extends NodeRuntime<Kind, Traits> = NodeRuntime<Kind, Traits>,
>(
  sceneKind: Kind,
  nodeKind: symbol,
  obj?: Readonly<PartialNode<Node<Kind, Traits>>>,
  createData?: NodeDataFactory<Data>,
  createNodeRuntimeFactory?: NodeRuntimeFactory<Runtime>,
): Node<Kind, Traits> & Traits {
  const runtimeFactory = createNodeRuntimeFactory ?? (createNodeRuntime as unknown as NodeRuntimeFactory<Runtime>);
  const out = {
    data: createData !== undefined ? createData(obj?.data as Partial<Data>) : null,
    name: obj?.name ?? null,
    kind: nodeKind,
    [EntityRuntimeKey]: runtimeFactory(),
  } as Node<Kind, Traits> & Traits;
  out[EntityRuntimeKey]!.graph = sceneKind;
  out.enabled = obj?.enabled ?? true;
  return out;
}

export function createNodeRuntime<Kind extends symbol, Traits extends object>(
  methods?: Readonly<Partial<MethodsOf<NodeRuntime<Kind, Traits>>>>,
): NodeRuntime<Kind, Traits> {
  const out = createEntityRuntime() as NodeRuntime<Kind, Traits>;
  out.appearanceID = 0;
  out.boundsUsingLocalBoundsID = -1;
  out.boundsUsingLocalTransformID = -1;
  out.canAddChild = methods?.canAddChild ?? defaultNodeRuntimeCanAddChild;
  out.children = null;
  out.nodeSignals = createNodeSignals();
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

export function createNodeSignals(): NodeSignals {
  return {
    onChildAdded: createSignal(),
    onChildRemoved: createSignal(),
    onChildrenChanged: createSignal(),
    onChildrenOrderChanged: createSignal(),
    onParentChanged: createSignal(),
  };
}

export function defaultNodeRuntimeCanAddChild<Kind extends symbol, Traits extends object>(
  _target: HierarchyNode<Kind, Traits>,
  _child: HierarchyNode<Kind, Traits>,
): boolean {
  return true;
}

export function getNodeRuntime<Kind extends symbol, Traits extends object>(
  source: Readonly<Node<Kind, Traits>>,
): Readonly<NodeRuntime<Kind, Traits>> {
  return getEntityRuntime(source) as NodeRuntime<Kind, Traits>;
}

export function getNodeSignals<Kind extends symbol, Traits extends object>(source: Node<Kind, Traits>): NodeSignals {
  return (getEntityRuntime(source) as NodeRuntime<Kind, Traits>).nodeSignals;
}

export function setNodeEnabled<Kind extends symbol, Traits extends object>(
  target: Node<Kind, Traits>,
  value: boolean,
): void {
  target.enabled = value;
  invalidateNode(target);
}
