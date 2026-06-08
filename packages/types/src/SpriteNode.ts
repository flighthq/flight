import type { HasAppearance } from './HasAppearance';
import type { HasBoundsRectangle, HasBoundsRectangleRuntime } from './HasBoundsRectangle';
import type { HasSceneHierarchy } from './HasSceneHierarchy';
import type { HasTransform2D, HasTransform2DRuntime } from './HasTransform2D';
import type {
  SceneNode,
  SceneNodeData,
  SceneNodeDataFactory,
  SceneNodeRuntime,
  SceneNodeRuntimeFactory,
} from './SceneNode';

export const SpriteGraph = Symbol('SpriteGraph');

export type SpriteNode = SceneNode<typeof SpriteGraph, SpriteNodeTraits> & SpriteNodeTraits;

export interface SpriteNodeTraits extends HasAppearance, HasBoundsRectangle, HasSceneHierarchy, HasTransform2D {
  alphaEnabled: boolean;
  blendModeEnabled: boolean;
  colorTransformEnabled: boolean;
  originX: number;
  originY: number;
}

export interface SpriteNodeData extends SceneNodeData {}

export type SpriteNodeRuntime = SceneNodeRuntime<typeof SpriteGraph, SpriteNodeTraits> &
  HasTransform2DRuntime &
  HasBoundsRectangleRuntime;

export type SpriteNodeDataFactory = SceneNodeDataFactory<SpriteNodeData>;
export type SpriteNodeRuntimeFactory<Runtime extends SpriteNodeRuntime> = SceneNodeRuntimeFactory<Runtime>;
