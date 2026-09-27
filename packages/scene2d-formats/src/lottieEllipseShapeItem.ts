import { appendPathEllipse, createPath } from '@flighthq/path/contract';
import type { LottieEllipseShapeItem, LottieShapeItemContext, Path } from '@flighthq/types/contract';

import { bindMutableLottieNumericProperty, initialLottieValue, lottieNumericValue } from './lottieDocument.ts';
import { applyLottieShapeDirection } from './lottieShapeGeometry.ts';

/**
 * Reads a Lottie ellipse: its static path, and the bindings that rebuild it when position or size animates.
 *
 * The same fusion as the rectangle — two `if (item.ty === 'el')` arms in two switch functions, now one module that
 * the registry reaches only for this kind. Lottie's `s` is a diameter pair, which is why both components are
 * halved here rather than at the call site.
 */
export function lottieEllipseShapeItemHandler(context: LottieShapeItemContext): void {
  const ellipse = context.item as Readonly<LottieEllipseShapeItem>;
  const position = lottieNumericValue(initialLottieValue(ellipse.p), 2);
  const size = lottieNumericValue(initialLottieValue(ellipse.s), 2);
  const build = (): Path => {
    const path = createPath();
    appendPathEllipse(path, position[0], position[1], size[0] / 2, size[1] / 2);
    return applyLottieShapeDirection(path, ellipse.d);
  };
  const pathIndex = context.paths.length;
  context.paths.push(build());
  const apply = (): void => {
    context.paths[pathIndex] = build();
    context.rerender();
  };
  bindMutableLottieNumericProperty(ellipse.p, position, (value) => value, apply, context.import);
  bindMutableLottieNumericProperty(ellipse.s, size, (value) => value, apply, context.import);
}
