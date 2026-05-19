import type { Entity, Runtime } from '../foundation';
import type { Rectangle } from '../geometry/Rectangle';
import type { GraphNode } from './GraphNode';

export interface HasBoundsRect extends Entity {}

export interface HasBoundsRectRuntime extends Runtime {
  boundsRect: Rectangle | null;
  computeLocalBoundsRect: (out: Rectangle, source: Readonly<GraphNode>) => void;
  localBoundsRect: Rectangle | null;
  worldBoundsRect: Rectangle | null;
}
