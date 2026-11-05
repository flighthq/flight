import type { ClipRegion } from '@flighthq/clip/contract';
import type {
  HasAppearance,
  HasBlendMode,
  HasBoundsRectangle,
  HasBoundsRectangleRuntime,
  HasMaterial,
  HasTransform2D,
  HasTransform2DRuntime,
  Node,
  NodeData,
  NodeDataFactory,
  NodeFields,
  NodeRuntime,
  NodeRuntimeFactory,
} from '@flighthq/node/contract';

import type { Scene2D } from './Scene2D.ts';
import type { Scene2DEntity } from './Scene2DEntity.ts';

interface Scene2DHasClip extends Scene2DEntity {
  clip: ClipRegion | null;
}

export type Node2D = Node<Node2DFields> & Node2DFields;
export interface Node2DFields
  extends NodeFields, HasAppearance, HasBlendMode, HasBoundsRectangle, Scene2DHasClip, HasMaterial, HasTransform2D {
  data: Node2DData | null;
}
export interface Node2DData extends NodeData {}
export const DisplayObjectKind = 'DisplayObject';
export const Node2DFieldsKey = Symbol.for('@flighthq/scene2d/Node2DFields');
export interface Node2DRuntime
  extends NodeRuntime<Node2DFields>, HasTransform2DRuntime, HasBoundsRectangleRuntime<Node2DFields> {
  scene2d: Scene2D | null;
}
export type Node2DDataFactory = NodeDataFactory<Node2DData>;
export type Node2DRuntimeFactory<R extends Node2DRuntime> = NodeRuntimeFactory<R>;
