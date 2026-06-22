import { createEntityRuntime, getEntityRuntime } from '@flighthq/entity';
import { createSignal } from '@flighthq/signals';
import type {
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
  Traits extends object = NodeTraits,
  Data extends NodeData = NodeData,
  Runtime extends NodeRuntime<Traits> = NodeRuntime<Traits>,
>(
  nodeKind: symbol,
  obj?: Readonly<PartialNode<Node<Traits>>>,
  createData?: NodeDataFactory<Data>,
  createNodeRuntimeFactory?: NodeRuntimeFactory<Runtime>,
): Node<Traits> & Traits {
  const runtimeFactory = createNodeRuntimeFactory ?? (createNodeRuntime as unknown as NodeRuntimeFactory<Runtime>);
  const out = {
    data: createData !== undefined ? createData(obj?.data as Partial<Data>) : null,
    name: obj?.name ?? null,
    kind: nodeKind,
    [EntityRuntimeKey]: runtimeFactory(),
  } as Node<Traits> & Traits;
  out.enabled = obj?.enabled ?? true;
  return out;
}

export function createNodeRuntime<Traits extends object = NodeTraits>(
  methods?: Readonly<Partial<MethodsOf<NodeRuntime<Traits>>>>,
): NodeRuntime<Traits> {
  const out = createEntityRuntime() as NodeRuntime<Traits>;
  out.appearanceId = 0;
  out.boundsUsingLocalBoundsId = -1;
  out.boundsUsingLocalTransformId = -1;
  out.canAddChild = methods?.canAddChild ?? defaultNodeRuntimeCanAddChild;
  out.children = null;
  out.nodeSignals = null;
  out.interactionSignals = null;
  out.localBoundsId = 0;
  out.localBoundsUsingLocalBoundsId = -1;
  out.localContentId = 0;
  out.localTransformId = 0;
  out.localTransformUsingLocalTransformId = -1;
  out.parent = null;
  out.worldBoundsUsingLocalBoundsId = -1;
  out.worldBoundsUsingWorldTransformId = -1;
  out.worldTransformId = 0;
  out.worldTransformUsingLocalTransformId = -1;
  out.worldTransformUsingParentTransformId = -1;
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

export function defaultNodeRuntimeCanAddChild<Traits extends object>(
  _target: Node<Traits>,
  _child: Node<Traits>,
): boolean {
  return true;
}

export function enableNodeSignals<Traits extends object = NodeTraits>(source: Node<Traits>): NodeSignals {
  const runtime = getEntityRuntime(source) as NodeRuntime<Traits>;
  return (runtime.nodeSignals ??= createNodeSignals());
}

export function getNodeRuntime<Traits extends object = NodeTraits>(
  source: Readonly<Node<Traits>>,
): Readonly<NodeRuntime<Traits>> {
  return getEntityRuntime(source) as NodeRuntime<Traits>;
}

export function getNodeSignals<Traits extends object = NodeTraits>(source: Node<Traits>): NodeSignals | null {
  return (getEntityRuntime(source) as NodeRuntime<Traits>).nodeSignals;
}

export function setNodeEnabled<Traits extends object = NodeTraits>(target: Node<Traits>, value: boolean): void {
  target.enabled = value;
  invalidateNode(target);
}
