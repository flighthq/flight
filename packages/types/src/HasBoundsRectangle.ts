import type { Entity, EntityRuntime } from './Entity.ts';
import type { HasTransform2D } from './HasTransform2D.ts';
import type { NodeAny, NodeOf, NodeTraits } from './Node.ts';
import type { Rectangle } from './Rectangle.ts';

export interface HasBoundsRectangle extends Entity {}

// Generic over the same Traits parameter NodeRuntime<Traits> carries, so a bounds callback receives
// the node family it was registered for rather than a node erased to `any`. The C++ port has no way
// to recover the concrete type once it is erased through the callback boundary, so the erasure has to
// stop at the type rather than be undone by a cast inside every implementation.
export interface HasBoundsRectangleRuntime<Traits extends object = NodeTraits> extends EntityRuntime {
  boundsRectangle: Rectangle | null;
  computeLocalBoundsRectangle: (out: Rectangle, source: Readonly<BoundsNode<Traits>>) => void;
  // Optional kind-owned validity check for local-bounds inputs that live outside the node revision
  // axes. The bounds pull calls it only after the generic localBoundsId stamp matches; null keeps the
  // common path to one nullable check while kinds such as Sprite can compare their own Texture stamp.
  isLocalBoundsRectangleValid: ((source: Readonly<BoundsNode<Traits>>) => boolean) | null;
  localBoundsRectangle: Rectangle | null;
  worldBoundsRectangle: Rectangle | null;
}

export type BoundsNode<Traits extends object = NodeTraits> = NodeOf<Traits> & HasBoundsRectangle;
export type BoundsNodeAny = NodeAny & HasBoundsRectangle;

export type Spatial2DNode<Traits extends object = NodeTraits> = NodeOf<Traits> & HasBoundsRectangle & HasTransform2D;
