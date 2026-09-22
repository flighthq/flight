import type { Entity, EntityRuntime } from './Entity';
import type { HasTransform2D } from './HasTransform2D';
import type { NodeAny, NodeOf, NodeTraits } from './Node';
import type { Rectangle } from './Rectangle';

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
// The trait-erased spelling, for APIs that accept any node family carrying both spatial traits.
// Spatial2DNode<NodeTraits> would reject a DisplayObject, because the traits parameter keys the node
// family; erasing it the way BoundsNodeAny does is what lets one signature serve every 2D graph.
export type Spatial2DNodeAny = NodeAny & HasBoundsRectangle & HasTransform2D;
