import type { ClippingAttachment2D, Skeleton2D } from '@flighthq/types/contract';

import { skinSkeleton2DAttachmentPoints } from './skinAttachment2DPoints';

// Produces a clipping polygon's world points as flat interleaved `[x0, y0, x1, y1, …]` in `out` (length
// ≥ 2 × attachment.pointCount). Requires `computeSkeleton2DWorldTransforms` to have filled
// `skeleton.worldMatrices`. Out-parameter, allocation-free.
//
// This computes the polygon and NOTHING ELSE. It does not clip, does not build a `ClipRegion`, and does
// not consult `endSlotIndex` — turning a polygon plus a slot range into an applied clip is the display
// layer's job, and doing it here would make a query function mutate a scene. See
// `getSkeleton2DClippingAttachmentSlotRange` for the range half.
export function computeSkeleton2DClippingAttachmentVertices(
  out: Float32Array,
  attachment: Readonly<ClippingAttachment2D>,
  skeleton: Readonly<Skeleton2D>,
  boneIndex: number,
  deform: Readonly<Float32Array> | null = null,
): void {
  skinSkeleton2DAttachmentPoints(
    out,
    attachment.skin,
    attachment.vertices,
    skeleton,
    boneIndex,
    deform,
    'ClippingAttachment2D',
  );
}

// The half-open slot range a clipping attachment covers, given the slot it sits on: `[start, end)` into
// the skeleton's draw-order slot array. Clipping starts AFTER its own slot and runs through
// `endSlotIndex` INCLUSIVE, so the returned `end` is one past it; an `endSlotIndex` of -1, or one at or
// before the clipping slot, runs to the end of the draw order.
//
// It exists so a consumer does not re-derive the off-by-one from the field's prose. The two conventions
// in play — inclusive in the format, half-open in the result — are exactly where that mistake lives.
export function getSkeleton2DClippingAttachmentSlotRange(
  attachment: Readonly<ClippingAttachment2D>,
  slotIndex: number,
  slotCount: number,
): { end: number; start: number } {
  const start = slotIndex + 1;
  const declared = attachment.endSlotIndex;
  const end = declared < start ? slotCount : Math.min(declared + 1, slotCount);
  return { end: Math.max(start, end), start };
}
