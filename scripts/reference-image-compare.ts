// The CI adapter between `getBitmapMismatch` and the render-oracle join
// (agents/render-reference-image-repository.md §9, "Dimensions are a verdict, not a crash").
//
// ★ NO NEW COMPARISON ALGORITHM. `packages/bitmap/src/bitmapCompare.ts` already has it, it is tested,
// and §2 is explicit that none is missing. This file adds exactly one thing: it turns the primitive's
// correct-but-fatal precondition into a reportable row.
//
// ★ WHY THE THROW IS RIGHT AND STILL HAS TO BE CAUGHT HERE. `getBitmapMismatch` throws when the two
// bitmaps differ in size, and that is the right call for a library: comparing incompatible surfaces IS a
// programmer error. But a corpus run compares hundreds of cells in a loop, and one scene whose viewport
// changed would abort every cell after it — turning a single resized scene into an unexplained absence
// of four hundred results. The adapter therefore converts that one precondition into `dimensionMismatch`,
// which the join reports as `incomparable` and gates on. The library keeps its contract; CI keeps its
// corpus.
//
// ★ THE TOLERANCE IS NOT DEFAULTED HERE, ON PURPOSE. §2: `CAPTURE_PARITY_TOLERANCE` (15) and
// `CAPTURE_REGRESSION_TOLERANCE` (5) are mean-absolute differences in FINGERPRINT space — a mean over 256
// averaged cells. Pixel-space `fraction` and `maxChannelDelta` are different units over a different
// distribution, so copying either number across "would look principled and mean nothing". The caller
// passes a calibrated `channelTolerance` from a published comparison policy, and the calibration run that
// chooses it is part of the work, not a default anyone can inherit by accident.
import { getBitmapMismatch } from '../packages/bitmap/src/bitmapCompare.js';

export interface ReferenceImageCellComparison {
  /** From getBitmapMismatch. Do NOT inherit the fingerprint-space tolerances (§2). */
  fraction: number;
  maxChannelDelta: number;
  /** True when the two images differed in size; `fraction` and `maxChannelDelta` are then meaningless. */
  dimensionMismatch: boolean;
}

/**
 * The comparison primitive only observes these three bitmap fields.
 *
 * ★ `data` IS `ArrayLike<number>` BECAUSE THAT IS ALL THAT IS READ. `getBitmapMismatch` touches
 * `data.length` and `data[i]` and nothing else, so naming a concrete typed array here would be a claim
 * the code does not make — and it was the wrong one: a decoded PNG arrives as `Uint8Array` while a
 * `Bitmap` carries `Uint8ClampedArray`, which is not assignable to it. That mismatch made every caller
 * holding a real `Bitmap` a type error even though the comparison is identical for both.
 */
export interface ReferenceImageBitmap {
  width: number;
  height: number;
  data: ArrayLike<number>;
}

/**
 * Compares a candidate render against its blessed reference, returning a verdict-shaped result even when
 * the two are incomparable. Never throws for a dimension difference; a genuinely unexpected error still
 * propagates, because an adapter that swallows everything would report a broken decoder as a clean run.
 */
export function compareOracleReference(
  reference: Readonly<ReferenceImageBitmap>,
  candidate: Readonly<ReferenceImageBitmap>,
  channelTolerance: number,
): ReferenceImageCellComparison {
  if (reference.width !== candidate.width || reference.height !== candidate.height) {
    // Checked BEFORE calling rather than caught after: catching would also swallow a future unrelated
    // throw from the primitive and label it a dimension mismatch, which is a wrong verdict rather than a
    // missing one — and a wrong verdict is the harder of the two to notice.
    return { dimensionMismatch: true, fraction: 0, maxChannelDelta: 0 };
  }
  const mismatch = getBitmapMismatch(reference, candidate, channelTolerance);
  return {
    dimensionMismatch: false,
    fraction: mismatch.fraction,
    maxChannelDelta: mismatch.maxChannelDelta,
  };
}
