import type { HasAppearance } from './HasAppearance';
import type { HasBoundsRectangle, HasBoundsRectangleRuntime } from './HasBoundsRectangle';
import type { HasHierarchy } from './HasHierarchy';
import type { HasTransform2D, HasTransform2DRuntime } from './HasTransform2D';
import type { Node, NodeData, NodeDataFactory, NodeRuntime, NodeRuntimeFactory } from './Node';

export const SpriteGraph = Symbol('SpriteGraph');

export type SpriteNode = Node<typeof SpriteGraph, SpriteNodeTraits> & SpriteNodeTraits;

export interface SpriteNodeTraits extends HasAppearance, HasBoundsRectangle, HasHierarchy, HasTransform2D {
  alphaEnabled: boolean;
  blendModeEnabled: boolean;
  colorTransformEnabled: boolean;
  originX: number;
  originY: number;
}

export interface SpriteNodeData extends NodeData {}

export type SpriteNodeRuntime = NodeRuntime<typeof SpriteGraph, SpriteNodeTraits> &
  HasTransform2DRuntime &
  HasBoundsRectangleRuntime;

export type SpriteNodeDataFactory = NodeDataFactory<SpriteNodeData>;
export type SpriteNodeRuntimeFactory<Runtime extends SpriteNodeRuntime> = NodeRuntimeFactory<Runtime>;
