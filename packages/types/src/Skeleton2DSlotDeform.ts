import type { Attachment2D } from './Attachment2D';

/**
 * The per-vertex offset stream in effect on a slot, together with THE ATTACHMENT IT WAS AUTHORED FOR.
 *
 * A deform belongs to a (slot, attachment) PAIR, not to a slot: the attachment is shared art, so two
 * slots showing the same mesh deform independently, and one slot that SWAPS attachments must not carry
 * the old one's offsets onto the new art. Pairing the offsets with their attachment here is what makes
 * that impossible to express, rather than something a consumer has to remember to check.
 *
 * This is the invalidation doctrine's compare-identities rule applied literally: `attachment` is a
 * reference-shaped field re-read at the pull seam (`getSkeleton2DSlotDeformOffsets`), and bare assignment
 * is the API — nothing has to be invalidated when a swap happens, because the comparison catches it.
 *
 * A bare `Float32Array` on the slot was the alternative and it is unsafe in a way a length check cannot
 * fix. Of the three ways a swap can change size, only ONE is detectable by length: swapping to a LARGER
 * attachment leaves the buffer too short and is caught, while swapping to an EQUAL or SMALLER one passes
 * a `>=` check and silently deforms the new art with the old offsets. Equal is also the common case, since
 * matching point counts are what make a swap look continuous.
 */
export interface Skeleton2DSlotDeform {
  /** The attachment these offsets were authored against. Compared, never followed. */
  attachment: Attachment2D | null;
  /**
   * The offset stream, addressed as the attachment stores its positions — two floats per INFLUENCE for a
   * weighted attachment, two per VERTEX for a rigid one. See `explainSkeleton2DDeformLength`.
   */
  offsets: Float32Array;
}
