/**
 * Why a deform offset stream was applied or ignored, as plain data — the shakeable `explain*` query paired
 * with the silent sentinel in `skinSkeleton2DAttachmentPoints`. The guard says a mismatch happened; this
 * says what the correct length would have been, which is the part a caller needs to fix it.
 *
 * `addressed` is the float count the attachment's own storage implies. The number that surprises people is
 * the weighted one: offsets are addressed per INFLUENCE, not per vertex, so a mesh whose vertices average
 * three bones needs three times the stream a per-vertex reading predicts. `addressing` names which rule
 * produced it, because reading the wrong one is the mistake this exists to catch.
 */
export interface Skeleton2DDeformLengthExplanation {
  /** True when the stream is long enough and the deform is applied. */
  accepted: boolean;
  /** `'weighted'` (per influence) or `'rigid'` (per vertex). */
  addressing: string;
  /** How many floats the attachment's storage addresses. */
  addressed: number;
  /** How many the offset stream carries. 0 for no stream at all. */
  offsets: number;
}
