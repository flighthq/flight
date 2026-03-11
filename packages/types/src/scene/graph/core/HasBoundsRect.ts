import type { Node } from '../../../core';
import type { Rectangle } from '../../../geometry/Rectangle';

export type HasBoundsRect = object;

export interface HasBoundsRectRuntime {
  boundsRect: Rectangle | null;
  computeLocalBoundsRect: (out: Rectangle, source: Readonly<Node>) => void;
  localBoundsRect: Rectangle | null;
  worldBoundsRect: Rectangle | null;
}
