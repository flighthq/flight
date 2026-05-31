import type { BitmapFilter } from './Filter';
import type {
  GraphNode,
  GraphNodeData,
  GraphNodeDataFactory,
  GraphNodeRuntime,
  GraphNodeRuntimeFactory,
} from './GraphNode';
import type { HasAppearance } from './HasAppearance';
import type { HasBoundsRect, HasBoundsRectRuntime } from './HasBoundsRect';
import type { HasGraphHierarchy } from './HasGraphHierarchy';
import type { HasTransform2D, HasTransform2DRuntime } from './HasTransform2D';
import type { Rectangle } from './Rectangle';

export type DisplayObject = GraphNode<typeof DisplayGraph, DisplayObjectTraits> & DisplayObjectTraits;

export interface DisplayObjectTraits extends HasAppearance, HasBoundsRect, HasGraphHierarchy, HasTransform2D {
  data: DisplayObjectData | null;
  filters: BitmapFilter[] | null;
  mask: DisplayObject | null;
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
