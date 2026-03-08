import type { Rectangle } from '../../../geometry/Rectangle';
import type { SceneNode } from './SceneNode';
import type { SceneNodeRuntime, SceneNodeRuntimeKey } from './SceneNodeRuntime';

export interface HasBoundsRect<K extends symbol> extends SceneNode<K> {
  [SceneNodeRuntimeKey]: BoundsRectRuntime<K> | undefined;
}

export interface BoundsRectRuntime<K extends symbol> extends SceneNodeRuntime<K> {
  boundsRect: Rectangle | null;
  boundsRectUsingLocalBoundsID: number;
  boundsRectUsingLocalTransformID: number;
  computeLocalBounds: (out: Rectangle, source: SceneNode<K>) => void;
  localBoundsRect: Rectangle | null;
  localBoundsRectUsingLocalBoundsID: number;
  localBoundsID: number;
  worldBoundsRect: Rectangle | null;
  worldBoundsRectUsingLocalBoundsID: number;
  worldBoundsRectUsingWorldTransformID: number;
}
