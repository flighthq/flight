import type { HasAppearance } from './HasAppearance';
import type { HasBoundsRectangle, HasBoundsRectangleRuntime } from './HasBoundsRectangle';
import type { HasMaterial } from './HasMaterial';
import type { HasTransform2D, HasTransform2DRuntime } from './HasTransform2D';
import type { Node, NodeData, NodeDataFactory, NodeRuntime, NodeRuntimeFactory, NodeTraitsKey } from './Node';

export type SpriteNode = Node<SpriteNodeTraits> & SpriteNodeTraits;

export interface SpriteNodeTraits extends HasAppearance, HasBoundsRectangle, HasMaterial, HasTransform2D {
  originX: number;
  originY: number;
}

export const SpriteNodeTraitsKey: NodeTraitsKey<SpriteNodeTraits> = Symbol(
  'SpriteNodeTraits',
) as NodeTraitsKey<SpriteNodeTraits>;

export interface SpriteNodeData extends NodeData {}

export type SpriteNodeRuntime = NodeRuntime<SpriteNodeTraits> & HasTransform2DRuntime & HasBoundsRectangleRuntime;

export type SpriteNodeDataFactory = NodeDataFactory<SpriteNodeData>;
export type SpriteNodeRuntimeFactory<Runtime extends SpriteNodeRuntime> = NodeRuntimeFactory<Runtime>;
