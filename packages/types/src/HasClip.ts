import type { ClipRegion } from './ClipRegion.ts';
import type { Entity } from './Entity.ts';
import type { NodeOf, NodeTraits } from './Node.ts';

export interface HasClip extends Entity {
  /**
   * Geometric clip applied to this node and its subtree, or null for no clipping. A rectangle clip is
   * realized as a scissor; an arbitrary path clip as stencil-then-cover. See `ClipRegion`. Build one
   * with the `createClipRegionFrom*` producers in `@flighthq/clip`.
   */
  clip: ClipRegion | null;
}

export type ClipNode<Traits extends object = NodeTraits> = NodeOf<Traits> & HasClip;
