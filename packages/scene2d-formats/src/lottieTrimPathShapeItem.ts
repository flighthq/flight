import { createPath, dashPath, getPathLength } from '@flighthq/path/contract';
import type { LottieShapeItemContext, LottieTrimPathShapeItem } from '@flighthq/types/contract';

import {
  initialLottieValue,
  isAnimatedLottieProperty,
  lottieNumericValue,
  reportLottieSkip,
} from './lottieDocument.ts';

/**
 * The trim-path item: the arc of each path in the group that stays visible.
 *
 * ★ THE TRIM IS A POST-WALK MODIFIER, WHICH IS WHY IT IS A CLOSURE. It reshapes every path in its group, including the
 * ones declared after it, so it cannot do its work while its own item is being read — and that is why the trimming used
 * to live in the shape layer, putting `dashPath`, `createPath` and `getPathLength` into every build that read a shape
 * layer whether or not the caller registered this item. The handler now pushes a modifier and the layer only runs it.
 *
 * ★ ONE TRIM PER GROUP, CLAIMED RATHER THAN COUNTED. Lottie applies a group's trim once; a second trim item is ignored,
 * not composed, which is what the reading in the shape layer did when it took `items.find`. The claim keeps that rule
 * here: the first trim takes `LOTTIE_TRIM_CLAIM` out of the group's claim set and a later one finds it taken and does
 * nothing. The layer still runs every modifier it is given and knows nothing about trims.
 *
 * ANIMATED TRIM IS UNCARRIED. Flight trims once, at import, so a keyframed start, end or offset is reported as a skip
 * and the paths are left whole — a partially-applied trim that never moves would be worse than an untrimmed path.
 *
 * Lottie's units: start and end are PERCENT along the path, offset is DEGREES of rotation around it.
 */
export function lottieTrimPathShapeItemHandler(context: LottieShapeItemContext): void {
  const trim = context.item as Readonly<LottieTrimPathShapeItem>;
  // Claimed BEFORE the animated check, because a group whose first trim is animated has still had its trim decided:
  // the skip is reported once and a later static trim does not quietly take over.
  if (context.claims.has(LOTTIE_TRIM_CLAIM)) return;
  context.claims.add(LOTTIE_TRIM_CLAIM);
  if (isAnimatedLottieProperty(trim.s) || isAnimatedLottieProperty(trim.e) || isAnimatedLottieProperty(trim.o)) {
    reportLottieSkip(context.import, 'lottie.unsupported-shape-modifier', 'lottieTrimPathShapeItemHandler', {
      modifier: context.item.ty,
    });
    return;
  }
  const start = lottieNumericValue(initialLottieValue(trim.s), 1)[0] / 100;
  const end = lottieNumericValue(initialLottieValue(trim.e), 1)[0] / 100;
  const offset = lottieNumericValue(initialLottieValue(trim.o), 1)[0] / 360;
  // A trim that wraps the whole path shows all of it, and so does one whose span covers a full turn.
  let visible = (((end - start) % 1) + 1) % 1;
  if (Math.abs(end - start) >= 1) visible = 1;
  if (visible >= 1) return;

  context.modifiers.push((paths) => {
    for (let index = 0; index < paths.length; index++) {
      const path = paths[index];
      const length = getPathLength(path);
      const trimmed = createPath(path.winding);
      // A zero-length path has no arc to keep, and a zero visible span keeps nothing: both leave an empty path rather
      // than the original, because the trim asked for none of it.
      if (length > 0 && visible > 0) {
        dashPath(path, [visible * length, (1 - visible) * length], (start + offset) * length, trimmed);
      }
      paths[index] = trimmed;
    }
  });
}

const LOTTIE_TRIM_CLAIM = 'lottie.trimPath';
