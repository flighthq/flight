import type { SceneNodeRuntime, SceneNodeRuntimeKey } from './SceneNodeRuntime';

export interface SceneNode<K extends symbol> {
  readonly children: SceneNode<K>[] | null;
  data: SceneNodeData | null;
  name: string | null;
  readonly parent: SceneNode<K> | null;
  readonly root: SceneNode<K> | null;
  visible: boolean;

  [SceneNodeRuntimeKey]: SceneNodeRuntime<K> | undefined;
}

export type SceneNodeData = object;

export const SceneNodeKind: unique symbol = Symbol('SceneNode');
