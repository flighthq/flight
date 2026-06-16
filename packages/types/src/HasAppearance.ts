import type { BlendMode } from './BlendMode';
import type { Node, NodeTraits } from './Node';

export interface HasAppearance {
  alpha: number;
  blendMode: BlendMode | null;
  visible: boolean;
}

export type AppearanceNode<Traits extends object = NodeTraits> = Node<Traits> & HasAppearance;
