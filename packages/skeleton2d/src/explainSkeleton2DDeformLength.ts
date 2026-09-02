import type { Skeleton2DDeformLengthExplanation, Skin2D } from '@flighthq/types/contract';

// Answers, as plain data, why a deform offset stream was applied or ignored — the shakeable query paired
// with the silent sentinel in `skinSkeleton2DAttachmentPoints`. The guard reports THAT a mismatch happened;
// this reports what the length should have been, which is what a caller needs in order to fix it.
//
// It takes the SAME two inputs the skinning primitive dispatches on — the skin and the setup vertices —
// rather than an attachment. That is deliberate: every deformable attachment reduces to those two, so this
// cannot drift as attachment kinds are added, and it answers the question for a kind it has never heard of.
//
// The number that surprises is the weighted one: offsets are addressed PER INFLUENCE, not per vertex, so a
// mesh whose vertices average three bones needs three times the stream a per-vertex reading predicts. An
// importer sizing from vertex count is the mistake this exists to name.
export function explainSkeleton2DDeformLength(
  skin: Readonly<Skin2D> | null | undefined,
  vertices: Readonly<Float32Array> | null | undefined,
  deform: Readonly<Float32Array> | null,
): Skeleton2DDeformLengthExplanation {
  const weighted = skin !== null && skin !== undefined;
  const addressed = weighted ? skin.influences.length / 2 : (vertices?.length ?? 0);
  const offsets = deform === null ? 0 : deform.length;
  return {
    accepted: deform !== null && offsets === addressed,
    addressed,
    addressing: weighted ? 'weighted' : 'rigid',
    offsets,
  };
}
