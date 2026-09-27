import { appendPathRectangle, appendPathRoundedRectangle, createPath } from '@flighthq/path/contract';
import type { LottieRectangleShapeItem, LottieShapeItemContext, Path } from '@flighthq/types/contract';

import { bindMutableLottieNumericProperty, initialLottieValue, lottieNumericValue } from './lottieDocument.ts';
import { applyLottieShapeDirection } from './lottieShapeGeometry.ts';

/**
 * Reads a Lottie rectangle: its static path, and the bindings that rebuild that path when the document animates
 * position, size or corner radius.
 *
 * ★ ONE TYPE, ONE MODULE, BOTH HALVES. The static build used to be a branch of `createLottieShapeItemPath` and the
 * animated rebuild a branch of `bindLottieGeometryItem` — two `if (item.ty === 'rc')` arms in two functions in a
 * 1,800-line file, with the other three geometry types' arms beside them. The registry already dispatches by kind,
 * so both switches were re-deciding what the caller had decided; fusing the arms here is what makes a build that
 * names only this item link only this item's geometry.
 *
 * The three value arrays are shared between the initial build and the rebuild, which is the same state the two
 * switches each derived separately from the same source.
 */
export function lottieRectangleShapeItemHandler(context: LottieShapeItemContext): void {
  const rectangle = context.item as Readonly<LottieRectangleShapeItem>;
  const position = lottieNumericValue(initialLottieValue(rectangle.p), 2);
  const size = lottieNumericValue(initialLottieValue(rectangle.s), 2);
  const radius = [lottieNumericValue(initialLottieValue(rectangle.r), 1)[0]];
  const build = (): Path => {
    const path = createPath();
    if (radius[0] > 0) {
      appendPathRoundedRectangle(
        path,
        position[0] - size[0] / 2,
        position[1] - size[1] / 2,
        size[0],
        size[1],
        radius[0],
      );
    } else {
      appendPathRectangle(path, position[0] - size[0] / 2, position[1] - size[1] / 2, size[0], size[1]);
    }
    return applyLottieShapeDirection(path, rectangle.d);
  };
  const pathIndex = context.paths.length;
  context.paths.push(build());
  const apply = (): void => {
    context.paths[pathIndex] = build();
    context.rerender();
  };
  bindMutableLottieNumericProperty(rectangle.p, position, (value) => value, apply, context.import);
  bindMutableLottieNumericProperty(rectangle.s, size, (value) => value, apply, context.import);
  bindMutableLottieNumericProperty(rectangle.r, radius, (value) => value, apply, context.import);
}
