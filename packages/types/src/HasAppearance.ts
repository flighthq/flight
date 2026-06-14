import type { BlendMode } from './BlendMode';
import type { ColorTransform } from './ColorTransform';
import type { Node, NodeTraits, NullScene } from './Node';

export interface HasAppearance {
  alpha: number;
  blendMode: BlendMode | null;
  colorTransform: ColorTransform | null;
  visible: boolean;
}

export type GraphAppearanceNode<Kind extends symbol = typeof NullScene, Traits extends object = NodeTraits> = Node<
  Kind,
  Traits
> &
  HasAppearance;
