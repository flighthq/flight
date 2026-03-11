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

export type SpriteBase = GraphNode<typeof SpriteGraph, SpriteBaseTraits> & SpriteBaseTraits;

export interface SpriteBaseTraits extends HasBoundsRect, HasTransform2D {
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

export interface SpriteBaseData extends GraphNodeData {}

export const SpriteGraph = Symbol('SpriteGraph');

export type SpriteBaseRuntime = GraphNodeRuntime<typeof SpriteGraph, SpriteBaseTraits> &
  HasTransform2DRuntime &
  HasBoundsRectRuntime;
