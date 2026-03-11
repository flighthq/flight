import type { NodeRuntimeKey } from '../../../index';
import type { BlendMode, ColorTransform, Shader } from '../../../materials';
import type {
  GraphNode,
  GraphNodeData,
  GraphNodeRuntime,
  HasBoundsRect,
  HasBoundsRectRuntime,
  HasTransform2D,
  HasTransform2DRuntime,
} from '../core';

export interface SpriteBase
  extends GraphNode<typeof SpriteGraph>, HasTransform2D<typeof SpriteGraph>, HasBoundsRect<typeof SpriteGraph> {
  alpha: number;
  alphaEnabled: boolean;
  blendMode: BlendMode | null;
  blendModeEnabled: boolean;
  colorTransform: ColorTransform | null;
  colorTransformEnabled: boolean;
  originX: number;
  originY: number;
  shader: Shader | null;

  [NodeRuntimeKey]: SpriteBaseRuntime | undefined;
}

export interface SpriteBaseData extends GraphNodeData {}

export const SpriteGraph: unique symbol = Symbol('SpriteGraph');

export interface SpriteBaseRuntime
  extends
    GraphNodeRuntime<typeof SpriteGraph>,
    HasTransform2DRuntime<typeof SpriteGraph>,
    HasBoundsRectRuntime<typeof SpriteGraph> {
  children: SpriteBase[] | null;
  parent: SpriteBase | null;
}
