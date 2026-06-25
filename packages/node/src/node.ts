import { createEntityRuntime, getEntityRuntime } from '@flighthq/entity';
import { clearSignal, createSignal } from '@flighthq/signals';
import type {
  Kind,
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

import { removeNodeChild } from './hierarchy';
import { invalidateNode } from './revision';

export function createNode<
  Traits extends object = NodeTraits,
  Data extends NodeData = NodeData,
  Runtime extends NodeRuntime<Traits> = NodeRuntime<Traits>,
>(
  nodeKind: Kind,
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

/**
 * Detaches `target` from its parent, recursively removes all descendants, and clears the
 * `nodeSignals` and `interactionSignals` registries so the node becomes eligible for garbage
 * collection. After disposal, `target` must not be added to a graph.
 *
 * Nodes in this package own no non-GC resources (GPU textures, native handles); therefore no
 * `destroyNode` counterpart exists at this tier. Higher-level packages that attach non-GC
 * resources (render proxies, GPU textures) should call `disposeNode` first and then release those
 * resources themselves.
 */
export function disposeNode<Traits extends object = NodeTraits>(target: Node<Traits>): void {
  const runtime = getEntityRuntime(target) as NodeRuntime<Traits>;

  // Detach from parent first so the parent's children list stays consistent.
  const parent = runtime.parent as Node<Traits> | null;
  if (parent !== null) {
    removeNodeChild(parent, target);
  }

  // Recursively dispose children bottom-up (snapshot the array before mutating).
  const children = runtime.children;
  if (children !== null) {
    // Snapshot to avoid mutation during iteration.
    const snapshot = children.slice() as Node<Traits>[];
    for (let i = 0; i < snapshot.length; i++) {
      disposeNode(snapshot[i]);
    }
    runtime.children = null;
  }

  // Clear all signal listeners so they cannot fire after disposal.
  const nodeSignals = runtime.nodeSignals;
  if (nodeSignals !== null) {
    clearSignal(nodeSignals.onChildAdded);
    clearSignal(nodeSignals.onChildRemoved);
    clearSignal(nodeSignals.onChildrenChanged);
    clearSignal(nodeSignals.onChildrenOrderChanged);
    clearSignal(nodeSignals.onParentChanged);
    runtime.nodeSignals = null;
  }

  const interactionSignals = runtime.interactionSignals;
  if (interactionSignals !== null) {
    // InteractionSignals fields are owned by the interaction package; we can only clear our
    // reference so the owning package's signals are released via GC.
    runtime.interactionSignals = null;
  }
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
