import type { HasAppearance } from './HasAppearance';
import type { HasBoundsRectangle, HasBoundsRectangleRuntime } from './HasBoundsRectangle';
import type { HasClip } from './HasClip';
import type { HasColorTransform } from './HasColorTransform';
import type { HasMaterial } from './HasMaterial';
import type { HasTransform2D, HasTransform2DRuntime } from './HasTransform2D';
import type { Node, NodeData, NodeDataFactory, NodeRuntime, NodeRuntimeFactory, NodeTraits } from './Node';
export type DisplayObject = Node<DisplayObjectTraits> & DisplayObjectTraits;
export interface DisplayObjectTraits
  extends NodeTraits, HasAppearance, HasBoundsRectangle, HasClip, HasColorTransform, HasMaterial, HasTransform2D {
  data: DisplayObjectData | null;
}
export interface DisplayObjectData extends NodeData {}
export const DisplayObjectKind = 'DisplayObject';
export const DisplayObjectTraitsKey = Symbol('DisplayObjectTraits');
export type DisplayObjectRuntime = NodeRuntime<DisplayObjectTraits> & HasTransform2DRuntime & HasBoundsRectangleRuntime;
export type DisplayObjectDataFactory = NodeDataFactory<DisplayObjectData>;
export type DisplayObjectRuntimeFactory<R extends DisplayObjectRuntime> = NodeRuntimeFactory<R>;
