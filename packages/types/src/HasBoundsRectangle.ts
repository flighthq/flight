import type { Entity, EntityRuntime } from './Entity';
import type { HasTransform2D } from './HasTransform2D';
import type { Node, NodeTraits, NullScene } from './Node';
import type { Rectangle } from './Rectangle';

export interface HasBoundsRectangle extends Entity {}

export interface HasBoundsRectangleRuntime extends EntityRuntime {
  boundsRectangle: Rectangle | null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- unique symbol variance prevents a tighter type here
  computeLocalBoundsRectangle: (out: Rectangle, source: Readonly<BoundsNode<any, any>>) => void;
  localBoundsRectangle: Rectangle | null;
  worldBoundsRectangle: Rectangle | null;
}

export type BoundsNode<Kind extends symbol = typeof NullScene, Traits extends object = NodeTraits> = Node<
  Kind,
  Traits
> &
  HasBoundsRectangle;

export type Spatial2DNode<Kind extends symbol = typeof NullScene, Traits extends object = NodeTraits> = Node<
  Kind,
  Traits
> &
  HasBoundsRectangle &
  HasTransform2D;
