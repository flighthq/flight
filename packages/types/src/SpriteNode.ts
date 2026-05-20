import type {
  GraphNode,
  GraphNodeData,
  GraphNodeDataFactory,
  GraphNodeRuntime,
  GraphNodeRuntimeFactory,
} from './GraphNode';
import type { HasAppearance } from './HasAppearance';
import type { HasBoundsRect, HasBoundsRectRuntime } from './HasBoundsRect';
import type { HasTransform2D, HasTransform2DRuntime } from './HasTransform2D';

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

export type SpriteGraphNodeDataFactory = GraphNodeDataFactory<SpriteNodeData>;
export type SpriteGraphNodeRuntimeFactory<Runtime extends SpriteNodeRuntime> = GraphNodeRuntimeFactory<
  typeof SpriteGraph,
  SpriteNodeTraits,
  Runtime
>;
