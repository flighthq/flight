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

export const SpriteGraph = Symbol('SpriteGraph');

export type SpriteNode = GraphNode<typeof SpriteGraph, SpriteNodeTraits> & SpriteNodeTraits;

export interface SpriteNodeTraits extends HasBoundsRect, HasTransform2D {
  alpha: number;
  alphaEnabled: boolean;
  blendMode: BlendMode | null;
  blendModeEnabled: boolean;
  colorTransform: ColorTransform | null;
  colorTransformEnabled: boolean;
  originX: number;
  originY: number;
  shader: Shader | null;
}

export interface SpriteNodeData extends GraphNodeData {}

export type SpriteNodeRuntime = GraphNodeRuntime<typeof SpriteGraph, SpriteNodeTraits> &
  HasTransform2DRuntime &
  HasBoundsRectRuntime;
