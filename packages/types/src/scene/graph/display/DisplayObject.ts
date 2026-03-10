import type { Matrix3x2, Rectangle } from '../../../geometry';
import type { BlendMode, ColorTransform, Filter, Shader } from '../../../materials';
import type {
  GraphNode,
  GraphNodeData,
  GraphNodeRuntime,
  HasTransform2D,
  HasTransform2DRuntime,
  NodeRuntimeKey,
} from '../core';
import type { HasBoundsRect, HasBoundsRectRuntime } from '../core/HasBoundsRect';

export interface DisplayObject
  extends GraphNode<typeof DisplayGraph>, HasTransform2D<typeof DisplayGraph>, HasBoundsRect<typeof DisplayGraph> {
  alpha: number;
  blendMode: BlendMode;
  cacheAsBitmap: boolean;
  cacheAsBitmapMatrix: Matrix3x2 | null;
  readonly children: DisplayObject[] | null;
  colorTransform: ColorTransform | null;
  data: DisplayObjectData | null;
  filters: Filter[] | null;
  mask: DisplayObject | null;
  opaqueBackground: number | null;
  readonly parent: DisplayObject | null;
  scale9Grid: Rectangle | null;
  scrollRect: Rectangle | null;
  shader: Shader | null;
  visible: boolean;

  [NodeRuntimeKey]: DisplayObjectRuntime | undefined;
}

export interface DisplayObjectData extends GraphNodeData {}

export const DisplayGraph: unique symbol = Symbol('DisplayGraph');

export const DisplayObjectKind: unique symbol = Symbol('DisplayObject');

export type DisplayObjectRuntime = GraphNodeRuntime<typeof DisplayGraph> &
  HasTransform2DRuntime<typeof DisplayGraph> &
  HasBoundsRectRuntime<typeof DisplayGraph>;
