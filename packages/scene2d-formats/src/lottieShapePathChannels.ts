import { createAnimationChannel } from '@flighthq/animation/contract';
import type {
  LottieImportContext,
  LottieKeyframe,
  LottieMutableAnimationTarget,
  LottieShapePath,
} from '@flighthq/types/contract';

import { flattenLottieShapePath, toLottieShapePath } from './lottieBezierPath.ts';
import { createLottieTrack, hasComponentSpecificLottieEasing, reportLottieDrop } from './lottieDocument.ts';

/**
 * Builds the animation channels a bezier path's keyframes drive.
 *
 * ★ TWO OWNERS, AND NEITHER IS THE CORE. The path shape item animates its own outline; the additive mask animates the
 * outline it clips with. Both need the core's track machinery, but the core needs neither of them — and while this
 * lived in `lottieDocument.ts` the core imported the bezier reader, so a document of null and image layers linked
 * path flattening it could never reach.
 *
 * A keyframe whose flattened length differs from the first is DROPPED rather than sampled: Lottie permits a path to
 * change vertex count between keyframes, and Flight's tracks are fixed-width, so interpolating would silently pair
 * unrelated vertices.
 */
export function appendLottieShapePathChannels(
  keyframes: readonly Readonly<LottieKeyframe<LottieShapePath>>[],
  current: number[],
  apply: () => void,
  context: LottieImportContext,
): void {
  if (keyframes.length === 0) return;
  if (
    keyframes.some((keyframe) => {
      const value = toLottieShapePath(keyframe.s ?? keyframe.e);
      return value !== undefined && flattenLottieShapePath(value).length !== current.length;
    })
  ) {
    reportLottieDrop(context, 'lottie.incompatible-animated-shape-path', 'appendLottieShapePathChannels');
    return;
  }
  if (hasComponentSpecificLottieEasing(keyframes, current.length)) {
    for (let component = 0; component < current.length; component++) {
      context.channels.push(
        createAnimationChannel(
          createLottieTrack(
            keyframes,
            1,
            context,
            (value) => [
              flattenLottieShapePath(toLottieShapePath(value ?? keyframes[0].s)!)[component] ?? current[component],
            ],
            component,
          ),
          {
            lottieApply(sample) {
              current[component] = sample[0];
              apply();
            },
          } satisfies LottieMutableAnimationTarget,
        ),
      );
    }
    return;
  }
  context.channels.push(
    createAnimationChannel(
      createLottieTrack(
        keyframes,
        current.length,
        context,
        (value) => flattenLottieShapePath(toLottieShapePath(value ?? keyframes[0].s)!),
        0,
      ),
      {
        lottieApply(sample) {
          for (let index = 0; index < current.length; index++) current[index] = sample[index];
          apply();
        },
      } satisfies LottieMutableAnimationTarget,
    ),
  );
}
