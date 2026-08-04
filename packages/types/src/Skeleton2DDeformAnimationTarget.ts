import type { Attachment2D } from './Attachment2D';
import type { Skeleton2DAnimationTargetKind } from './Skeleton2DAnimationTargetKind';

/**
 * The binding target for a channel that animates an attachment's per-vertex offsets — a flag rippling, a
 * cape settling, a mouth shape morphing between drawn keys.
 *
 * It names BOTH the slot and the attachment, because a deform timeline is authored per (slot, attachment)
 * pair: the same slot showing a different attachment is a different timeline. The binder stamps
 * `attachment` into the slot's `Skeleton2DSlotDeform` so the pull seam can tell whether the offsets it
 * finds belong to the art currently shown.
 *
 * The track is an ordinary numeric `AnimationTrack` whose `components` is the whole offset stream length,
 * so nothing in `@flighthq/animation` widens to carry this — and unlike an attachment-swap index, deform
 * offsets DO interpolate, which is what makes a morph move rather than snap.
 */
export interface Skeleton2DDeformAnimationTarget {
  /** The attachment these offsets belong to; stamped onto the slot's deform record when bound. */
  attachment: Attachment2D | null;
  kind: Skeleton2DAnimationTargetKind;
  slotIndex: number;
}
