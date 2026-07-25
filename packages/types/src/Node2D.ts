import type { HasAppearance } from './HasAppearance';
import type { HasBlendMode } from './HasBlendMode';
import type { HasBoundsRectangle, HasBoundsRectangleRuntime } from './HasBoundsRectangle';
import type { HasClip } from './HasClip';
import type { HasMaterial } from './HasMaterial';
import type { HasTransform2D, HasTransform2DRuntime } from './HasTransform2D';
import type { Node, NodeData, NodeDataFactory, NodeRuntime, NodeRuntimeFactory, NodeTraits } from './Node';
import type { Stage } from './Stage';
export type Node2D = Node<Node2DTraits> & Node2DTraits;
// A display object no longer carries a color transform as an entity trait. Its color adjustments live on
// the node runtime (`NodeRuntime.colorAdjustments`, a generic `readonly Adjustment[] | null`), set via
// `setNode2DColorAdjustments`; the render walk resolves that stack onto `RenderProxy.colorTransform`.
export interface Node2DTraits
  extends NodeTraits, HasAppearance, HasBlendMode, HasBoundsRectangle, HasClip, HasMaterial, HasTransform2D {
  data: Node2DData | null;
}
export interface Node2DData extends NodeData {}
export const DisplayObjectKind = 'DisplayObject';
export const Node2DTraitsKey = Symbol('Node2DTraits');
// `stage` is a back-pointer set on a display root by createStage (null on every other node). getScene2DRoot
// walks to the root and reads it, so stage membership needs no per-node propagation.
export type Node2DRuntime = NodeRuntime<Node2DTraits> &
  HasTransform2DRuntime &
  HasBoundsRectangleRuntime & { stage: Stage | null };
export type Node2DDataFactory = NodeDataFactory<Node2DData>;
export type Node2DRuntimeFactory<R extends Node2DRuntime> = NodeRuntimeFactory<R>;
