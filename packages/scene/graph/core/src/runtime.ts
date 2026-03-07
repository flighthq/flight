import type { SceneNode, SceneNodeRuntime } from '@flighthq/types';
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
