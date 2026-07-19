import type { HasAppearance } from './HasAppearance';
import type { HasBlendMode } from './HasBlendMode';
import type { HasBoundsRectangle, HasBoundsRectangleRuntime } from './HasBoundsRectangle';
import type { HasClip } from './HasClip';
import type { HasMaterial } from './HasMaterial';
import type { HasTransform2D, HasTransform2DRuntime } from './HasTransform2D';
import type { Node, NodeData, NodeDataFactory, NodeRuntime, NodeRuntimeFactory, NodeTraits } from './Node';
export type DisplayObject = Node<DisplayObjectTraits> & DisplayObjectTraits;
// A display object no longer carries a color transform as an entity trait. Its color adjustments live on
// the node runtime (`NodeRuntime.colorAdjustments`, a generic `readonly Adjustment[] | null`), set via
// `setDisplayObjectColorAdjustments`; the render walk resolves that stack onto `RenderProxy.colorTransform`.
export interface DisplayObjectTraits
  extends NodeTraits, HasAppearance, HasBlendMode, HasBoundsRectangle, HasClip, HasMaterial, HasTransform2D {
  data: DisplayObjectData | null;
}
export interface DisplayObjectData extends NodeData {}
export const DisplayObjectKind = 'DisplayObject';
export const DisplayObjectTraitsKey = Symbol('DisplayObjectTraits');
export type DisplayObjectRuntime = NodeRuntime<DisplayObjectTraits> & HasTransform2DRuntime & HasBoundsRectangleRuntime;
export type DisplayObjectDataFactory = NodeDataFactory<DisplayObjectData>;
export type DisplayObjectRuntimeFactory<R extends DisplayObjectRuntime> = NodeRuntimeFactory<R>;
