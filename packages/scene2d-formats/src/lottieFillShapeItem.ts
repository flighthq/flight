import type { LottieFillPaint, LottieFillShapeItem, LottieShapeItemContext } from '@flighthq/types/contract';

import { bindMutableLottieNumericProperty, initialLottieValue, lottieNumericValue } from './lottieDocument.ts';
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
  context.paints.push(paint);
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
