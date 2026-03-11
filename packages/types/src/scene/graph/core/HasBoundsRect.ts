import type { Rectangle } from '../../../geometry/Rectangle';
import type { GraphNode } from './GraphNode';

export type HasBoundsRect = object;

export interface HasBoundsRectRuntime {
  boundsRect: Rectangle | null;
  computeLocalBoundsRect: (out: Rectangle, source: Readonly<GraphNode>) => void;
  localBoundsRect: Rectangle | null;
  worldBoundsRect: Rectangle | null;
}
