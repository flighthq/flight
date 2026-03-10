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
  extends
    GraphNode<typeof SpriteGraphKind>,
    HasTransform2D<typeof SpriteGraphKind>,
    HasBoundsRect<typeof SpriteGraphKind> {
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
  type: symbol;

  [NodeRuntimeKey]: SpriteGraphRuntime | undefined;
}

export interface SpriteBaseData extends NodeData {}

export const SpriteGraphKind: unique symbol = Symbol('SpriteGraph');

export type SpriteGraphRuntime = GraphNodeRuntime<typeof SpriteGraphKind> &
  HasTransform2DRuntime<typeof SpriteGraphKind> &
  HasBoundsRectRuntime<typeof SpriteGraphKind>;
