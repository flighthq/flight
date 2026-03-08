import type { Matrix3x2, Rectangle } from '../../../geometry';
import type { BlendMode, ColorTransform, Filter, Shader } from '../../../materials';
import type { HasTransform2D, SceneNode, SceneNodeData, SceneNodeRuntime, Transform2DRuntime } from '../core';
import type { SceneNodeRuntimeKey } from '../core';
import type { BoundsRectRuntime, HasBoundsRect } from '../core/HasBoundsRect';
import type { Stage } from './Stage';

export interface DisplayObject
  extends
    SceneNode<typeof DisplayObjectKind>,
    HasTransform2D<typeof DisplayObjectKind>,
    HasBoundsRect<typeof DisplayObjectKind> {
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
  readonly root: DisplayObject | null;
  scale9Grid: Rectangle | null;
  scrollRect: Rectangle | null;
  shader: Shader | null;
  readonly stage: Stage | null;
  type: symbol;
  visible: boolean;

  [SceneNodeRuntimeKey]: DisplayObjectRuntime | undefined;
}

export interface DisplayObjectData extends SceneNodeData {}

export const DisplayObjectKind: unique symbol = Symbol('DisplayObject');

export type DisplayObjectRuntime = SceneNodeRuntime<typeof DisplayObjectKind> &
  Transform2DRuntime<typeof DisplayObjectKind> &
  BoundsRectRuntime<typeof DisplayObjectKind>;
