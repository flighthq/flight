import type { Entity, EntityRuntime } from './Entity';
import type { GraphNode } from './GraphNode';
import type { Rectangle } from './Rectangle';

export interface HasBoundsRect extends Entity {}

export interface HasBoundsRectRuntime extends EntityRuntime {
  boundsRect: Rectangle | null;
  computeLocalBoundsRect: (out: Rectangle, source: Readonly<GraphNode>) => void;
  localBoundsRect: Rectangle | null;
  worldBoundsRect: Rectangle | null;
}
