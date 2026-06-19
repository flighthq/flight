import type { HasAppearance } from './HasAppearance';
import type { HasBoundsRectangle, HasBoundsRectangleRuntime } from './HasBoundsRectangle';
import type { HasClip } from './HasClip';
import type { HasMaterial } from './HasMaterial';
import type { HasTransform2D, HasTransform2DRuntime } from './HasTransform2D';
import type { Node, NodeData, NodeDataFactory, NodeRuntime, NodeRuntimeFactory, NodeTraitsKey } from './Node';

export type DisplayObject = Node<DisplayObjectTraits> & DisplayObjectTraits;

export interface DisplayObjectTraits extends HasAppearance, HasBoundsRectangle, HasClip, HasMaterial, HasTransform2D {
  data: DisplayObjectData | null;
}

export interface DisplayObjectData extends NodeData {}

export const DisplayObjectKind: unique symbol = Symbol('DisplayObject');
export const DisplayObjectTraitsKey: NodeTraitsKey<DisplayObjectTraits> = Symbol(
  'DisplayObjectTraits',
) as NodeTraitsKey<DisplayObjectTraits>;

export type DisplayObjectRuntime = NodeRuntime<DisplayObjectTraits> & HasTransform2DRuntime & HasBoundsRectangleRuntime;

export type DisplayObjectDataFactory = NodeDataFactory<DisplayObjectData>;
export type DisplayObjectRuntimeFactory<R extends DisplayObjectRuntime> = NodeRuntimeFactory<R>;
