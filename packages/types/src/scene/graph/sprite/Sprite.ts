import type { Spritesheet } from '../../../assets';
import type { Rectangle } from '../../../geometry';
import type { BlendMode, ColorTransform, Shader } from '../../../materials';
import type { SceneNode, Transform2D } from '../core';

export interface Sprite extends SceneNode<typeof SpriteKind>, Transform2D {
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
}

export const SpriteKind: unique symbol = Symbol('Sprite');
