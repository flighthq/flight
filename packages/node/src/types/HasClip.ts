import type { ClipRegion } from '@flighthq/clip/contract';
import type { EntityRaw, EntityRuntime, EntityRuntimeKey } from '@flighthq/entity/contract';

import type { NodeOf, NodeFields } from './Node.ts';

export interface HasClip extends EntityRaw {
  [EntityRuntimeKey]: EntityRuntime | undefined;
  /**
   * Geometric clip applied to this node and its subtree, or null for no clipping. A rectangle clip is
   * realized as a scissor; an arbitrary path clip as stencil-then-cover. See `ClipRegion`. Build one
   * with the `createClipRegionFrom*` producers in `@flighthq/clip`.
   */
  clip: ClipRegion | null;
}

export type ClipNode<Fields extends object = NodeFields> = NodeOf<Fields> & HasClip;
