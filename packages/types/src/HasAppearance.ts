import type { BlendMode } from './BlendMode';
import type { ColorTransform } from './ColorTransform';
import type { GraphNode, GraphNodeTraits, NullGraph } from './GraphNode';
import type { BitmapShader } from './Shader';

export interface HasAppearance {
  alpha: number;
  blendMode: BlendMode | null;
  colorTransform: ColorTransform | null;
  shader: BitmapShader | null;
  visible: boolean;
}

export type GraphAppearanceNode<
  GraphKind extends symbol = typeof NullGraph,
  Traits extends object = GraphNodeTraits,
> = GraphNode<GraphKind, Traits> & HasAppearance;
