import type { BlendMode, ColorTransform, Shader } from '../../../materials';
import type {
  BoundsRectRuntime,
  HasBoundsRect,
  HasTransform2D,
  SceneNode,
  SceneNodeData,
  SceneNodeRuntime,
  SceneNodeRuntimeKey,
  Transform2DRuntime,
} from '../core';

export interface SpriteBase
  extends
    SceneNode<typeof SpriteBaseKind>,
    HasTransform2D<typeof SpriteBaseKind>,
    HasBoundsRect<typeof SpriteBaseKind> {
  alpha: number;
  alphaEnabled: boolean;
  blendMode: BlendMode | null;
  blendModeEnabled: boolean;
  colorTransform: ColorTransform | null;
  colorTransformEnabled: boolean;
  originX: number;
  originY: number;
  shader: Shader | null;
  type: symbol;

  [SceneNodeRuntimeKey]: SpriteBaseRuntime | undefined;
}

export interface SpriteBaseData extends SceneNodeData {}

export const SpriteBaseKind: unique symbol = Symbol('SpriteBase');

export type SpriteBaseRuntime = SceneNodeRuntime<typeof SpriteBaseKind> &
  Transform2DRuntime<typeof SpriteBaseKind> &
  BoundsRectRuntime<typeof SpriteBaseKind>;
