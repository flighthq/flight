import type { HasAppearance } from './HasAppearance';
import type { HasBlendMode } from './HasBlendMode';
import type { HasBoundsRectangle, HasBoundsRectangleRuntime } from './HasBoundsRectangle';
import type { HasClip } from './HasClip';
import type { HasMaterial } from './HasMaterial';
import type { HasTransform2D, HasTransform2DRuntime } from './HasTransform2D';
import type { Node, NodeData, NodeDataFactory, NodeRuntime, NodeRuntimeFactory, NodeTraits } from './Node';
import type { Scene2D } from './Scene2D';
export type Node2D = Node<Node2DTraits> & Node2DTraits;
// A display object no longer carries a color adjustment as an entity trait. Its color adjustments live on
// the node runtime (`NodeRuntime.colorAdjustments`, a generic `readonly Adjustment[] | null`), set via
// `setNodeColorAdjustments`; the render walk resolves that stack onto `RenderProxy.colorScaleBias`.
export interface Node2DTraits
  extends NodeTraits, HasAppearance, HasBlendMode, HasBoundsRectangle, HasClip, HasMaterial, HasTransform2D {
  data: Node2DData | null;
}
export interface Node2DData extends NodeData {}
export const DisplayObjectKind = 'DisplayObject';
export const Node2DTraitsKey = Symbol('Node2DTraits');
// `scene2d` is a back-pointer set on a display root by createScene2D (null on every other node). getScene2DRoot
// walks to the root and reads it, so scene2d membership needs no per-node propagation.
// A named interface rather than an intersection typedef ending in an anonymous overlay: the runtime is
// a seam subsystems attach to, so it needs a name a declaration can be found by and extended from.
// Every base is already an interface, so this introduces no second root — it names the same shape.
export interface Node2DRuntime extends NodeRuntime<Node2DTraits>, HasTransform2DRuntime, HasBoundsRectangleRuntime {
  scene2d: Scene2D | null;
}
export type Node2DDataFactory = NodeDataFactory<Node2DData>;
export type Node2DRuntimeFactory<R extends Node2DRuntime> = NodeRuntimeFactory<R>;
