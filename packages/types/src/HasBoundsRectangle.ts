import type { Entity, EntityRuntime } from './Entity.ts';
import type { HasTransform2D } from './HasTransform2D.ts';
import type { NodeAny, NodeOf, NodeFields } from './Node.ts';
import type { Rectangle } from './Rectangle.ts';

export interface HasBoundsRectangle extends Entity {}

// Generic over the same Fields parameter NodeRuntime<Fields> carries, so a bounds callback receives
// the node family it was registered for rather than a node erased to `any`. The C++ port has no way
// to recover the concrete type once it is erased through the callback boundary, so the erasure has to
// stop at the type rather than be undone by a cast inside every implementation.
export interface HasBoundsRectangleRuntime<Fields extends object = NodeFields> extends EntityRuntime {
  boundsRectangle: Rectangle | null;
  computeLocalBoundsRectangle: (out: Rectangle, source: Readonly<BoundsNode<Fields>>) => void;
  // Optional kind-owned validity check for local-bounds inputs that live outside the node revision
  // axes. The bounds pull calls it only after the generic localBoundsId stamp matches; null keeps the
  // common path to one nullable check while kinds such as Sprite can compare their own Texture stamp.
  isLocalBoundsRectangleValid: ((source: Readonly<BoundsNode<Fields>>) => boolean) | null;
  localBoundsRectangle: Rectangle | null;
  worldBoundsRectangle: Rectangle | null;
}

export type BoundsNode<Fields extends object = NodeFields> = NodeOf<Fields> & HasBoundsRectangle;
export type BoundsNodeAny = NodeAny & HasBoundsRectangle;

export type Spatial2DNode<Fields extends object = NodeFields> = NodeOf<Fields> & HasBoundsRectangle & HasTransform2D;
