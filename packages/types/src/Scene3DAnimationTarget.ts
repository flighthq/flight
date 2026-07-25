import type { Node3D } from './Node3D';
import type { Scene3DAnimationPath } from './Scene3DAnimationPath';

// The `targetRef` an AnimationChannel carries when it is bound to a 3D Node3D: which node and which
// sink (Translation / Rotation / Scale transform component, or the mesh's morph-target Weights array)
// the channel's sampled value drives. A `Weights` target's `node` is the Mesh whose weight array the
// channel fills. applyAnimationClipToScene3D (in @flighthq/scene3d) reads this; the animation core never
// interprets it.
export interface Scene3DAnimationTarget {
  node: Node3D;
  path: Scene3DAnimationPath;
}
