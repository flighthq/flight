import { createNodeRuntime, getEntityRuntime } from '@flighthq/entity';
import { createSignal } from '@flighthq/signals';
import type {
  MethodsOf,
  PartialNode,
  RenderNodeAdapter,
  SceneHierarchyNode,
  SceneNode,
  SceneNodeData,
  SceneNodeDataFactory,
  SceneNodeRuntime,
  SceneNodeRuntimeFactory,
  SceneNodeTraits,
  SceneSignals,
} from '@flighthq/types';
import { EntityRuntimeKey } from '@flighthq/types';

import { invalidateSceneNode } from './revision';

export function createSceneNode<
  SceneKind extends symbol,
  Traits extends object = SceneNodeTraits,
  Data extends SceneNodeData = SceneNodeData,
  Runtime extends SceneNodeRuntime<SceneKind, Traits> = SceneNodeRuntime<SceneKind, Traits>,
>(
  graph: SceneKind,
  nodeKind: symbol,
  obj?: Readonly<PartialNode<SceneNode<SceneKind, Traits>>>,
  createData?: SceneNodeDataFactory<Data>,
  createSceneNodeRuntimeFactory?: SceneNodeRuntimeFactory<Runtime>,
): SceneNode<SceneKind, Traits> & Traits {
  const runtimeFactory =
    createSceneNodeRuntimeFactory ?? (createSceneNodeRuntime as unknown as SceneNodeRuntimeFactory<Runtime>);
  const out = {
    data: createData !== undefined ? createData(obj?.data as Partial<Data>) : null,
    name: obj?.name ?? null,
    kind: nodeKind,
    [EntityRuntimeKey]: runtimeFactory(),
  } as SceneNode<SceneKind, Traits> & Traits;
  out[EntityRuntimeKey]!.graph = graph;
  out.enabled = obj?.enabled ?? true;
  return out;
}

export function createSceneNodeRuntime<SceneKind extends symbol, Traits extends object>(
  methods?: Readonly<Partial<MethodsOf<SceneNodeRuntime<SceneKind, Traits>>>>,
): SceneNodeRuntime<SceneKind, Traits> {
  const out = createNodeRuntime() as SceneNodeRuntime<SceneKind, Traits>;
  out.appearanceID = 0;
  out.boundsUsingLocalBoundsID = -1;
  out.boundsUsingLocalTransformID = -1;
  out.canAddChild = methods?.canAddChild ?? defaultSceneNodeRuntimeCanAddChild;
  out.children = null;
  out.sceneSignals = createSceneSignals();
  out.resolver = null;
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

export function createSceneSignals(): SceneSignals {
  return {
    onChildAdded: createSignal(),
    onChildRemoved: createSignal(),
    onChildrenChanged: createSignal(),
    onChildrenOrderChanged: createSignal(),
    onParentChanged: createSignal(),
  };
}

export function defaultSceneNodeRuntimeCanAddChild<SceneKind extends symbol, Traits extends object>(
  _target: SceneHierarchyNode<SceneKind, Traits>,
  _child: SceneHierarchyNode<SceneKind, Traits>,
): boolean {
  return true;
}

export function getSceneNodeRuntime<SceneKind extends symbol, Traits extends object>(
  source: Readonly<SceneNode<SceneKind, Traits>>,
): Readonly<SceneNodeRuntime<SceneKind, Traits>> {
  return getEntityRuntime(source) as SceneNodeRuntime<SceneKind, Traits>;
}

export function getSceneSignals<SceneKind extends symbol, Traits extends object>(
  source: SceneNode<SceneKind, Traits>,
): SceneSignals {
  return (getEntityRuntime(source) as SceneNodeRuntime<SceneKind, Traits>).sceneSignals;
}

export function setSceneNodeAdapter<SceneKind extends symbol, Traits extends object>(
  target: SceneNode<SceneKind, Traits>,
  adapter: RenderNodeAdapter | null,
): void {
  (getEntityRuntime(target) as SceneNodeRuntime<SceneKind, Traits>).resolver = adapter;
}

export function setSceneNodeEnabled<SceneKind extends symbol, Traits extends object>(
  target: SceneNode<SceneKind, Traits>,
  value: boolean,
): void {
  target.enabled = value;
  invalidateSceneNode(target);
}
