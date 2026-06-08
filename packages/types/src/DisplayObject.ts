import type { HasAppearance } from './HasAppearance';
import type { HasBoundsRectangle, HasBoundsRectangleRuntime } from './HasBoundsRectangle';
import type { HasSceneHierarchy } from './HasSceneHierarchy';
import type { HasTransform2D, HasTransform2DRuntime } from './HasTransform2D';
import type { Rectangle } from './Rectangle';
import type {
  SceneNode,
  SceneNodeData,
  SceneNodeDataFactory,
  SceneNodeRuntime,
  SceneNodeRuntimeFactory,
} from './SceneNode';

export type DisplayObject = SceneNode<typeof DisplayGraph, DisplayObjectTraits> & DisplayObjectTraits;

export interface DisplayObjectTraits extends HasAppearance, HasBoundsRectangle, HasSceneHierarchy, HasTransform2D {
  data: DisplayObjectData | null;
  mask: DisplayObject | null;
  clipRectangle: Rectangle | null;
}

export interface DisplayObjectData extends SceneNodeData {}

export const DisplayObjectKind: unique symbol = Symbol('DisplayObject');

export const DisplayGraph = Symbol('DisplayGraph');

export type DisplayObjectRuntime = SceneNodeRuntime<typeof DisplayGraph, DisplayObjectTraits> &
  HasTransform2DRuntime &
  HasBoundsRectangleRuntime;

export type DisplayGraphNodeDataFactory = SceneNodeDataFactory<DisplayObjectData>;
export type DisplayGraphNodeRuntimeFactory<R extends DisplayObjectRuntime> = SceneNodeRuntimeFactory<R>;
