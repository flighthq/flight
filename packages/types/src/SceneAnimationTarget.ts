import type { SceneAnimationPath } from './SceneAnimationPath';
import type { SceneNode } from './SceneNode';

// The `targetRef` an AnimationChannel carries when it is bound to a 3D SceneNode: which node and which
// sink (Translation / Rotation / Scale transform component, or the mesh's morph-target Weights array)
// the channel's sampled value drives. A `Weights` target's `node` is the Mesh whose weight array the
// channel fills. applyAnimationClipToScene (in @flighthq/scene) reads this; the animation core never
// interprets it.
export interface SceneAnimationTarget {
  node: SceneNode;
  path: SceneAnimationPath;
}
