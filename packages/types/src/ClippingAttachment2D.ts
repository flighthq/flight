import type { Attachment2D } from './Attachment2D';
import type { Skin2D } from './Skin2D';

// A closed polygon that clips what other slots draw — a character seen through a porthole, a fill that
// stops at a mask edge. Geometrically identical to a bounding box; what makes it a different type is
// `endSlotIndex`, which is the whole of its meaning.
//
// A clipping attachment clips every slot AFTER its own in draw order, up to and including
// `endSlotIndex`; -1 clips to the end of the draw order. That RANGE is why it cannot be modelled as a
// `ClipRegion` on one node: the region belongs to a span of the draw list rather than to a subtree, so
// the consumer that applies it has to group the covered slots, exactly as the SWF importer groups a
// clip-depth range.
//
// `computeSkeleton2DClippingAttachmentVertices` produces the world polygon; turning that polygon into a
// clip is the display layer's job, and nothing here rasterizes or applies anything.
export interface ClippingAttachment2D extends Attachment2D {
  /** The last slot this clips, inclusive. -1 clips to the end of the draw order. */
  endSlotIndex: number;
  kind: 'ClippingAttachment2D';
  pointCount: number;
  skin?: Skin2D | null;
  vertices?: Float32Array | null;
}

export const ClippingAttachment2DKind = 'ClippingAttachment2D';
