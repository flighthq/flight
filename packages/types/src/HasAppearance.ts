import type { BlendMode } from './BlendMode';
import type { ColorTransform } from './ColorTransform';
import type { NullScene, SceneNode, SceneNodeTraits } from './SceneNode';
import type { BitmapShader } from './Shader';

export interface HasAppearance {
  alpha: number;
  blendMode: BlendMode | null;
  colorTransform: ColorTransform | null;
  shader: BitmapShader | null;
  visible: boolean;
}

export type GraphAppearanceNode<
  SceneKind extends symbol = typeof NullScene,
  Traits extends object = SceneNodeTraits,
> = SceneNode<SceneKind, Traits> & HasAppearance;
