import type { SceneAnimationPath } from './SceneAnimationPath';
import type { SceneNode } from './SceneNode';

// The `targetRef` an AnimationChannel carries when it is bound to a 3D SceneNode: which node and which
// transform component (Translation / Rotation / Scale) the channel's sampled value drives.
// applyAnimationClipToScene (in @flighthq/scene) reads this; the animation core never interprets it.
export interface SceneAnimationTarget {
  node: SceneNode;
  path: SceneAnimationPath;
}
