import { allocateEntity, createEntityRuntime, finishEntity, getEntityRuntime } from '@flighthq/entity/contract';
import { clearSignal, createSignal } from '@flighthq/signals/contract';
import type {
  EntityConstruction,
  Kind,
  MethodsOf,
  Node,
  NodeData,
  NodeDataFactory,
  NodeRuntime,
  NodeRuntimeFactory,
  NodeSignals,
  NodeFields,
  PartialNode,
} from '@flighthq/types/contract';
import { EntityRuntimeKey } from '@flighthq/types/contract';

import { removeNodeChild } from './hierarchy.ts';
import { invalidateNode } from './revision.ts';

export function createNode<
  Fields extends object = NodeFields,
  Data extends NodeData = NodeData,
  Runtime extends NodeRuntime<Fields> = NodeRuntime<Fields>,
>(
  nodeKind: Kind,
  obj?: Readonly<PartialNode<Node<Fields>>>,
  createData?: NodeDataFactory<Data>,
  createNodeRuntimeFactory?: NodeRuntimeFactory<Runtime>,
): Node<Fields> & Fields {
  const out = allocateEntity<Node<Fields> & Fields>();
  initializeNode(out, nodeKind, obj, createData, createNodeRuntimeFactory);
  return finishEntity(out);
}

export function createNodeRuntime<Fields extends object = NodeFields>(
  methods?: Readonly<Partial<MethodsOf<NodeRuntime<Fields>>>>,
): NodeRuntime<Fields> {
  const out = createEntityRuntime() as NodeRuntime<Fields>;
  out.appearanceId = 0;
  out.boundsUsingLocalBoundsId = -1;
  out.boundsUsingLocalTransformId = -1;
  out.canAddChild = methods?.canAddChild ?? defaultNodeRuntimeCanAddChild;
  out.children = null;
  out.childrenId = 0;
  out.colorAdjustments = null;
  out.colorAdjustmentsUnsupported = false;
  out.nodeSignals = null;
  out.interactionSignals = null;
  out.interactionState = null;
  out.localBoundsId = 0;
  out.localBoundsUsingLocalBoundsId = -1;
  out.localContentId = 0;
  out.localTransformId = 0;
  out.localTransformUsingLocalTransformId = -1;
  out.parent = null;
  out.parentReferenceId = 0;
  out.resolvedColorMatrix = null;
  out.resolvedColorScaleBias = null;
  out.worldBoundsUsingLocalBoundsId = -1;
  out.worldBoundsUsingWorldTransformId = -1;
  out.worldTransformId = 0;
  out.worldTransformUsingLocalTransformId = -1;
  out.worldTransformUsingParentTransformId = -1;
  return out;
}

export function createNodeSignals(): NodeSignals {
  const out = allocateEntity<NodeSignals>();
  initializeNodeSignals(out);
  return finishEntity(out);
}

export function defaultNodeRuntimeCanAddChild<Fields extends object>(
  _target: Node<Fields>,
  _child: Node<Fields>,
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
export function disposeNode<Fields extends object = NodeFields>(target: Node<Fields>): void {
  const runtime = getEntityRuntime(target) as NodeRuntime<Fields>;

  // Detach from parent first so the parent's children list stays consistent.
  const parent = runtime.parent;
  if (parent !== null) {
    removeNodeChild(parent, target);
  }

  // Recursively dispose children bottom-up (snapshot the array before mutating).
  const children = runtime.children;
  if (children !== null) {
    // Snapshot to avoid mutation during iteration.
    const snapshot = children.slice();
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

  // Plain-data interaction settings owned by the interaction package; drop the reference for GC.
  runtime.interactionState = null;
}

export function enableNodeSignals<Fields extends object = NodeFields>(source: Node<Fields>): NodeSignals {
  const runtime = getEntityRuntime(source) as NodeRuntime<Fields>;
  return (runtime.nodeSignals ??= createNodeSignals());
}

export function getNodeRuntime<Fields extends object = NodeFields>(
  source: Readonly<Node<Fields>>,
): Readonly<NodeRuntime<Fields>> {
  return getEntityRuntime(source) as NodeRuntime<Fields>;
}

export function getNodeSignals<Fields extends object = NodeFields>(source: Node<Fields>): NodeSignals | null {
  return (getEntityRuntime(source) as NodeRuntime<Fields>).nodeSignals;
}

export function initializeNode<
  Fields extends object = NodeFields,
  Data extends NodeData = NodeData,
  Runtime extends NodeRuntime<Fields> = NodeRuntime<Fields>,
>(
  out: EntityConstruction<Node<Fields> & Fields>,
  nodeKind: Kind,
  obj?: Readonly<PartialNode<Node<Fields>>>,
  createData?: NodeDataFactory<Data>,
  createNodeRuntimeFactory?: NodeRuntimeFactory<Runtime>,
): void {
  const runtimeFactory = createNodeRuntimeFactory ?? (createNodeRuntime as unknown as NodeRuntimeFactory<Runtime>);
  const node = out as EntityConstruction<Node<Fields>>;
  (node as { [EntityRuntimeKey]?: unknown })[EntityRuntimeKey] = runtimeFactory();
  node.data = createData !== undefined ? createData(obj?.data as Partial<Data>) : null;
  node.name = obj?.name ?? null;
  node.kind = nodeKind;
  node.enabled = obj?.enabled ?? true;
}

export function initializeNodeSignals(out: EntityConstruction<NodeSignals>): void {
  out.onChildAdded = createSignal();
  out.onChildRemoved = createSignal();
  out.onChildrenChanged = createSignal();
  out.onChildrenOrderChanged = createSignal();
  out.onParentChanged = createSignal();
}

export function setNodeEnabled<Fields extends object = NodeFields>(target: Node<Fields>, value: boolean): void {
  target.enabled = value;
  invalidateNode(target);
}
