import type { Matrix3x2, Rectangle } from '../geometry';
import type { Filter } from '../materials';
import type {
  GraphNode,
  GraphNodeData,
  GraphNodeRuntime,
  HasAppearance,
  HasBoundsRect,
  HasBoundsRectRuntime,
  HasTransform2D,
  HasTransform2DRuntime,
} from '../scene-graph-core';

export type DisplayObject = GraphNode<typeof DisplayGraph, DisplayObjectTraits> & DisplayObjectTraits;

export interface DisplayObjectTraits extends HasAppearance, HasBoundsRect, HasTransform2D {
  cacheAsBitmap: boolean;
  cacheAsBitmapMatrix: Matrix3x2 | null;
  data: DisplayObjectData | null;
  filters: Filter[] | null;
  mask: DisplayObject | null;
  opaqueBackground: number | null;
  scale9Grid: Rectangle | null;
  scrollRect: Rectangle | null;
}

export interface DisplayObjectData extends GraphNodeData {}

export const DisplayObjectKind: unique symbol = Symbol('DisplayObject');

export const DisplayGraph = Symbol('DisplayGraph');

export type DisplayObjectRuntime = GraphNodeRuntime<typeof DisplayGraph, DisplayObjectTraits> &
  HasTransform2DRuntime &
  HasBoundsRectRuntime;
