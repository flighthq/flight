import { appendShapeBeginFill, appendShapeEndFill } from '@flighthq/shape/contract';
import type { LottieFillPaint, LottieFillShapeItem, LottieShapeItemContext } from '@flighthq/types/contract';

import {
  bindMutableLottieNumericProperty,
  initialLottieValue,
  lottieNumericValue,
  lottieRgba,
} from './lottieDocument.ts';
import { appendLottieShapePaths } from './lottieShapePaint.ts';

/**
 * The solid fill item, and the painter that draws it.
 *
 * ★ THE PAINTER TRAVELS WITH THE ITEM. `@flighthq/shape`'s fill builders are named here and nowhere else, so a build
 * that registers no fill links none of them — where the shape layer's old `switch (paint.kind)` named every builder of
 * every paint whatever a caller registered. The paint object stays the mutable description the animation bindings write
 * into; the closure just reads it at draw time, which is why an animated colour needs no rebinding of the painter.
 */
export function lottieFillShapeItemHandler(context: LottieShapeItemContext): void {
  const fill = context.item as Readonly<LottieFillShapeItem>;
  const color = lottieNumericValue(initialLottieValue(fill.c), 3);
  const opacity = [lottieNumericValue(initialLottieValue(fill.o), 1)[0] / 100];
  const paint: LottieFillPaint = {
    color,
    kind: 'fill',
    opacity: opacity[0],
    winding: fill.r === 2 ? 'evenOdd' : 'nonZero',
  };
  context.painters.push((shape, paths) => {
    appendShapeBeginFill(shape, lottieRgba(paint.color), paint.opacity);
    appendLottieShapePaths(paths, shape, paint.winding);
    appendShapeEndFill(shape);
  });
  bindMutableLottieNumericProperty(fill.c, color, (value) => value, context.rerender, context.import);
  bindMutableLottieNumericProperty(
    fill.o,
    opacity,
    (value) => value / 100,
    () => {
      paint.opacity = opacity[0];
      context.rerender();
    },
    context.import,
  );
}
