import type { Entity, EntityRuntime } from './Entity';
import type { GraphNode, GraphNodeTraits, NullGraph } from './GraphNode';
import type { HasTransform2D } from './HasTransform2D';
import type { Rectangle } from './Rectangle';

export interface HasBoundsRect extends Entity {}

export interface HasBoundsRectRuntime extends EntityRuntime {
  boundsRect: Rectangle | null;
  computeLocalBoundsRect: (out: Rectangle, source: Readonly<GraphBoundsNode<symbol, object>>) => void;
  localBoundsRect: Rectangle | null;
  worldBoundsRect: Rectangle | null;
}

export type GraphBoundsNode<
  GraphKind extends symbol = typeof NullGraph,
  Traits extends object = GraphNodeTraits,
> = GraphNode<GraphKind, Traits> & HasBoundsRect;

export type GraphSpatial2DNode<
  GraphKind extends symbol = typeof NullGraph,
  Traits extends object = GraphNodeTraits,
> = GraphNode<GraphKind, Traits> & HasBoundsRect & HasTransform2D;
