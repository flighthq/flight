import type {
  GraphNode,
  GraphNodeData,
  GraphNodeRuntime,
  HasAppearance,
  HasBoundsRect,
  HasBoundsRectRuntime,
  HasTransform2D,
  HasTransform2DRuntime,
} from '../scene-graph-core';

export const SpriteGraph = Symbol('SpriteGraph');

export type SpriteNode = GraphNode<typeof SpriteGraph, SpriteNodeTraits> & SpriteNodeTraits;

export interface SpriteNodeTraits extends HasAppearance, HasBoundsRect, HasTransform2D {
  alphaEnabled: boolean;
  blendModeEnabled: boolean;
  colorTransformEnabled: boolean;
  originX: number;
  originY: number;
}

export interface SpriteNodeData extends GraphNodeData {}

export type SpriteNodeRuntime = GraphNodeRuntime<typeof SpriteGraph, SpriteNodeTraits> &
  HasTransform2DRuntime &
  HasBoundsRectRuntime;
