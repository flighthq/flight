import { createClipRegionFromPath } from '@flighthq/clip/contract';
import type { LottieMaskContext } from '@flighthq/types/contract';

import {
  createLottieBezierPath,
  flattenLottieShapePath,
  toLottieShapePath,
  unflattenLottieShapePath,
} from './lottieBezierPath.ts';
import { initialLottieValue, isAnimatedLottieProperty } from './lottieDocument.ts';
import { appendLottieShapePathChannels } from './lottieShapePathChannels.ts';

/**
 * Lowers a layer's masks onto Flight's hard clip region.
 *
 * ★ ONLY A LONE ADDITIVE, NON-INVERTED MASK LOWERS. Composed modes, inversion and feather are uncarried — see
 * agents/scene2d-format-coverage.md — and a document that asks for one is left unmasked rather than wrongly masked.
 * The guard lives here rather than in the walk because it is this handler's interpretation of what it can carry: the
 * walk only knows the mode it dispatched on.
 */
export function lottieAdditiveMaskHandler(context: LottieMaskContext): void {
  const active = context.masks;
  const first = active[0];
  if (first === undefined || first.mode !== 'a' || first.inv === true || active.length > 1) return;
  const initial = toLottieShapePath(initialLottieValue(first.pt));
  if (initial === undefined) return;
  const target = context.target;
  target.clip = createClipRegionFromPath(createLottieBezierPath(initial));
  if (isAnimatedLottieProperty(first.pt)) {
    const current = flattenLottieShapePath(initial);
    appendLottieShapePathChannels(
      first.pt.k,
      current,
      () => {
        target.clip = createClipRegionFromPath(createLottieBezierPath(unflattenLottieShapePath(initial, current)));
      },
      context.import,
    );
  }
}
