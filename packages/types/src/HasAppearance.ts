import type { BlendMode } from './BlendMode';
import type { Node, NodeTraits, NullScene } from './Node';

export interface HasAppearance {
  alpha: number;
  blendMode: BlendMode | null;
  visible: boolean;
}

export type GraphAppearanceNode<Kind extends symbol = typeof NullScene, Traits extends object = NodeTraits> = Node<
  Kind,
  Traits
> &
  HasAppearance;
