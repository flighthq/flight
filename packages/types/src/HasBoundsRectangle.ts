import type { Entity, EntityRuntime } from './Entity';
import type { HasTransform2D } from './HasTransform2D';
import type { NodeAny, NodeOf, NodeTraits } from './Node';
import type { Rectangle } from './Rectangle';

export interface HasBoundsRectangle extends Entity {}

export interface HasBoundsRectangleRuntime extends EntityRuntime {
  boundsRectangle: Rectangle | null;
  computeLocalBoundsRectangle: (out: Rectangle, source: Readonly<BoundsNodeAny>) => void;
  // Optional kind-owned validity check for local-bounds inputs that live outside the node revision
  // axes. The bounds pull calls it only after the generic localBoundsId stamp matches; null keeps the
  // common path to one nullable check while kinds such as Sprite can compare their own Texture stamp.
  isLocalBoundsRectangleValid: ((source: Readonly<BoundsNodeAny>) => boolean) | null;
  localBoundsRectangle: Rectangle | null;
  worldBoundsRectangle: Rectangle | null;
}

export type BoundsNode<Traits extends object = NodeTraits> = NodeOf<Traits> & HasBoundsRectangle;
export type BoundsNodeAny = NodeAny & HasBoundsRectangle;

export type Spatial2DNode<Traits extends object = NodeTraits> = NodeOf<Traits> & HasBoundsRectangle & HasTransform2D;
