import type { DisplayObject } from '@flighthq/types';
import { DirtyFlags } from '@flighthq/types';

import { getDerivedState } from './derived';

/**
 * Calling `invalidate()` signals that the current object has changed and
 * should be redrawn the next time it is eligible to be rendered.
 */
export function invalidate(target: DisplayObject, flags: DirtyFlags = DirtyFlags.Render): void {
  const targetState = getDerivedState(target);
  if ((targetState.dirtyFlags & flags) === flags) return;

  targetState.dirtyFlags |= flags;

  if ((flags & DirtyFlags.Transform) !== 0) {
    // If transform changed, transformed bounds must also be updated
    targetState.dirtyFlags |= DirtyFlags.TransformedBounds;
    targetState.localTransformID++;
  }

  if ((flags & DirtyFlags.Bounds) !== 0) {
    // Changing local bounds also requires transformed bounds update
    targetState.dirtyFlags |= DirtyFlags.TransformedBounds;
    targetState.localBoundsID++;
  }
}
