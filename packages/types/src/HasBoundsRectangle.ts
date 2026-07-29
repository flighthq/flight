import type { Entity, EntityRuntime } from './Entity';
import type { HasTransform2D } from './HasTransform2D';
import type { Node, NodeAny, NodeTraits } from './Node';
import type { Rectangle } from './Rectangle';

export interface HasBoundsRectangle extends Entity {}

export interface HasBoundsRectangleRuntime extends EntityRuntime {
  boundsRectangle: Rectangle | null;
  computeLocalBoundsRectangle: (out: Rectangle, source: Readonly<BoundsNodeAny>) => void;
  localBoundsRectangle: Rectangle | null;
  worldBoundsRectangle: Rectangle | null;
}

export type BoundsNode<Traits extends object = NodeTraits> = Node<Traits> & HasBoundsRectangle;
export type BoundsNodeAny = NodeAny & HasBoundsRectangle;

export type Spatial2DNode<Traits extends object = NodeTraits> = Node<Traits> & HasBoundsRectangle & HasTransform2D;
