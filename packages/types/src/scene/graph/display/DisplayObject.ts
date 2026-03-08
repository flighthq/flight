import type { Matrix3x2, Rectangle } from '../../../geometry';
import type { BlendMode, ColorTransform, Filter, Shader } from '../../../materials';
import type { SceneNode, SceneNodeData, SceneNodeRuntime, Transform2D, Transform2DRuntime } from '../core';
import type { SceneNodeRuntimeKey } from '../core';
import type { Stage } from './Stage';

export interface DisplayObject extends SceneNode<typeof DisplayObjectKind>, Transform2D {
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

export interface DisplayObjectRuntime
  extends SceneNodeRuntime<typeof DisplayObjectKind>, Transform2DRuntime<typeof DisplayObjectKind> {
  boundsRect: Rectangle | null;
  boundsRectUsingLocalBoundsID: number;
  boundsRectUsingLocalTransformID: number;
  computeLocalBounds: (out: Rectangle, source: DisplayObject) => void;
  localBoundsRect: Rectangle | null;
  localBoundsRectUsingLocalBoundsID: number;
  localBoundsID: number;
  objectType: string;
  worldBoundsRect: Rectangle | null;
  worldBoundsRectUsingLocalBoundsID: number;
  worldBoundsRectUsingWorldTransformID: number;
}
