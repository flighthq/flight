import type { Node2D } from './Node2D';
import type { Node2DAnimationPath } from './Node2DAnimationPath';

// The targetRef carried by a 2D display animation channel. The animation core remains target-free;
// applyAnimationClipToNode2D in @flighthq/scene2d owns interpretation of this descriptor.
export interface Node2DAnimationTarget {
  node: Node2D;
  path: Node2DAnimationPath;
}
