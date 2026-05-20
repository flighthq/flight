import type { Filter } from './Filter';
import type {
  GraphNode,
  GraphNodeData,
  GraphNodeDataFactory,
  GraphNodeRuntime,
  GraphNodeRuntimeFactory,
} from './GraphNode';
import type { HasAppearance } from './HasAppearance';
import type { HasBoundsRect, HasBoundsRectRuntime } from './HasBoundsRect';
import type { HasTransform2D, HasTransform2DRuntime } from './HasTransform2D';
import type { Matrix3x2 } from './Matrix3x2';
import type { Rectangle } from './Rectangle';

export type DisplayObject = GraphNode<typeof DisplayGraph, DisplayObjectTraits> & DisplayObjectTraits;

export interface DisplayObjectTraits extends HasAppearance, HasBoundsRect, HasTransform2D {
  cacheAsBitmap: boolean;
  cacheAsBitmapMatrix: Matrix3x2 | null;
  data: DisplayObjectData | null;
  filters: Filter[] | null;
  mask: DisplayObject | null;
  opaqueBackground: number | null;
  scrollRect: Rectangle | null;
}

export interface DisplayObjectData extends GraphNodeData {}

export const DisplayObjectKind: unique symbol = Symbol('DisplayObject');

export const DisplayGraph = Symbol('DisplayGraph');

export type DisplayObjectRuntime = GraphNodeRuntime<typeof DisplayGraph, DisplayObjectTraits> &
  HasTransform2DRuntime &
  HasBoundsRectRuntime;

export type DisplayGraphNodeDataFactory = GraphNodeDataFactory<DisplayObjectData>;
export type DisplayGraphNodeRuntimeFactory<R extends DisplayObjectRuntime> = GraphNodeRuntimeFactory<
  typeof DisplayGraph,
  DisplayObjectTraits,
  R
>;
