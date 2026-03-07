import type { SceneNode } from './SceneNode';

export interface SceneNodeRuntime<K extends symbol> {
  appearanceID: number;
  localTransformID: number;
  nodeKind: K;

  canAddChild: (target: SceneNode<K>, child: SceneNode<K>) => boolean;
  onChildrenChanged: (target: SceneNode<K>) => void;
  onChildrenOrderChanged: (target: SceneNode<K>) => void;
  onParentChanged: (target: SceneNode<K>) => void;
}

export const SceneNodeRuntimeKey: unique symbol = Symbol('SceneNodeRuntime');
