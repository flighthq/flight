import type { BlendMode } from './BlendMode';
import type { ColorTransform } from './ColorTransform';
import type { NullScene, SceneNode, SceneNodeTraits } from './SceneNode';

export interface HasAppearance {
  alpha: number;
  blendMode: BlendMode | null;
  colorTransform: ColorTransform | null;
  visible: boolean;
}

export type GraphAppearanceNode<
  SceneKind extends symbol = typeof NullScene,
  Traits extends object = SceneNodeTraits,
> = SceneNode<SceneKind, Traits> & HasAppearance;
