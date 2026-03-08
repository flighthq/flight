import type { Spritesheet } from '../../../assets';
import type { Rectangle } from '../../../geometry';
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

export interface Sprite
  extends SceneNode<typeof SpriteKind>, HasTransform2D<typeof SpriteKind>, HasBoundsRect<typeof SpriteKind> {
  alpha: number;
  alphaEnabled: boolean;
  blendMode: BlendMode | null;
  blendModeEnabled: boolean;
  colorTransform: ColorTransform | null;
  colorTransformEnabled: boolean;
  id: number;
  originX: number;
  originY: number;
  rect: Rectangle | null;
  shader: Shader | null;
  spritesheet: Spritesheet | null;
  type: symbol;

  [SceneNodeRuntimeKey]: SpriteRuntime | undefined;
}

export interface SpriteData extends SceneNodeData {}

export const SpriteKind: unique symbol = Symbol('Sprite');

export type SpriteRuntime = SceneNodeRuntime<typeof SpriteKind> &
  Transform2DRuntime<typeof SpriteKind> &
  BoundsRectRuntime<typeof SpriteKind>;
