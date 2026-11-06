import type { Node3D } from './Node3D.ts';
import type { Scene3DAnimationPath } from './Scene3DAnimationPath.ts';

// The node and transform or morph sink driven by a bound 3D animation channel.
export interface Scene3DAnimationTarget {
  node: Node3D;
  path: Scene3DAnimationPath;
}
