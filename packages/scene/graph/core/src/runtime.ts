import type { BoundsRectRuntime, Rectangle, SceneNode, SceneNodeRuntime, Transform2DRuntime } from '@flighthq/types';
import { SceneNodeRuntimeKey } from '@flighthq/types';

export function createSceneNodeRuntime<K extends symbol>(
  nodeKind: K,
  methods?: Partial<SceneNodeRuntime<K>>,
): SceneNodeRuntime<K> {
  return {
    appearanceID: 0,
    localTransformID: 0,
    nodeKind: nodeKind,

    canAddChild: methods?.canAddChild ?? defaultSceneNodeRuntimeCanAddChild,
    onChildrenChanged: methods?.onChildrenChanged ?? defaultSceneNodeRuntimeCallback,
    onChildrenOrderChanged: methods?.onChildrenOrderChanged ?? defaultSceneNodeRuntimeCallback,
    onParentChanged: methods?.onParentChanged ?? defaultSceneNodeRuntimeCallback,
  };
}

export function createTransform2DRuntime<K extends symbol>(
  nodeKind: K,
  methods?: Partial<Transform2DRuntime<K>>,
): Transform2DRuntime<K> {
  const out = createSceneNodeRuntime(nodeKind, methods) as Transform2DRuntime<K>;
  out.localTransform = null;
  out.localTransformUsingLocalTransformID = -1;
  out.rotationAngle = 0;
  out.rotationCosine = 1;
  out.rotationSine = 0;
  out.worldTransform = null;
  out.worldTransformID = 0;
  out.worldTransformUsingLocalTransformID = -1;
  out.worldTransformUsingParentTransformID = -1;
  return out;
}

export function createBoundsAndTransform2DRuntime<K extends symbol>(
  nodeKind: K,
  methods?: Partial<BoundsRectRuntime<K> & Transform2DRuntime<K>>,
): BoundsRectRuntime<K> & Transform2DRuntime<K> {
  const out = createTransform2DRuntime(nodeKind, methods) as BoundsRectRuntime<K> & Transform2DRuntime<K>;
  out.boundsRectUsingLocalBoundsID = -1;
  out.boundsRectUsingLocalTransformID = -1;
  out.boundsRect = null;
  out.computeLocalBounds = methods?.computeLocalBounds ?? defaultComputeLocalBounds;
  out.localBoundsRect = null;
  out.localBoundsRectUsingLocalBoundsID = -1;
  out.localBoundsID = 0;
  out.worldBoundsRect = null;
  out.worldBoundsRectUsingLocalBoundsID = -1;
  out.worldBoundsRectUsingWorldTransformID = -1;
  return out;
}

export function defaultSceneNodeRuntimeCallback<K extends symbol>(_target: SceneNode<K>): void {}
export function defaultSceneNodeRuntimeCanAddChild<K extends symbol>(
  _target: SceneNode<K>,
  _child: SceneNode<K>,
): boolean {
  return true;
}

export function getRuntime<K extends symbol>(source: SceneNode<K>): SceneNodeRuntime<K> {
  return source[SceneNodeRuntimeKey]!;
}

function defaultComputeLocalBounds<K extends symbol>(_out: Rectangle, _source: SceneNode<K>): void {}
