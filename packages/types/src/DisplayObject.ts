import type { HasAppearance } from './HasAppearance';
import type { HasBoundsRectangle, HasBoundsRectangleRuntime } from './HasBoundsRectangle';
import type { HasHierarchy } from './HasHierarchy';
import type { HasMaterial } from './HasMaterial';
import type { HasTransform2D, HasTransform2DRuntime } from './HasTransform2D';
import type { Node, NodeData, NodeDataFactory, NodeRuntime, NodeRuntimeFactory } from './Node';
import type { Rectangle } from './Rectangle';

export type DisplayObject = Node<typeof DisplayGraph, DisplayObjectTraits> & DisplayObjectTraits;

export interface DisplayObjectTraits
  extends HasAppearance, HasBoundsRectangle, HasHierarchy, HasMaterial, HasTransform2D {
  data: DisplayObjectData | null;
  mask: DisplayObject | null;
  clipRectangle: Rectangle | null;
}

export interface DisplayObjectData extends NodeData {}

export const DisplayObjectKind: unique symbol = Symbol('DisplayObject');

export const DisplayGraph = Symbol('DisplayGraph');

export type DisplayObjectRuntime = NodeRuntime<typeof DisplayGraph, DisplayObjectTraits> &
  HasTransform2DRuntime &
  HasBoundsRectangleRuntime;

export type DisplayGraphNodeDataFactory = NodeDataFactory<DisplayObjectData>;
export type DisplayGraphNodeRuntimeFactory<R extends DisplayObjectRuntime> = NodeRuntimeFactory<R>;
