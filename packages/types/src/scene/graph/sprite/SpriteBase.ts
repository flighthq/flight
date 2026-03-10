import type { BlendMode, ColorTransform, Shader } from '../../../materials';
import type {
  GraphNode,
  GraphNodeRuntime,
  HasBoundsRect,
  HasBoundsRectRuntime,
  HasTransform2D,
  HasTransform2DRuntime,
  NodeData,
  NodeRuntimeKey,
} from '../core';

export interface SpriteBase
  extends GraphNode<typeof SpriteGraph>, HasTransform2D<typeof SpriteGraph>, HasBoundsRect<typeof SpriteGraph> {
  alpha: number;
  alphaEnabled: boolean;
  blendMode: BlendMode | null;
  blendModeEnabled: boolean;
  readonly children: SpriteBase[] | null;
  colorTransform: ColorTransform | null;
  colorTransformEnabled: boolean;
  originX: number;
  originY: number;
  readonly parent: SpriteBase | null;
  shader: Shader | null;

  [NodeRuntimeKey]: SpriteBaseRuntime | undefined;
}

export interface SpriteBaseData extends NodeData {}

export const SpriteGraph: unique symbol = Symbol('SpriteGraph');

export type SpriteBaseRuntime = GraphNodeRuntime<typeof SpriteGraph> &
  HasTransform2DRuntime<typeof SpriteGraph> &
  HasBoundsRectRuntime<typeof SpriteGraph>;
