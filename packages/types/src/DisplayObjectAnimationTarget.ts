import type { DisplayObject } from './DisplayObject';
import type { DisplayObjectAnimationPath } from './DisplayObjectAnimationPath';

// The targetRef carried by a 2D display animation channel. The animation core remains target-free;
// applyAnimationClipToDisplayObject in @flighthq/displayobject owns interpretation of this descriptor.
export interface DisplayObjectAnimationTarget {
  node: DisplayObject;
  path: DisplayObjectAnimationPath;
}
