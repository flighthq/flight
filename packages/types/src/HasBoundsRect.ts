import type { Entity } from './Entity';
import type { GraphNode } from './GraphNode';
import type { Rectangle } from './Rectangle';
import type { Runtime } from './Runtime';

export interface HasBoundsRect extends Entity {}

export interface HasBoundsRectRuntime extends Runtime {
  boundsRect: Rectangle | null;
  computeLocalBoundsRect: (out: Rectangle, source: Readonly<GraphNode>) => void;
  localBoundsRect: Rectangle | null;
  worldBoundsRect: Rectangle | null;
}
