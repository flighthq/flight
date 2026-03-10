import type { Rectangle } from '../../../geometry/Rectangle';
import type { GraphNode } from './GraphNode';
import type { GraphNodeRuntime } from './GraphNodeRuntime';
import type { NodeRuntimeKey } from './NodeRuntime';

export interface HasBoundsRect<G extends symbol> extends GraphNode<G> {
  [NodeRuntimeKey]: HasBoundsRectRuntime<G> | undefined;
}

export interface HasBoundsRectRuntime<G extends symbol> extends GraphNodeRuntime<G> {
  boundsRect: Rectangle | null;
  computeLocalBoundsRect: (out: Rectangle, source: Readonly<GraphNode<G> & HasBoundsRect<G>>) => void;
  localBoundsRect: Rectangle | null;
  worldBoundsRect: Rectangle | null;
}
