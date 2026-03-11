import type { Matrix3x2, Rectangle } from '../../../geometry';
import type { BlendMode, ColorTransform, Filter, Shader } from '../../../materials';
import type { GraphNode, GraphNodeData, GraphNodeRuntime, HasTransform2D, HasTransform2DRuntime } from '../core';
import type { HasBoundsRect, HasBoundsRectRuntime } from '../core/HasBoundsRect';

export type DisplayObject = GraphNode<typeof DisplayGraph, DisplayObjectTraits> & DisplayObjectTraits;

export interface DisplayObjectTraits extends HasBoundsRect, HasTransform2D {
  alpha: number;
  blendMode: BlendMode;
  cacheAsBitmap: boolean;
  cacheAsBitmapMatrix: Matrix3x2 | null;
  colorTransform: ColorTransform | null;
  data: DisplayObjectData | null;
  filters: Filter[] | null;
  mask: DisplayObject | null;
  opaqueBackground: number | null;
  scale9Grid: Rectangle | null;
  scrollRect: Rectangle | null;
  shader: Shader | null;
  visible: boolean;
}

export interface DisplayObjectData extends GraphNodeData {}

export const DisplayObjectKind: unique symbol = Symbol('DisplayObject');

export const DisplayGraph = Symbol('DisplayGraph');

export type DisplayObjectRuntime = GraphNodeRuntime<typeof DisplayGraph, DisplayObjectTraits> &
  HasTransform2DRuntime &
  HasBoundsRectRuntime;
