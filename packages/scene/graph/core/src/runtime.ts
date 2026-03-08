import type { SceneNode, SceneNodeRuntime, Transform2DRuntime } from '@flighthq/types';
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

export function getRuntime<K extends symbol>(source: SceneNode<K>): SceneNodeRuntime<K> {
  return source[SceneNodeRuntimeKey]!;
}

export function defaultSceneNodeRuntimeCallback<K extends symbol>(_target: SceneNode<K>): void {}
export function defaultSceneNodeRuntimeCanAddChild<K extends symbol>(
  _target: SceneNode<K>,
  _child: SceneNode<K>,
): boolean {
  return true;
}
